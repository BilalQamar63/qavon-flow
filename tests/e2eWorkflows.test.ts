import { v2 as cloudinary } from 'cloudinary';
import crypto from 'node:crypto';
import fs from 'node:fs';
import type http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-e2e-'));
const tempDbPath = path.join(tempRoot, 'hub-e2e.db');
const tempLegacyDir = path.join(tempRoot, 'legacy-uploads');

// Isolate SQLite DB and legacy seed path for this E2E suite before loading server config/routes
process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = tempDbPath;
process.env.LEGACY_UPLOAD_DIR = tempLegacyDir;
process.env.MAX_UPLOAD_MB = '15';
delete process.env.CLOUDINARY_CLOUD_NAME;
delete process.env.CLOUDINARY_API_KEY;
delete process.env.CLOUDINARY_API_SECRET;

function extractCookie(setCookieHeader: string | null): string {
  if (!setCookieHeader) return '';
  return setCookieHeader.split(';')[0] || '';
}

function extractTokenParam(urlStr: string, paramName: string): string {
  const parsed = new URL(urlStr);
  return parsed.searchParams.get(paramName) || '';
}

describe('End-to-End HTTP Workflows (Auth, Agency, Portal, Assets, Dashboard, Errors)', () => {
  let server: http.Server;
  let baseUrl = '';
  let adminCookie = '';
  let memberCookie = '';
  let clientCookie = '';
  let createdClientId = '';
  let createdCredId = '';
  let uploadedLogoId = '';
  let signedAssetUrl = '';

  let getDbFn: typeof import('../server/db/database.ts').getDb;
  let signPayloadFn: typeof import('../server/security/crypto.ts').signPayload;
  let hashTokenFn: typeof import('../server/security/crypto.ts').hashToken;
  let generateSecureTokenFn: typeof import('../server/security/crypto.ts').generateSecureToken;

  beforeAll(async () => {
    const [{ createApp }, dbMod, cryptoMod] = await Promise.all([
      import('../server.ts'),
      import('../server/db/database.ts'),
      import('../server/security/crypto.ts'),
    ]);
    getDbFn = dbMod.getDb;
    signPayloadFn = cryptoMod.signPayload;
    hashTokenFn = cryptoMod.hashToken;
    generateSecureTokenFn = cryptoMod.generateSecureToken;

    const app = await createApp();
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          baseUrl = `http://127.0.0.1:${addr.port}`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      if (!server) {
        resolve();
        return;
      }
      server.close(() => resolve());
    });
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  async function apiJson<T = Record<string, unknown>>(
    urlPath: string,
    opts: {
      method?: string;
      cookie?: string;
      body?: unknown;
      headers?: Record<string, string>;
    } = {},
  ): Promise<{ status: number; headers: Headers; data: T }> {
    const headers: Record<string, string> = { ...(opts.headers || {}) };
    if (opts.cookie) headers.Cookie = opts.cookie;
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

    const res = await fetch(`${baseUrl}${urlPath}`, {
      method: opts.method || 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    const text = await res.text();
    const data = (text ? JSON.parse(text) : {}) as T;
    return { status: res.status, headers: res.headers, data };
  }

  describe('1. Health, Error Handling & Environment Guardrails', () => {
    it('verifies /api/health checks live SQLite connectivity', async () => {
      const res = await apiJson<{ ok: boolean }>('/api/health');
      expect(res.status).toBe(200);
      expect(res.data.ok).toBe(true);
    });

    it('rejects unauthenticated access to protected endpoints', async () => {
      const meRes = await apiJson('/api/auth/me');
      expect(meRes.status).toBe(401);
      const dashRes = await apiJson('/api/dashboard/overview');
      expect(dashRes.status).toBe(401);
    });

    it('blocks cross-origin state-changing requests via Origin validation', async () => {
      const csrfRes = await apiJson('/api/auth/request-magic-link', {
        method: 'POST',
        headers: { Origin: 'https://malicious.example.com' },
        body: { email: 'alex@studioamber.co' },
      });
      expect(csrfRes.status).toBe(403);
    });

    it('validates invalid email and missing required fields cleanly', async () => {
      const badEmail = await apiJson<{ error: string }>('/api/auth/request-magic-link', {
        method: 'POST',
        body: { email: 'not-an-email' },
      });
      expect(badEmail.status).toBe(400);
      expect(badEmail.data.error).toBeTruthy();

      const badReg = await apiJson<{ error: string }>('/api/auth/register-agency', {
        method: 'POST',
        body: { agencyName: '', ownerName: 'A', email: 'bad' },
      });
      expect(badReg.status).toBe(400);
    });

    it('surfaces invalid custom database path errors cleanly rather than failing silently', async () => {
      const invalidPath = path.join(tempDbPath, 'cannot-open-dir-under-file.db');
      await expect(getDbFn(invalidPath)).rejects.toThrow();
    });
  });

  describe('2. Authentication (Magic-Link, Replay, Expiry, Logout, Session Expiration)', () => {
    it('completes agency login via magic link, rejects replay, and supports logout revocation', async () => {
      const reqLink = await apiJson<{ ok: boolean; previewMagicUrl?: string }>(
        '/api/auth/request-magic-link',
        {
          method: 'POST',
          body: { email: 'alex@studioamber.co' },
        },
      );
      expect(reqLink.status).toBe(200);
      expect(reqLink.data.ok).toBe(true);
      expect(reqLink.data.previewMagicUrl).toContain('magicToken=');

      const token = extractTokenParam(reqLink.data.previewMagicUrl!, 'magicToken');
      const verify = await apiJson<{ user: { email: string; role: string } }>('/api/auth/verify', {
        method: 'POST',
        body: { token },
      });
      expect(verify.status).toBe(200);
      expect(verify.data.user.email).toBe('alex@studioamber.co');
      expect(verify.data.user.role).toBe('admin');

      const sessionCookie = extractCookie(verify.headers.get('set-cookie'));
      expect(sessionCookie).toContain('hub_session=');

      // Replay of single-use magic link must fail
      const replay = await apiJson('/api/auth/verify', {
        method: 'POST',
        body: { token },
      });
      expect(replay.status).toBe(401);

      // Authenticated /api/auth/me works
      const me = await apiJson<{ user: { email: string } }>('/api/auth/me', {
        cookie: sessionCookie,
      });
      expect(me.status).toBe(200);
      expect(me.data.user.email).toBe('alex@studioamber.co');

      // Logout revokes session JTI immediately
      const logout = await apiJson('/api/auth/logout', {
        method: 'POST',
        cookie: sessionCookie,
      });
      expect(logout.status).toBe(200);

      // Using the old cookie after logout must return 401
      const afterLogout = await apiJson('/api/auth/me', { cookie: sessionCookie });
      expect(afterLogout.status).toBe(401);
    });

    it('rejects expired magic-link tokens and expired session JWT cookies', async () => {
      const db = await getDbFn();
      const rawExpired = generateSecureTokenFn(32);
      const pastIso = new Date(Date.now() - 60_000).toISOString();
      await db.run(
        `INSERT INTO auth_tokens (id, user_id, token_hash, expires_at, created_at)
         VALUES (?, 'user-alex-admin', ?, ?, ?)`,
        crypto.randomUUID(),
        hashTokenFn(rawExpired),
        pastIso,
        pastIso,
      );

      const verifyExpired = await apiJson('/api/auth/verify', {
        method: 'POST',
        body: { token: rawExpired },
      });
      expect(verifyExpired.status).toBe(401);

      // Expired session cookie
      const expiredJwt = signPayloadFn(
        {
          jti: crypto.randomUUID(),
          sv: 1,
          userId: 'user-alex-admin',
          agencyId: 'agency-studio-amber',
          role: 'admin',
          name: 'Alex Mercer',
          email: 'alex@studioamber.co',
        },
        -30,
      );
      const expiredSessionRes = await apiJson('/api/auth/me', {
        cookie: `hub_session=${encodeURIComponent(expiredJwt)}`,
      });
      expect(expiredSessionRes.status).toBe(401);
    });

    it('authenticates fresh admin and team member sessions for downstream tests', async () => {
      // Admin session
      const r1 = await apiJson<{ previewMagicUrl?: string }>('/api/auth/request-magic-link', {
        method: 'POST',
        body: { email: 'alex@studioamber.co' },
      });
      const v1 = await apiJson('/api/auth/verify', {
        method: 'POST',
        body: { token: extractTokenParam(r1.data.previewMagicUrl!, 'magicToken') },
      });
      adminCookie = extractCookie(v1.headers.get('set-cookie'));
      expect(adminCookie).toContain('hub_session=');

      // Team member session (Maya)
      const r2 = await apiJson<{ previewMagicUrl?: string }>('/api/auth/request-magic-link', {
        method: 'POST',
        body: { email: 'maya@studioamber.co' },
      });
      const v2 = await apiJson('/api/auth/verify', {
        method: 'POST',
        body: { token: extractTokenParam(r2.data.previewMagicUrl!, 'magicToken') },
      });
      memberCookie = extractCookie(v2.headers.get('set-cookie'));
      expect(memberCookie).toContain('hub_session=');
    });
  });

  describe('3. Agency Client Operations (CRUD, Search, Filter, Assign, Archive, Permissions)', () => {
    let archivedClientId = '';

    it('rejects missing required fields or invalid email on client creation', async () => {
      const res = await apiJson('/api/clients', {
        method: 'POST',
        cookie: adminCookie,
        body: {
          companyName: 'X',
          contactName: '',
          email: 'bad-email',
          industry: '',
        },
      });
      expect(res.status).toBe(400);
    });

    it('creates a client, edits details, assigns a team member, searches, filters, and views detail', async () => {
      const createRes = await apiJson<{ client: { id: string; companyName: string; status: string } }>(
        '/api/clients',
        {
          method: 'POST',
          cookie: adminCookie,
          body: {
            companyName: 'Beacon Health Systems',
            contactName: 'Priya Patel',
            email: 'priya@beaconhealth.io',
            phone: '+1 (512) 555-0190',
            website: 'https://beaconhealth.io',
            industry: 'Digital Health',
            description: 'Telehealth clinic platform redesign',
            internalNotes: 'Confidential internal margin note',
          },
        },
      );
      expect(createRes.status).toBe(201);
      createdClientId = createRes.data.client.id;
      expect(createRes.data.client.status).toBe('pending');

      // Assign team member Maya and update phone
      const patchRes = await apiJson<{ client: { assignedToId: string; phone: string } }>(
        `/api/clients/${createdClientId}`,
        {
          method: 'PATCH',
          cookie: adminCookie,
          body: { assignedToId: 'user-maya-member', phone: '+1 (512) 555-0199' },
        },
      );
      expect(patchRes.status).toBe(200);
      expect(patchRes.data.client.assignedToId).toBe('user-maya-member');
      expect(patchRes.data.client.phone).toBe('+1 (512) 555-0199');

      // Search clients
      const searchRes = await apiJson<{ clients: { id: string }[] }>(
        '/api/clients?search=Beacon&status=all',
        { cookie: adminCookie },
      );
      expect(searchRes.status).toBe(200);
      expect(searchRes.data.clients.map((c) => c.id)).toContain(createdClientId);

      // Filter by status=pending
      const filterRes = await apiJson<{ clients: { id: string }[] }>(
        '/api/clients?status=pending',
        { cookie: adminCookie },
      );
      expect(filterRes.status).toBe(200);
      expect(filterRes.data.clients.map((c) => c.id)).toContain(createdClientId);

      // View client detail
      const detailRes = await apiJson<{ client: { id: string }; activity: unknown[] }>(
        `/api/clients/${createdClientId}`,
        { cookie: adminCookie },
      );
      expect(detailRes.status).toBe(200);
      expect(detailRes.data.client.id).toBe(createdClientId);
      expect(detailRes.data.activity.length).toBeGreaterThan(0);

      // Member role scoping: Maya sees assigned Beacon Health, cannot access unassigned Verve
      const memberList = await apiJson<{ clients: { id: string }[] }>('/api/clients?status=all', {
        cookie: memberCookie,
      });
      expect(memberList.status).toBe(200);
      expect(memberList.data.clients.map((c) => c.id)).toContain(createdClientId);
      expect(memberList.data.clients.map((c) => c.id)).not.toContain('client-verve');

      const memberDenied = await apiJson('/api/clients/client-verve', { cookie: memberCookie });
      expect(memberDenied.status).toBe(403);
    });

    it('archives a client and excludes it from active list while preserving it in archived filter', async () => {
      const tempCreate = await apiJson<{ client: { id: string } }>('/api/clients', {
        method: 'POST',
        cookie: adminCookie,
        body: {
          companyName: 'Temporary Archive Co',
          contactName: 'Dan Lee',
          email: 'dan@temparchive.co',
          industry: 'Retail',
        },
      });
      expect(tempCreate.status).toBe(201);
      archivedClientId = tempCreate.data.client.id;

      const archiveRes = await apiJson(`/api/clients/${archivedClientId}`, {
        method: 'DELETE',
        cookie: adminCookie,
      });
      expect(archiveRes.status).toBe(200);

      const activeList = await apiJson<{ clients: { id: string }[] }>('/api/clients?status=all', {
        cookie: adminCookie,
      });
      expect(activeList.data.clients.map((c) => c.id)).not.toContain(archivedClientId);

      const archivedList = await apiJson<{ clients: { id: string }[] }>(
        '/api/clients?status=archived',
        { cookie: adminCookie },
      );
      expect(archivedList.data.clients.map((c) => c.id)).toContain(archivedClientId);
    });
  });

  describe('4. Invitations (Expired, Revoked, Resend, Accept)', () => {
    it('enforces revoked and expired invitation guards and allows client login on fresh invite', async () => {
      // 1. Create invitation and revoke it
      const inv1 = await apiJson<{
        invitation: { id: string; portalPreviewUrl?: string };
      }>('/api/invitations', {
        method: 'POST',
        cookie: adminCookie,
        body: { clientId: createdClientId, expiresInDays: 7, sendEmail: true },
      });
      expect(inv1.status).toBe(201);
      const revokedToken = extractTokenParam(inv1.data.invitation.portalPreviewUrl!, 'portalToken');

      const revokeRes = await apiJson(`/api/invitations/${inv1.data.invitation.id}/revoke`, {
        method: 'POST',
        cookie: adminCookie,
      });
      expect(revokeRes.status).toBe(200);

      const acceptRevoked = await apiJson('/api/invitations/accept', {
        method: 'POST',
        body: { token: revokedToken },
      });
      expect(acceptRevoked.status).toBe(403);

      // 2. Insert an expired invitation directly and verify acceptance returns 401
      const db = await getDbFn();
      const expiredInviteToken = generateSecureTokenFn(32);
      const expiredId = crypto.randomUUID();
      const pastIso = new Date(Date.now() - 86400_000).toISOString();
      await db.run(
        `INSERT INTO invitations (id, agency_id, client_id, email, token_hash, status, expires_at, sent_at, created_at)
         VALUES (?, 'agency-studio-amber', ?, 'priya@beaconhealth.io', ?, 'sent', ?, ?, ?)`,
        expiredId,
        createdClientId,
        hashTokenFn(expiredInviteToken),
        pastIso,
        pastIso,
        pastIso,
      );

      const acceptExpired = await apiJson('/api/invitations/accept', {
        method: 'POST',
        body: { token: expiredInviteToken },
      });
      expect(acceptExpired.status).toBe(401);

      const expiredRow = (await db.get<{ status: string }>(
        'SELECT status FROM invitations WHERE id = ?',
        expiredId,
      ))!;
      expect(expiredRow.status).toBe('expired');

      // 3. Issue valid invitation and resend it; accept resent token
      const inv2 = await apiJson<{
        invitation: { id: string; portalPreviewUrl?: string };
      }>('/api/invitations', {
        method: 'POST',
        cookie: adminCookie,
        body: { clientId: createdClientId, expiresInDays: 14, sendEmail: true },
      });
      expect(inv2.status).toBe(201);

      const resend = await apiJson<{ portalPreviewUrl?: string }>(
        `/api/invitations/${inv2.data.invitation.id}/resend`,
        { method: 'POST', cookie: adminCookie },
      );
      expect(resend.status).toBe(200);
      const activePortalToken = extractTokenParam(resend.data.portalPreviewUrl!, 'portalToken');

      const acceptRes = await apiJson<{ user: { role: string; clientId: string } }>(
        '/api/invitations/accept',
        {
          method: 'POST',
          body: { token: activePortalToken },
        },
      );
      expect(acceptRes.status).toBe(200);
      expect(acceptRes.data.user.role).toBe('client');
      expect(acceptRes.data.user.clientId).toBe(createdClientId);

      clientCookie = extractCookie(acceptRes.headers.get('set-cookie'));
      expect(clientCookie).toContain('hub_session=');
    });
  });

  describe('5. Assets (Upload, Validation, Security, Preview, Download, Delete, Permissions)', () => {
    const validPngBytes = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    ]);

    async function uploadMultipart(
      cookie: string,
      clientId: string,
      category: string,
      filename: string,
      mimeType: string,
      bytes: Uint8Array,
    ) {
      const form = new FormData();
      form.append('clientId', clientId);
      form.append('category', category);
      form.append('file', new Blob([new Uint8Array(bytes)], { type: mimeType }), filename);

      const res = await fetch(`${baseUrl}/api/assets/upload`, {
        method: 'POST',
        headers: { Cookie: cookie },
        body: form,
      });
      const text = await res.text();
      return { status: res.status, data: (text ? JSON.parse(text) : {}) as Record<string, unknown> };
    }

    it('rejects disallowed MIME types, spoofed extensions, XSS SVGs, and oversized files', async () => {
      // Disallowed MIME
      const badMime = await uploadMultipart(
        clientCookie,
        createdClientId,
        'primary_logo',
        'page.html',
        'text/html',
        Buffer.from('<h1>hi</h1>'),
      );
      expect(badMime.status).toBe(400);

      // Spoofed PNG magic bytes (PE executable header)
      const spoofedPng = await uploadMultipart(
        clientCookie,
        createdClientId,
        'primary_logo',
        'fake.png',
        'image/png',
        Buffer.from('MZ\x90\x00not-a-png-payload'),
      );
      expect(spoofedPng.status).toBe(400);

      // SVG XSS payload
      const xssSvg = await uploadMultipart(
        clientCookie,
        createdClientId,
        'primary_logo',
        'evil.svg',
        'image/svg+xml',
        Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
      );
      expect(xssSvg.status).toBe(400);

      // Oversized file (> 15 MB)
      const oversized = await uploadMultipart(
        clientCookie,
        createdClientId,
        'additional_document',
        'huge.txt',
        'text/plain',
        Buffer.alloc(15 * 1024 * 1024 + 512, 0x41),
      );
      expect(oversized.status).toBe(413);
    });

    it('returns HTTP 503 cleanly without leaking secrets when CLOUDINARY_* env vars are missing', async () => {
      delete process.env.CLOUDINARY_CLOUD_NAME;
      delete process.env.CLOUDINARY_API_KEY;
      delete process.env.CLOUDINARY_API_SECRET;

      const missingCfgRes = await uploadMultipart(
        clientCookie,
        createdClientId,
        'primary_logo',
        'beacon-logo.png',
        'image/png',
        validPngBytes,
      );
      expect(missingCfgRes.status).toBe(503);
      expect(String(missingCfgRes.data.error)).toContain('CLOUDINARY_CLOUD_NAME');
    });

    it('uploads valid PNG & SVG to Cloudinary orchestration, previews/downloads via signed URLs, edits metadata (PATCH), replaces file (PUT), enforces permissions, and deletes', async () => {
      // Configure test Cloudinary credentials and in-memory object store stub
      process.env.CLOUDINARY_CLOUD_NAME = 'e2e-test-cloud';
      process.env.CLOUDINARY_API_KEY = '999888777666';
      process.env.CLOUDINARY_API_SECRET = 'e2e-secret-never-exposed';

      const inMemoryCloudObjects = new Map<string, { buf: Buffer; mime: string }>();

      const uploadSpy = vi
        .spyOn(cloudinary.uploader, 'upload_stream')
        .mockImplementation(((
          options: Record<string, unknown>,
          cb?: (err: unknown, res?: Record<string, unknown>) => void,
        ) => {
          const publicId = `${String(options.folder || '')}/${String(options.public_id || '')}`;
          const resourceType = String(options.resource_type || 'raw');
          return {
            end(buf: Buffer) {
              inMemoryCloudObjects.set(publicId, {
                buf: Buffer.from(buf),
                mime: resourceType === 'image' ? 'image/png' : 'application/octet-stream',
              });
              cb?.(null, {
                public_id: publicId,
                asset_id: `cld-${crypto.randomUUID().slice(0, 8)}`,
                resource_type: resourceType,
                secure_url: `https://res.cloudinary.com/e2e-test-cloud/${resourceType}/authenticated/${publicId}`,
                format: path.extname(publicId).replace('.', '') || 'png',
                bytes: buf.byteLength,
              });
            },
          };
        }) as never);

      const destroySpy = vi
        .spyOn(cloudinary.uploader, 'destroy')
        .mockImplementation((async (publicId: string) => {
          inMemoryCloudObjects.delete(publicId);
          return { result: 'ok' };
        }) as never);

      const realFetch = globalThis.fetch;
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockImplementation((async (input: RequestInfo | URL, init?: RequestInit) => {
          const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
          if (
            urlStr.startsWith('https://res.cloudinary.com/') ||
            urlStr.startsWith('https://api.cloudinary.com/')
          ) {
            for (const [pid, obj] of inMemoryCloudObjects.entries()) {
              if (urlStr.includes(pid) || urlStr.includes(encodeURIComponent(pid))) {
                return new Response(new Uint8Array(obj.buf), {
                  status: 200,
                  headers: { 'Content-Type': obj.mime },
                });
              }
            }
            return new Response(null, { status: 404 });
          }
          return realFetch(input, init);
        }) as typeof fetch);

      try {
        // Upload required primary_logo PNG
        const logoUpload = await uploadMultipart(
          clientCookie,
          createdClientId,
          'primary_logo',
          'beacon-logo.png',
          'image/png',
          validPngBytes,
        );
        expect(logoUpload.status).toBe(201);
        const uploadedAsset = logoUpload.data.asset as {
          id: string;
          storageProvider: string;
          sectionKey: string;
        };
        uploadedLogoId = uploadedAsset.id;
        expect(uploadedAsset.storageProvider).toBe('cloudinary');
        expect(uploadedAsset.sectionKey).toBe('brand_assets');

        // Upload secondary SVG to test inline preview, PATCH, PUT replacement, and deletion
        const svgBytes = Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><circle cx="32" cy="32" r="28" fill="#EDA320"/></svg>',
        );
        const secondaryUpload = await uploadMultipart(
          clientCookie,
          createdClientId,
          'secondary_logo',
          'beacon-mark.svg',
          'image/svg+xml',
          svgBytes,
        );
        expect(secondaryUpload.status).toBe(201);
        const secondaryId = (secondaryUpload.data.asset as { id: string }).id;

        // Cross-client upload/delete/token denied for client session
        const wrongClientUpload = await uploadMultipart(
          clientCookie,
          'client-northstar',
          'primary_logo',
          'intrude.png',
          'image/png',
          validPngBytes,
        );
        expect(wrongClientUpload.status).toBe(403);

        // GET /api/assets/:id returns metadata + signed URLs without exposing API secret
        const detailAsset = await apiJson<{
          asset: { id: string; originalName: string };
          previewUrl: string;
          cloudinarySignedUrls?: { previewUrl: string; downloadUrl: string };
        }>(`/api/assets/${uploadedLogoId}`, { cookie: clientCookie });
        expect(detailAsset.status).toBe(200);
        expect(detailAsset.data.asset.id).toBe(uploadedLogoId);
        expect(detailAsset.data.cloudinarySignedUrls?.previewUrl).toContain('e2e-test-cloud');
        expect(JSON.stringify(detailAsset.data)).not.toContain('e2e-secret-never-exposed');

        // PATCH /api/assets/:id updates metadata
        const patchMeta = await apiJson<{
          asset: { originalName: string; description: string };
        }>(`/api/assets/${secondaryId}`, {
          method: 'PATCH',
          cookie: clientCookie,
          body: {
            originalName: 'beacon-mark-updated.svg',
            description: 'Secondary monochrome emblem',
          },
        });
        expect(patchMeta.status).toBe(200);
        expect(patchMeta.data.asset.originalName).toBe('beacon-mark-updated.svg');
        expect(patchMeta.data.asset.description).toBe('Secondary monochrome emblem');

        // PUT /api/assets/:id replaces underlying file and removes old Cloudinary asset
        const replacementForm = new FormData();
        const replacementPng = Buffer.from([
          0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x01,
        ]);
        replacementForm.append(
          'file',
          new Blob([new Uint8Array(replacementPng)], { type: 'image/png' }),
          'beacon-mark-v2.png',
        );
        const replaceRes = await realFetch(`${baseUrl}/api/assets/${secondaryId}`, {
          method: 'PUT',
          headers: { Cookie: clientCookie },
          body: replacementForm,
        });
        expect(replaceRes.status).toBe(200);
        const replaceJson = (await replaceRes.json()) as {
          asset: { originalName: string; sizeBytes: number };
        };
        expect(replaceJson.asset.originalName).toBe('beacon-mark-v2.png');
        expect(replaceJson.asset.sizeBytes).toBe(replacementPng.byteLength);
        expect(destroySpy).toHaveBeenCalledTimes(1);

        // Generate signed download URL
        const tokenRes = await apiJson<{ url: string }>(`/api/assets/${uploadedLogoId}/download-token`, {
          method: 'POST',
          cookie: clientCookie,
        });
        expect(tokenRes.status).toBe(200);
        signedAssetUrl = tokenRes.data.url;
        expect(signedAssetUrl).toContain('/api/assets/');

        // Inline preview returns sandboxed CSP + nosniff
        const inlineRes = await realFetch(`${baseUrl}${signedAssetUrl}&inline=1`);
        expect(inlineRes.status).toBe(200);
        expect(inlineRes.headers.get('x-content-type-options')).toBe('nosniff');
        expect(inlineRes.headers.get('content-security-policy')).toContain('sandbox');
        const inlineBuf = new Uint8Array(await inlineRes.arrayBuffer());
        expect(Buffer.from(inlineBuf)).toEqual(validPngBytes);

        // Attachment download sets Content-Disposition: attachment
        const dlRes = await realFetch(`${baseUrl}${signedAssetUrl}`);
        expect(dlRes.status).toBe(200);
        expect(dlRes.headers.get('content-disposition')).toContain('attachment');

        // Delete secondary asset
        const delRes = await apiJson(`/api/assets/${secondaryId}`, {
          method: 'DELETE',
          cookie: clientCookie,
        });
        expect(delRes.status).toBe(200);
        expect(destroySpy).toHaveBeenCalledTimes(2);

        // Deleted asset token generation returns 404
        const afterDelToken = await apiJson(`/api/assets/${secondaryId}/download-token`, {
          method: 'POST',
          cookie: clientCookie,
        });
        expect(afterDelToken.status).toBe(404);
      } finally {
        uploadSpy.mockRestore();
        destroySpy.mockRestore();
        fetchSpy.mockRestore();
        delete process.env.CLOUDINARY_CLOUD_NAME;
        delete process.env.CLOUDINARY_API_KEY;
        delete process.env.CLOUDINARY_API_SECRET;
      }
    });
  });

  describe('6. Client Portal Onboarding Flow (Isolation, Draft/Resume, Validation, Completion, Lock)', () => {
    it('isolates portal access, strips internal notes, saves drafts, validates required fields, and locks on approval', async () => {
      // Cross-workspace access must return 403
      const otherWs = await apiJson('/api/onboarding/client-northstar', { cookie: clientCookie });
      expect(otherWs.status).toBe(403);

      // Access own workspace; internalNotes must be stripped
      const ws = await apiJson<{
        client: { id: string; internalNotes: string; status: string };
        progress: { overallPercentage: number };
      }>(`/api/onboarding/${createdClientId}`, { cookie: clientCookie });
      expect(ws.status).toBe(200);
      expect(ws.data.client.internalNotes).toBe('');

      // Save draft in website_content and verify resumption preserves it
      const draftSave = await apiJson('/api/onboarding/' + createdClientId + '/sections/website_content', {
        method: 'PUT',
        cookie: clientCookie,
        body: {
          markComplete: false,
          data: {
            homepageCopy: '24/7 Telehealth built around your family.',
            aboutCopy: '',
            servicesCopy: '',
            contactPageCopy: '',
            existingWebsiteRefs: '',
          },
        },
      });
      expect(draftSave.status).toBe(200);

      const resumed = await apiJson<{
        sections: { sectionKey: string; status: string; data: { homepageCopy?: string } }[];
      }>(`/api/onboarding/${createdClientId}`, { cookie: clientCookie });
      const webSec = resumed.data.sections.find((s) => s.sectionKey === 'website_content');
      expect(webSec?.status).toBe('in_progress');
      expect(webSec?.data.homepageCopy).toBe('24/7 Telehealth built around your family.');

      // Submitting incomplete section fails with missing items
      const incompleteSubmit = await apiJson<{ error: string; missing?: string[] }>(
        `/api/onboarding/${createdClientId}/sections/website_content`,
        {
          method: 'PUT',
          cookie: clientCookie,
          body: {
            markComplete: true,
            data: {
              homepageCopy: '24/7 Telehealth built around your family.',
              aboutCopy: '',
              servicesCopy: '',
              contactPageCopy: '',
              existingWebsiteRefs: '',
            },
          },
        },
      );
      expect(incompleteSubmit.status).toBe(400);
      expect(incompleteSubmit.data.missing?.length).toBeGreaterThan(0);

      // Add encrypted credential (AES-256-GCM), confirm client cannot reveal, agency admin can reveal
      const credRes = await apiJson<{ credential: { id: string; usernameMasked: string } }>(
        `/api/onboarding/${createdClientId}/credentials`,
        {
          method: 'POST',
          cookie: clientCookie,
          body: {
            serviceName: 'AWS Route53',
            category: 'domain',
            accessType: 'temporary_token',
            loginUrl: 'https://console.aws.amazon.com',
            username: 'ops@beaconhealth.io',
            secretValue: 'TEMP-TOKEN-BEACON-2026',
            notes: 'Expires in 7 days',
          },
        },
      );
      expect(credRes.status).toBe(201);
      createdCredId = credRes.data.credential.id;
      expect(credRes.data.credential.usernameMasked).not.toBe('ops@beaconhealth.io');

      const clientRevealDenied = await apiJson(
        `/api/onboarding/${createdClientId}/credentials/${createdCredId}/reveal`,
        { method: 'POST', cookie: clientCookie },
      );
      expect(clientRevealDenied.status).toBe(403);

      const adminReveal = await apiJson<{ username: string; secretValue: string }>(
        `/api/onboarding/${createdClientId}/credentials/${createdCredId}/reveal`,
        { method: 'POST', cookie: adminCookie },
      );
      expect(adminReveal.status).toBe(200);
      expect(adminReveal.data.username).toBe('ops@beaconhealth.io');
      expect(adminReveal.data.secretValue).toBe('TEMP-TOKEN-BEACON-2026');

      // Complete all 6 required sections
      const completePayloads: Record<string, unknown> = {
        company_info: {
          companyName: 'Beacon Health Systems',
          businessDescription: 'Virtual primary and urgent care clinic across 12 states.',
          industry: 'Digital Health',
          contactName: 'Priya Patel',
          contactEmail: 'priya@beaconhealth.io',
          contactPhone: '+1 (512) 555-0199',
          website: 'https://beaconhealth.io',
          businessAddress: '300 Congress Ave, Austin, TX',
          socialLinks: { linkedin: '', instagram: '', twitter: '', facebook: '' },
        },
        brand_assets: {
          brandColors: ['#191A1D', '#EDA320'],
          typographyNotes: 'Plus Jakarta Sans headings with DM Sans body.',
          designReferences: 'Warm clinical accessibility',
          brandVoiceNotes: 'Empathetic and clear',
        },
        website_content: {
          homepageCopy: '24/7 Telehealth built around your family.',
          aboutCopy: 'Founded by board-certified physicians in Austin.',
          servicesCopy: 'Urgent Care · Pediatrics · Behavioral Health',
          contactPageCopy: 'Support hours 6am-10pm CT',
          existingWebsiteRefs: 'https://beaconhealth.io',
        },
        project_requirements: {
          projectGoals: 'Increase patient appointment bookings by 40%.',
          requiredFeatures: 'Provider directory and intake scheduling.',
          designPreferences: 'Clean light interface',
          functionalRequirements: 'HIPAA-safe intake handoff',
          referenceWebsites: '',
          targetDeadline: '2027-01-15',
          additionalInstructions: '',
        },
        access_credentials: {
          accessMethodPreference: 'temporary_token',
          delegatedAccessNotes: 'Route53 token stored in encrypted vault.',
          confirmedSecurityReview: true,
        },
        additional_documents: {
          documentNotes: 'No extra contracts needed at this stage.',
          noAdditionalDocsNeeded: true,
        },
      };

      let lastPct = 0;
      for (const [key, data] of Object.entries(completePayloads)) {
        const sub = await apiJson<{ ok: boolean; progress: { overallPercentage: number } }>(
          `/api/onboarding/${createdClientId}/sections/${key}`,
          {
            method: 'PUT',
            cookie: clientCookie,
            body: { markComplete: true, data },
          },
        );
        expect(sub.status).toBe(200);
        lastPct = sub.data.progress.overallPercentage;
      }
      expect(lastPct).toBe(100);

      // Client status automatically moves to in_review
      const inReviewWs = await apiJson<{ client: { status: string } }>(
        `/api/onboarding/${createdClientId}`,
        { cookie: clientCookie },
      );
      expect(inReviewWs.data.client.status).toBe('in_review');

      // Agency reviews & approves all sections -> client status becomes completed (locked)
      for (const key of Object.keys(completePayloads)) {
        const rev = await apiJson(`/api/onboarding/${createdClientId}/sections/${key}/review`, {
          method: 'POST',
          cookie: adminCookie,
          body: { decision: 'completed', note: 'Approved for kickoff' },
        });
        expect(rev.status).toBe(200);
      }

      const completedWs = await apiJson<{ client: { status: string } }>(
        `/api/onboarding/${createdClientId}`,
        { cookie: clientCookie },
      );
      expect(completedWs.data.client.status).toBe('completed');

      // Completed workspace locks out further edits by the client (403)
      const lockedEdit = await apiJson(
        `/api/onboarding/${createdClientId}/sections/company_info`,
        {
          method: 'PUT',
          cookie: clientCookie,
          body: { markComplete: false, data: completePayloads.company_info },
        },
      );
      expect(lockedEdit.status).toBe(403);
    });
  });

  describe('7. Dashboard Overview Analytics & Live Aggregation', () => {
    it('computes accurate statistics, status distribution, section rates, pending items, and activity', async () => {
      const dash = await apiJson<{
        stats: {
          totalClients: number;
          completedOnboardings: number;
          activeOnboardings: number;
          pendingOnboardings: number;
          overdueOnboardings: number;
          averageCompletion: number;
          totalAssets: number;
        };
        statusDistribution: { status: string; count: number }[];
        sectionCompletionRates: { sectionKey: string; completedCount: number; percentage: number }[];
        recentClients: { id: string }[];
        pendingRequirements: { clientId: string; missingCount: number }[];
        recentAssets: { id: string }[];
        recentActivity: { action: string }[];
      }>('/api/dashboard/overview', { cookie: adminCookie });

      expect(dash.status).toBe(200);
      // Seeded 4 active + 1 newly completed Beacon Health (Temporary Archive Co was archived) = 5 active clients
      expect(dash.data.stats.totalClients).toBe(5);
      // Northstar + Beacon Health = 2 completed
      expect(dash.data.stats.completedOnboardings).toBe(2);
      expect(dash.data.stats.totalAssets).toBeGreaterThanOrEqual(3);
      expect(dash.data.statusDistribution.reduce((s, d) => s + d.count, 0)).toBe(5);
      expect(dash.data.sectionCompletionRates).toHaveLength(6);
      expect(dash.data.recentClients.length).toBeGreaterThan(0);
      expect(dash.data.recentActivity.length).toBeGreaterThan(0);
      expect(dash.data.recentAssets.map((a) => a.id)).toContain(uploadedLogoId);
    });
  });
});
