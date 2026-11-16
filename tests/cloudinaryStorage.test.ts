import { v2 as cloudinary } from 'cloudinary';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CloudinaryConfigError,
  assertCloudinaryConfigured,
  getMissingCloudinaryVars,
  isCloudinaryConfigured,
} from '../server/config/cloudinary';
import {
  createSqliteAppDatabase,
  initSchema,
  wrapSqliteDatabase,
} from '../server/db/database';
import { deleteFromCloudinary, retryPendingAssetDeletions } from '../server/services/cloudinary/delete.service';
import { migrateLegacyAssetsToCloudinary } from '../server/services/cloudinary/migration.service';
import { replaceAssetInCloudinaryAndDb } from '../server/services/cloudinary/replace.service';
import { generateSignedCloudinaryUrls } from '../server/services/cloudinary/retrieve.service';
import {
  buildUniquePublicId,
  resolveCloudinaryFolder,
  resolveDefaultSectionKey,
  resolveResourceType,
  uploadBufferToCloudinary,
} from '../server/services/cloudinary/upload.service';

const savedEnv = {
  cloudName: process.env.CLOUDINARY_CLOUD_NAME,
  apiKey: process.env.CLOUDINARY_API_KEY,
  apiSecret: process.env.CLOUDINARY_API_SECRET,
};

function restoreCloudinaryEnv() {
  if (savedEnv.cloudName === undefined) delete process.env.CLOUDINARY_CLOUD_NAME;
  else process.env.CLOUDINARY_CLOUD_NAME = savedEnv.cloudName;

  if (savedEnv.apiKey === undefined) delete process.env.CLOUDINARY_API_KEY;
  else process.env.CLOUDINARY_API_KEY = savedEnv.apiKey;

  if (savedEnv.apiSecret === undefined) delete process.env.CLOUDINARY_API_SECRET;
  else process.env.CLOUDINARY_API_SECRET = savedEnv.apiSecret;
}

function setMockCloudinaryEnv() {
  process.env.CLOUDINARY_CLOUD_NAME = 'demo-test-cloud';
  process.env.CLOUDINARY_API_KEY = '123456789012345';
  process.env.CLOUDINARY_API_SECRET = 'mock-super-secret-value-never-returned';
}

