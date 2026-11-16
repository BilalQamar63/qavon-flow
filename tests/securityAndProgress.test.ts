import { describe, expect, it, vi, afterEach } from 'vitest';
import nodemailer from 'nodemailer';
import {
  decryptSecret,
  encryptSecret,
  generateSecureToken,
  hashToken,
  maskUsername,
  signPayload,
  verifySignedPayload,
} from '../server/security/crypto';
import { resolveSafeAppOrigin, serverConfig } from '../server/config';
import {
  convertPlaceholdersToPostgres,
  createDefaultSectionsForClient,
  createSqliteAppDatabase,
  initSchema,
} from '../server/db/database';
import { hydrateClientRecords, parseDbClientRows, parseRawSectionRows } from '../server/services/clientHydrator';
import { emailProvider, resetEmailTransportCacheForTests } from '../server/services/email';
import { isExtensionAllowedForMime, validateFileSignature } from '../server/services/fileValidation';
import { calculateClientProgress } from '../server/services/progress';
import { safeJsonParse } from '../src/constants/onboarding';
import { createClientSchema, credentialInputSchema } from '../src/schemas/validation';
import type { OnboardingSectionKey } from '../src/types';

describe('AES-256-GCM Credential Encryption', () => {
  it('encrypts and decrypts sensitive strings with unique IVs', () => {
    const plaintext = 'super-secret-hosting-token-9921';
    const c1 = encryptSecret(plaintext);
    const c2 = encryptSecret(plaintext);

    expect(c1).not.toBe(plaintext);
    expect(c1).not.toBe(c2); // Unique 12-byte IV per encryption
    expect(decryptSecret(c1)).toBe(plaintext);
    expect(decryptSecret(c2)).toBe(plaintext);
  });

  it('rejects tampered ciphertext via GCM auth tag', () => {
    const encrypted = encryptSecret('db-password-xyz');
    const parts = encrypted.split('.');
    const tampered = `${parts[0]}.${parts[1]}.${parts[2].slice(0, -2)}AA`;
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it('masks usernames safely for ordinary API responses', () => {
    expect(maskUsername('elena@northstar.com')).toBe('el•••@northstar.com');
    expect(maskUsername('admin_root')).toContain('ad');
  });
});

describe('Magic-Link Token Hashing & Signed Tokens', () => {
  it('hashes raw tokens deterministically with SHA-256', () => {
    const raw = generateSecureToken(32);
    expect(raw.length).toBeGreaterThan(30);
    const h1 = hashToken(raw);
    const h2 = hashToken(raw);
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
    expect(h1).not.toBe(raw);
  });

  it('verifies valid HMAC payloads and rejects expired or tampered payloads', () => {
    const token = signPayload({ userId: 'u1', role: 'admin' }, 60);
    const verified = verifySignedPayload<{ userId: string; role: string }>(token);
    expect(verified?.userId).toBe('u1');
    expect(verified?.role).toBe('admin');

    const tampered = token.slice(0, -3) + 'xyz';
    expect(verifySignedPayload(tampered)).toBeNull();

    const expired = signPayload({ userId: 'u1' }, -10);
    expect(verifySignedPayload(expired)).toBeNull();
  });

  it('binds short-lived asset download tokens to assetId, agencyId, and clientId', () => {
    const dlToken = signPayload(
      { assetId: 'asset-1', agencyId: 'ag-1', clientId: 'cl-1' },
      300,
    );
    const verified = verifySignedPayload<{
      assetId: string;
      agencyId: string;
      clientId: string;
    }>(dlToken);

    expect(verified).not.toBeNull();
    expect(verified?.assetId).toBe('asset-1');
    expect(verified?.agencyId).toBe('ag-1');
    expect(verified?.clientId).toBe('cl-1');
    expect(verified?.clientId).not.toBe('cl-2');
  });
});

describe('Dynamic Onboarding Progress Calculation', () => {
  it('computes 0% when required fields and assets are empty, and advances dynamically', async () => {
    const db = await createSqliteAppDatabase(':memory:');
    await initSchema(db);

    const agencyId = 'ag-1';
    const clientId = 'cl-1';
    const now = new Date().toISOString();
    const requiredSections: OnboardingSectionKey[] = [
      'company_info',
      'brand_assets',
      'website_content',
      'project_requirements',
      'access_credentials',
      'additional_documents',
    ];

    await db.run(
      `INSERT INTO agencies (id, name, support_email, required_sections_json, created_at)
       VALUES (?, 'Test Agency', 'hi@test.co', ?, ?)`,
      agencyId,
      JSON.stringify(requiredSections),
      now,
    );

    await db.run(
      `INSERT INTO clients (id, agency_id, company_name, contact_name, email, industry, status, created_at, updated_at)
       VALUES (?, ?, 'Acme Co', 'Jane', 'jane@acme.co', 'Tech', 'pending', ?, ?)`,
      clientId,
      agencyId,
      now,
      now,
    );

    await createDefaultSectionsForClient(db, agencyId, clientId);

    const sectionsBefore = parseRawSectionRows(
      await db.all(
        'SELECT section_key, status, data_json, updated_at FROM onboarding_sections WHERE client_id = ?',
        clientId,
      ),
    );

    const emptyProgress = calculateClientProgress({
      requiredSections,
      sections: sectionsBefore,
      assets: [],
      credentialCount: 0,
      clientUpdatedAt: now,
    });

    // brand_assets has default brandColors ['#191A1D', '#EDA320'] -> 1 item filled out of total checkpoints
    expect(emptyProgress.overallPercentage).toBeLessThan(20);
    expect(emptyProgress.missingRequiredItems.length).toBeGreaterThan(5);
    expect(emptyProgress.pendingAssetSlots.some((s) => s.category === 'primary_logo')).toBe(true);

    // Fill company_info and add a primary_logo asset + credential
    await db.run(
      `UPDATE onboarding_sections SET status = 'completed', data_json = ? WHERE client_id = ? AND section_key = 'company_info'`,
      JSON.stringify({
        companyName: 'Acme Co',
        businessDescription: 'Cloud widgets',
        industry: 'Tech',
        contactName: 'Jane',
        contactEmail: 'jane@acme.co',
      }),
      clientId,
    );

    const sectionsAfter = parseRawSectionRows(
      await db.all(
        'SELECT section_key, status, data_json, updated_at FROM onboarding_sections WHERE client_id = ?',
        clientId,
      ),
    );

    const updatedProgress = calculateClientProgress({
      requiredSections,
      sections: sectionsAfter,
      assets: [{ category: 'primary_logo', created_at: now }],
      credentialCount: 1,
      clientUpdatedAt: now,
    });

    expect(updatedProgress.overallPercentage).toBeGreaterThan(emptyProgress.overallPercentage);
    expect(updatedProgress.completedSections).toBe(1);
    expect(updatedProgress.pendingAssetSlots).toHaveLength(0);
    await db.close();
  });

  it('reaches 100% only when all required fields, assets, credentials, and sections are fulfilled', async () => {
    const db = await createSqliteAppDatabase(':memory:');
    await initSchema(db);
    const agencyId = 'ag-full';
    const clientId = 'cl-full';
    const now = new Date().toISOString();
    const requiredSections: OnboardingSectionKey[] = [
      'company_info',
      'brand_assets',
      'website_content',
      'project_requirements',
      'access_credentials',
    ];

    await db.run(
      `INSERT INTO agencies (id, name, support_email, required_sections_json, created_at)
       VALUES (?, 'Studio Test', 'hi@studio.co', ?, ?)`,
      agencyId,
      JSON.stringify(requiredSections),
      now,
    );

    await db.run(
      `INSERT INTO clients (id, agency_id, company_name, contact_name, email, industry, status, created_at, updated_at)
       VALUES (?, ?, 'Vega Labs', 'Sam', 'sam@vega.co', 'SaaS', 'pending', ?, ?)`,
      clientId,
      agencyId,
      now,
      now,
    );

    await createDefaultSectionsForClient(db, agencyId, clientId);

    const updates: Record<string, unknown> = {
      company_info: {
        companyName: 'Vega Labs',
        businessDescription: 'Analytics SaaS',
        industry: 'SaaS',
        contactName: 'Sam',
        contactEmail: 'sam@vega.co',
      },
      brand_assets: {
        brandColors: ['#191A1D', '#EDA320'],
        typographyNotes: 'Plus Jakarta Sans',
      },
      website_content: {
        homepageCopy: 'Modern analytics',
        aboutCopy: 'Founded 2024',
        servicesCopy: 'Dashboards',
      },
      project_requirements: {
        projectGoals: 'Increase conversions',
        requiredFeatures: 'Pricing calculator',
        targetDeadline: '2026-12-15',
      },
      access_credentials: {
        accessMethodPreference: 'delegated_invite',
        delegatedAccessNotes: 'Invited team',
      },
    };

    for (const [key, data] of Object.entries(updates)) {
      await db.run(
        `UPDATE onboarding_sections SET status = 'completed', data_json = ? WHERE client_id = ? AND section_key = ?`,
        JSON.stringify(data),
        clientId,
        key,
      );
    }

    const sections = parseRawSectionRows(
      await db.all(
        'SELECT section_key, status, data_json, updated_at FROM onboarding_sections WHERE client_id = ?',
        clientId,
      ),
    );

    const completeProgress = calculateClientProgress({
      requiredSections,
      sections,
      assets: [{ category: 'primary_logo', created_at: now }],
      credentialCount: 1,
      clientUpdatedAt: now,
    });

    expect(completeProgress.overallPercentage).toBe(100);
    expect(completeProgress.completedSections).toBe(5);
    expect(completeProgress.missingRequiredItems).toHaveLength(0);
    expect(completeProgress.pendingAssetSlots).toHaveLength(0);
    await db.close();
  });
});

describe('Tenant Isolation & PostgreSQL Query Adaptation', () => {
  it('scopes client records strictly by agency_id', async () => {
    const db = await createSqliteAppDatabase(':memory:');
    await initSchema(db);
    const now = new Date().toISOString();

    await db.run(
      `INSERT INTO agencies (id, name, support_email, required_sections_json, created_at)
       VALUES ('a1', 'Agency One', 'one@test.co', '["company_info"]', ?)`,
      now,
    );
    await db.run(
      `INSERT INTO agencies (id, name, support_email, required_sections_json, created_at)
       VALUES ('a2', 'Agency Two', 'two@test.co', '["company_info"]', ?)`,
      now,
    );

    await db.run(
      `INSERT INTO clients (id, agency_id, company_name, contact_name, email, industry, status, created_at, updated_at)
       VALUES ('c1', 'a1', 'Client One', 'Bob', 'bob@c1.co', 'Tech', 'pending', ?, ?)`,
      now,
      now,
    );
    await db.run(
      `INSERT INTO clients (id, agency_id, company_name, contact_name, email, industry, status, created_at, updated_at)
       VALUES ('c2', 'a2', 'Client Two', 'Sue', 'sue@c2.co', 'Retail', 'pending', ?, ?)`,
      now,
      now,
    );

    const agencyOneClients = await db.all<{ id: string }>(
      'SELECT id FROM clients WHERE agency_id = ?',
      'a1',
    );
    expect(agencyOneClients.map((c) => c.id)).toEqual(['c1']);
    await db.close();
  });

  it('converts SQLite ? placeholders to PostgreSQL $n while ignoring string literals and comments', () => {
    const sql = `
      -- Question mark ? in line comment should stay
      SELECT id, 'what?' as literal_q, /* ? block comment */ status
      FROM clients
      WHERE agency_id = ? AND email = ? AND notes != 'escaped ''?'' quote'
      LIMIT ? OFFSET ?
    `;
    const converted = convertPlaceholdersToPostgres(sql);
    expect(converted).toContain('agency_id = $1 AND email = $2');
    expect(converted).toContain('LIMIT $3 OFFSET $4');
    expect(converted).toContain("'what?'");
    expect(converted).toContain('-- Question mark ?');
    expect(converted).toContain('/* ? block comment */');
  });
});

describe('Brevo SMTP Email Transport', () => {
  const savedSmtpEnv = {
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.EMAIL_FROM,
  };

  afterEach(() => {
    vi.restoreAllMocks();
    resetEmailTransportCacheForTests();
    for (const [k, v] of [
      ['SMTP_HOST', savedSmtpEnv.host],
      ['SMTP_PORT', savedSmtpEnv.port],
      ['SMTP_USER', savedSmtpEnv.user],
      ['SMTP_PASS', savedSmtpEnv.pass],
      ['EMAIL_FROM', savedSmtpEnv.from],
    ] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('reports unconfigured cleanly when SMTP env vars are missing', async () => {
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    expect(emailProvider.isConfigured()).toBe(false);
    const res = await emailProvider.send({
      to: 'client@example.com',
      subject: 'Test',
      text: 'Hello',
    });
    expect(res).toMatchObject({
      configured: false,
      delivered: false,
    });
    expect(res.reason).toContain('SMTP provider is not configured');
  });

  it('does not use a placeholder sender when EMAIL_FROM is missing', async () => {
    process.env.SMTP_HOST = 'smtp-relay.brevo.com';
    process.env.SMTP_PORT = '587';
    process.env.SMTP_USER = 'smtp-login@example.com';
    process.env.SMTP_PASS = 'mock-smtp-key';
    delete process.env.EMAIL_FROM;

    expect(emailProvider.isConfigured()).toBe(false);
    await expect(
      emailProvider.send({
        to: 'client@example.com',
        subject: 'Test',
        text: 'Hello',
      }),
    ).resolves.toMatchObject({
      configured: false,
      delivered: false,
    });
  });

  it('dispatches outbound mail via Nodemailer when Brevo SMTP variables are set', async () => {
    process.env.SMTP_HOST = 'smtp-relay.brevo.com';
    process.env.SMTP_PORT = '587';
    process.env.SMTP_USER = 'a1b2c3@smtp-brevo.com';
    process.env.SMTP_PASS = 'xsmtpsib-mock-key';
    process.env.EMAIL_FROM = 'QavonFlow <it.bilalqamardeen@gmail.com>';

    const sendMailMock = vi.fn().mockResolvedValue({ messageId: '<msg-123@brevo>' });
    const createTransportSpy = vi.spyOn(nodemailer, 'createTransport').mockReturnValue({
      sendMail: sendMailMock,
    } as never);

    expect(emailProvider.isConfigured()).toBe(true);
    const result = await emailProvider.send({
      to: 'newclient@acme.co',
      subject: 'Your QavonFlow sign-in link',
      text: 'Open https://example.vercel.app/?magicToken=abc',
      html: '<p>Open the secure sign-in link</p>',
    });

    expect(result).toEqual({ configured: true, delivered: true });
    expect(createTransportSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp-relay.brevo.com',
        port: 587,
        secure: false,
        auth: {
          user: 'a1b2c3@smtp-brevo.com',
          pass: 'xsmtpsib-mock-key',
        },
      }),
    );
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'QavonFlow <it.bilalqamardeen@gmail.com>',
        to: 'newclient@acme.co',
        subject: 'Your QavonFlow sign-in link',
        html: '<p>Open the secure sign-in link</p>',
      }),
    );
  });
});

describe('Batch Client Hydration, File Signatures & Safe JSON', () => {
  it('validates file magic bytes accurately against declared MIME types and rejects SVG XSS vectors', () => {
    const validPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const fakePngExecutable = Buffer.from('MZ\x90\x00not-a-png');
    const validSvg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>');
    const xssSvgScript = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    const xssSvgOnload = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="fetch(1)"></svg>');
    const xssSvgForeignObject = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><body></body></foreignObject></svg>');
    const validPdf = Buffer.from('%PDF-1.7\n...');

    expect(validateFileSignature('image/png', validPng)).toBe(true);
    expect(validateFileSignature('image/png', fakePngExecutable)).toBe(false);
    expect(validateFileSignature('image/png', Buffer.alloc(0))).toBe(false);
    expect(validateFileSignature('image/svg+xml', validSvg)).toBe(true);
    expect(validateFileSignature('image/svg+xml', xssSvgScript)).toBe(false);
    expect(validateFileSignature('image/svg+xml', xssSvgOnload)).toBe(false);
    expect(validateFileSignature('image/svg+xml', xssSvgForeignObject)).toBe(false);
    expect(validateFileSignature('application/pdf', validPdf)).toBe(true);
    expect(validateFileSignature('text/plain', Buffer.from([0x41, 0x00, 0x42]))).toBe(false);
  });

  it('validates extension-to-MIME mapping strictly', () => {
    expect(isExtensionAllowedForMime('logo.png', 'image/png')).toBe(true);
    expect(isExtensionAllowedForMime('payload.html', 'text/plain')).toBe(false);
    expect(isExtensionAllowedForMime('trojan.exe', 'image/png')).toBe(false);
    expect(isExtensionAllowedForMime('noext', 'image/png')).toBe(false);
  });

  it('rejects spoofed external Origin headers and unsafe URI schemes', () => {
    const expectedOrigin = new URL(serverConfig.appUrl).origin;
    expect(resolveSafeAppOrigin('https://evil-phisher.example', 'localhost:3000')).toBe(
      expectedOrigin,
    );
    expect(resolveSafeAppOrigin('javascript:alert(1)', 'localhost:3000')).toBe(
      expectedOrigin,
    );

    const badClient = createClientSchema.safeParse({
      companyName: 'Test Co',
      contactName: 'Alice',
      email: 'alice@test.co',
      industry: 'Tech',
      website: 'javascript:alert(document.cookie)',
    });
    expect(badClient.success).toBe(false);

    const badCred = credentialInputSchema.safeParse({
      serviceName: 'Cloudflare',
      category: 'domain',
      accessType: 'delegated_invite',
      loginUrl: 'data:text/html,<script>alert(1)</script>',
      username: 'ops@test.co',
      secretValue: 'invite-123',
    });
    expect(badCred.success).toBe(false);
  });

  it('safely falls back on malformed JSON payloads', () => {
    expect(safeJsonParse('{"a":1}', { a: 0 })).toEqual({ a: 1 });
    expect(safeJsonParse('{corrupted', { a: 0 })).toEqual({ a: 0 });
    expect(safeJsonParse(null, ['fallback'])).toEqual(['fallback']);
  });

  it('batch-hydrates multiple clients with accurate progress and invitation expiry status', async () => {
    const db = await createSqliteAppDatabase(':memory:');
    await initSchema(db);
    const now = new Date().toISOString();
    const past = new Date(Date.now() - 3600_000).toISOString();

    await db.run(
      `INSERT INTO agencies (id, name, support_email, required_sections_json, created_at)
       VALUES ('a1', 'Agency', 'hi@a1.co', '["company_info"]', ?)`,
      now,
    );
    await db.run(
      `INSERT INTO clients (id, agency_id, company_name, contact_name, email, industry, status, created_at, updated_at)
       VALUES ('c1', 'a1', 'Alpha', 'Alice', 'a@c1.co', 'SaaS', 'in_progress', ?, ?)`,
      now,
      now,
    );
    await db.run(
      `INSERT INTO clients (id, agency_id, company_name, contact_name, email, industry, status, created_at, updated_at)
       VALUES ('c2', 'a1', 'Beta', 'Bob', 'b@c2.co', 'FinTech', 'pending', ?, ?)`,
      now,
      now,
    );

    await createDefaultSectionsForClient(db, 'a1', 'c1', {
      companyName: 'Alpha',
      contactName: 'Alice',
      email: 'a@c1.co',
      industry: 'SaaS',
      description: 'Cloud platform',
    });
    await createDefaultSectionsForClient(db, 'a1', 'c2');

    await db.run(
      `INSERT INTO invitations (id, agency_id, client_id, email, token_hash, status, expires_at, created_at)
       VALUES ('inv1', 'a1', 'c2', 'b@c2.co', 'hash123', 'sent', ?, ?)`,
      past,
      now,
    );

    const rows = parseDbClientRows(await db.all('SELECT * FROM clients WHERE agency_id = ?', 'a1'));
    const hydrated = await hydrateClientRecords(db, rows, ['company_info']);

    const c1 = hydrated.find((c) => c.id === 'c1');
    const c2 = hydrated.find((c) => c.id === 'c2');
    expect(c1?.progress.overallPercentage).toBe(100);
    expect(c1?.latestInvitationStatus).toBeNull();
    expect(c2?.progress.overallPercentage).toBe(0);
    expect(c2?.latestInvitationStatus).toBe('expired');
    await db.close();
  });
});