describe('Cloudinary Configuration, Folder Mapping & Orchestration Safety', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    restoreCloudinaryEnv();
  });

  it('detects missing Cloudinary env vars cleanly without leaking secrets', () => {
    delete process.env.CLOUDINARY_CLOUD_NAME;
    delete process.env.CLOUDINARY_API_KEY;
    delete process.env.CLOUDINARY_API_SECRET;

    expect(isCloudinaryConfigured()).toBe(false);
    expect(getMissingCloudinaryVars()).toEqual([
      'CLOUDINARY_CLOUD_NAME',
      'CLOUDINARY_API_KEY',
      'CLOUDINARY_API_SECRET',
    ]);

    expect(() => assertCloudinaryConfigured()).toThrow(CloudinaryConfigError);

    setMockCloudinaryEnv();
    expect(isCloudinaryConfigured()).toBe(true);
    const cfg = assertCloudinaryConfigured();
    expect(cfg.cloudName).toBe('demo-test-cloud');
  });

  it('maps folders, resource types, section keys, and unique public IDs consistently', () => {
    expect(resolveCloudinaryFolder('ag-1', 'cl-2', 'primary_logo')).toBe(
      'client-onboarding/ag-1/cl-2/logos',
    );
    expect(resolveCloudinaryFolder('ag-1', 'cl-2', 'brand_guidelines')).toBe(
      'client-onboarding/ag-1/cl-2/brand-assets',
    );
    expect(resolveCloudinaryFolder('ag-1', 'cl-2', 'website_media')).toBe(
      'client-onboarding/ag-1/cl-2/project-files',
    );
    expect(resolveCloudinaryFolder('ag-1', 'cl-2', 'additional_document')).toBe(
      'client-onboarding/ag-1/cl-2/documents',
    );

    expect(resolveResourceType('image/png')).toBe('image');
    expect(resolveResourceType('image/svg+xml')).toBe('image');
    expect(resolveResourceType('video/mp4')).toBe('video');
    expect(resolveResourceType('application/pdf')).toBe('raw');
    expect(resolveResourceType('application/zip')).toBe('raw');

    expect(resolveDefaultSectionKey('website_media')).toBe('website_content');
    expect(resolveDefaultSectionKey('brand_guidelines')).toBe('brand_assets');

    const imgId = buildUniquePublicId('Hero Logo.PNG', 'image');
    const rawId = buildUniquePublicId('Brand Guidelines.PDF', 'raw');
    expect(imgId).toMatch(/^hero-logo-[a-f0-9-]{10}$/);
    expect(rawId).toMatch(/^brand-guidelines-[a-f0-9-]{10}\.pdf$/);
  });

  it('generates short-lived signed Cloudinary URLs without exposing API secret', () => {
    setMockCloudinaryEnv();
    const urls = generateSignedCloudinaryUrls({
      publicId: 'client-onboarding/ag-1/cl-1/logos/brand-123',
      resourceType: 'image',
      deliveryType: 'authenticated',
      fileFormat: 'png',
      originalName: 'brand.png',
      mimeType: 'image/png',
      expiresInSeconds: 300,
    });

    expect(urls.previewUrl).toContain('https://res.cloudinary.com/demo-test-cloud/');
    expect(urls.previewUrl).toContain('/authenticated/');
    expect(urls.downloadUrl).toContain('signature=');
    expect(urls.previewUrl).not.toContain('mock-super-secret-value-never-returned');
    expect(urls.downloadUrl).not.toContain('mock-super-secret-value-never-returned');
  });

  it('uploads via stream and rolls back / preserves old file safely on replaceAssetInCloudinaryAndDb', async () => {
    setMockCloudinaryEnv();
    const db = await createSqliteAppDatabase(':memory:');
    await initSchema(db);
    const now = new Date().toISOString();

    await db.run(
      `INSERT INTO agencies (id, name, support_email, required_sections_json, created_at)
       VALUES ('ag-1', 'Studio', 'hi@studio.co', '["company_info"]', ?)`,
      now,
    );
    await db.run(
      `INSERT INTO clients (id, agency_id, company_name, contact_name, email, industry, status, created_at, updated_at)
       VALUES ('cl-1', 'ag-1', 'Client', 'Bob', 'bob@c.co', 'Tech', 'in_progress', ?, ?)`,
      now,
      now,
    );
    await db.run(
      `INSERT INTO assets (
         id, agency_id, client_id, category, original_name, mime_type, size_bytes,
         storage_key, cloudinary_public_id, cloudinary_asset_id, resource_type, delivery_type,
         secure_url, file_format, description, section_key, uploaded_by_name, uploaded_by_role, created_at, updated_at
       ) VALUES (
         'asset-1', 'ag-1', 'cl-1', 'primary_logo', 'old-logo.png', 'image/png', 100,
         '', 'client-onboarding/ag-1/cl-1/logos/old-logo-1', 'cld-old', 'image', 'authenticated',
         'https://res.cloudinary.com/demo-test-cloud/image/authenticated/old', 'png', '', 'brand_assets', 'Bob', 'client', ?, ?
       )`,
      now,
      now,
    );

    const destroyedPublicIds: string[] = [];
    vi.spyOn(cloudinary.uploader, 'upload_stream').mockImplementation(((
      options: Record<string, unknown>,
      cb?: (err: unknown, res?: Record<string, unknown>) => void,
    ) => {
      const folder = String(options.folder || '');
      const pid = String(options.public_id || '');
      const fullId = `${folder}/${pid}`;
      return {
        end(buf: Buffer) {
          cb?.(null, {
            public_id: fullId,
            asset_id: 'cld-new-asset-id',
            resource_type: 'image',
            secure_url: `https://res.cloudinary.com/demo-test-cloud/image/authenticated/${fullId}`,
            format: 'png',
            bytes: buf.byteLength,
          });
        },
      };
    }) as never);

    vi.spyOn(cloudinary.uploader, 'destroy').mockImplementation((async (publicId: string) => {
      destroyedPublicIds.push(publicId);
      return { result: 'ok' };
    }) as never);

    const replaced = await replaceAssetInCloudinaryAndDb({
      db,
      existing: {
        id: 'asset-1',
        agency_id: 'ag-1',
        client_id: 'cl-1',
        category: 'primary_logo',
        original_name: 'old-logo.png',
        storage_key: '',
        cloudinary_public_id: 'client-onboarding/ag-1/cl-1/logos/old-logo-1',
        resource_type: 'image',
        delivery_type: 'authenticated',
      },
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      safeName: 'new-logo.png',
      mimeType: 'image/png',
    });

    expect(replaced.cloudinaryPublicId).toContain('client-onboarding/ag-1/cl-1/logos/new-logo-');
    expect(destroyedPublicIds).toEqual(['client-onboarding/ag-1/cl-1/logos/old-logo-1']);

    const row = (await db.get<{ original_name: string; cloudinary_public_id: string }>(
      'SELECT original_name, cloudinary_public_id FROM assets WHERE id = ?',
      'asset-1',
    ))!;
    expect(row.original_name).toBe('new-logo.png');
    expect(row.cloudinary_public_id).toBe(replaced.cloudinaryPublicId);
    await db.close();
  });

  it('queues failed deletions for safe retry and resolves them when Cloudinary recovers', async () => {
    setMockCloudinaryEnv();
    const db = await createSqliteAppDatabase(':memory:');
    await initSchema(db);

    const destroySpy = vi
      .spyOn(cloudinary.uploader, 'destroy')
      .mockRejectedValueOnce(new Error('Transient Cloudinary 503'))
      .mockResolvedValueOnce({ result: 'ok' } as never);

    const first = await deleteFromCloudinary({
      db,
      agencyId: 'ag-1',
      assetId: 'asset-99',
      publicId: 'client-onboarding/ag-1/cl-1/documents/contract-1',
      resourceType: 'raw',
      deliveryType: 'authenticated',
      queueOnFailure: true,
    });

    expect(first.deleted).toBe(false);
    expect(first.queuedForRetry).toBe(true);

    const queuedRow = await db.get<{ cnt: number }>('SELECT COUNT(*) as cnt FROM pending_asset_deletions');
    expect(Number(queuedRow?.cnt ?? 0)).toBe(1);

    const retrySummary = await retryPendingAssetDeletions(db);
    expect(retrySummary).toEqual({ processed: 1, resolved: 1, remaining: 0 });
    expect(destroySpy).toHaveBeenCalledTimes(2);
    await db.close();
  });

  it('migrates legacy local assets to Cloudinary and deletes local disk files only after DB update', async () => {
    setMockCloudinaryEnv();
    const db = await createSqliteAppDatabase(':memory:');
    await initSchema(db);
    const now = new Date().toISOString();

    const tempLegacyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-legacy-mig-'));
    try {
      const storageKey = path.join('ag-1', 'cl-1', 'legacy-logo.svg');
      const fullPath = path.join(tempLegacyDir, storageKey);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, '<svg xmlns="http://www.w3.org/2000/svg"><rect width="8" height="8"/></svg>', 'utf8');

      await db.run(
        `INSERT INTO agencies (id, name, support_email, required_sections_json, created_at)
         VALUES ('ag-1', 'Studio', 'hi@studio.co', '["company_info"]', ?)`,
        now,
      );
      await db.run(
        `INSERT INTO clients (id, agency_id, company_name, contact_name, email, industry, status, created_at, updated_at)
         VALUES ('cl-1', 'ag-1', 'Client', 'Bob', 'bob@c.co', 'Tech', 'in_progress', ?, ?)`,
        now,
        now,
      );
      await db.run(
        `INSERT INTO assets (
           id, agency_id, client_id, category, original_name, mime_type, size_bytes,
           storage_key, uploaded_by_name, uploaded_by_role, created_at
         ) VALUES (
           'legacy-1', 'ag-1', 'cl-1', 'primary_logo', 'legacy-logo.svg', 'image/svg+xml', 64,
           ?, 'Bob', 'client', ?
         )`,
        storageKey,
        now,
      );

      vi.spyOn(cloudinary.uploader, 'upload_stream').mockImplementation(((
        options: Record<string, unknown>,
        cb?: (err: unknown, res?: Record<string, unknown>) => void,
      ) => {
        const publicId = `${String(options.folder)}/${String(options.public_id)}`;
        return {
          end(buf: Buffer) {
            cb?.(null, {
              public_id: publicId,
              asset_id: 'cld-migrated-1',
              resource_type: 'image',
              secure_url: `https://res.cloudinary.com/demo-test-cloud/image/authenticated/${publicId}`,
              format: 'svg',
              bytes: buf.byteLength,
            });
          },
        };
      }) as never);

      const summary = await migrateLegacyAssetsToCloudinary(db, {
        legacyDir: tempLegacyDir,
        deleteLocalAfterVerify: true,
      });

      expect(summary.scanned).toBe(1);
      expect(summary.migrated).toBe(1);
      expect(summary.failed).toBe(0);
      expect(fs.existsSync(fullPath)).toBe(false);

      const updated = (await db.get<{ cloudinary_public_id: string; storage_key: string }>(
        'SELECT cloudinary_public_id, storage_key FROM assets WHERE id = ?',
        'legacy-1',
      ))!;
      expect(updated.cloudinary_public_id).toContain('client-onboarding/ag-1/cl-1/logos/legacy-logo-');
      expect(updated.storage_key).toBe('');
    } finally {
      fs.rmSync(tempLegacyDir, { recursive: true, force: true });
      await db.close();
    }
  });

  it('streams uploads cleanly with uploadBufferToCloudinary', async () => {
    setMockCloudinaryEnv();
    vi.spyOn(cloudinary.uploader, 'upload_stream').mockImplementation(((
      options: Record<string, unknown>,
      cb?: (err: unknown, res?: Record<string, unknown>) => void,
    ) => {
      const publicId = `${String(options.folder)}/${String(options.public_id)}`;
      return {
        end(buf: Buffer) {
          cb?.(null, {
            public_id: publicId,
            asset_id: 'cld-direct-1',
            resource_type: 'raw',
            secure_url: `https://res.cloudinary.com/demo-test-cloud/raw/authenticated/${publicId}`,
            format: 'pdf',
            bytes: buf.byteLength,
          });
        },
      };
    }) as never);

    const res = await uploadBufferToCloudinary({
      buffer: Buffer.from('%PDF-1.7\n'),
      originalName: 'MSA Contract.pdf',
      mimeType: 'application/pdf',
      agencyId: 'ag-1',
      clientId: 'cl-1',
      category: 'additional_document',
      assetId: 'a-1',
    });

    expect(res.resourceType).toBe('raw');
    expect(res.deliveryType).toBe('authenticated');
    expect(res.publicId).toContain('client-onboarding/ag-1/cl-1/documents/msa-contract-');
  });

  it('preserves Cloudinary upload error details for server diagnostics', async () => {
    setMockCloudinaryEnv();
    vi.spyOn(cloudinary.uploader, 'upload_stream').mockImplementation(((
      _options: Record<string, unknown>,
      cb?: (err: unknown, res?: Record<string, unknown>) => void,
    ) => ({
      end() {
        cb?.({ name: 'Unauthorized', message: 'Invalid API credentials', http_code: 401 });
      },
    })) as never);

    await expect(
      uploadBufferToCloudinary({
        buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        originalName: 'logo.png',
        mimeType: 'image/png',
        agencyId: 'ag-1',
        clientId: 'cl-1',
        category: 'primary_logo',
      }),
    ).rejects.toMatchObject({
      name: 'Unauthorized',
      message: 'Invalid API credentials',
      http_code: 401,
    });
  });

  it('safely upgrades a legacy SQLite assets table missing Cloudinary columns', async () => {
    const rawSqlite = new DatabaseSync(':memory:');
    rawSqlite.exec(`
      CREATE TABLE agencies (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, support_email TEXT NOT NULL,
        required_sections_json TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE TABLE users (
        id TEXT PRIMARY KEY, agency_id TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL, role TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE TABLE clients (
        id TEXT PRIMARY KEY, agency_id TEXT NOT NULL, company_name TEXT NOT NULL,
        contact_name TEXT NOT NULL, email TEXT NOT NULL, industry TEXT NOT NULL,
        status TEXT NOT NULL, assigned_to_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE assets (
        id TEXT PRIMARY KEY, agency_id TEXT NOT NULL, client_id TEXT NOT NULL,
        category TEXT NOT NULL, original_name TEXT NOT NULL, mime_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL, storage_key TEXT NOT NULL,
        uploaded_by_name TEXT NOT NULL, uploaded_by_role TEXT NOT NULL, created_at TEXT NOT NULL
      );
    `);

    const db = wrapSqliteDatabase(rawSqlite);
    await expect(initSchema(db)).resolves.toBeUndefined();
    const cols = await db.all<{ name: string }>('PRAGMA table_info(assets)');
    expect(cols.map((c) => c.name)).toContain('cloudinary_public_id');
    expect(cols.map((c) => c.name)).toContain('description');
    expect(cols.map((c) => c.name)).toContain('section_key');
    await db.close();
  });
});
