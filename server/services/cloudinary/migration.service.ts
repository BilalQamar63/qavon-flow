import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import type { AssetCategory } from '../../../src/types/index.ts';
import { serverConfig } from '../../config.ts';
import { assertCloudinaryConfigured } from '../../config/cloudinary.ts';
import { getDb, type DbQueryExecutor } from '../../db/database.ts';
import { deleteFromCloudinary } from './delete.service.ts';
import { resolveDefaultSectionKey, uploadBufferToCloudinary } from './upload.service.ts';

export interface MigrationItemResult {
  assetId: string;
  originalName: string;
  status: 'migrated' | 'skipped_missing_file' | 'failed';
  cloudinaryPublicId?: string;
  error?: string;
}

export interface MigrationSummary {
  scanned: number;
  migrated: number;
  skippedMissingFile: number;
  failed: number;
  items: MigrationItemResult[];
}

function resolveSafeLegacyPath(baseDir: string, storageKey: string): string {
  const normalized = path.normalize(storageKey).replace(/^(\.\.(\/|\\|$))+/, '');
  const fullPath = path.resolve(baseDir, normalized);
  if (!fullPath.startsWith(baseDir + path.sep) && fullPath !== baseDir) {
    throw new Error('Unsafe legacy storage key path');
  }
  return fullPath;
}

export async function migrateLegacyAssetsToCloudinary(
  db: DbQueryExecutor,
  options: { deleteLocalAfterVerify?: boolean; legacyDir?: string } = {},
): Promise<MigrationSummary> {
  assertCloudinaryConfigured();
  const baseDir = options.legacyDir || serverConfig.legacyUploadDir;
  const deleteLocal = options.deleteLocalAfterVerify !== false;

  const rows = await db.all<{
    id: string;
    agency_id: string;
    client_id: string;
    category: AssetCategory;
    original_name: string;
    mime_type: string;
    storage_key: string;
  }>(
    `SELECT id, agency_id, client_id, category, original_name, mime_type, storage_key
     FROM assets
     WHERE (cloudinary_public_id IS NULL OR cloudinary_public_id = '')
       AND storage_key IS NOT NULL AND storage_key != ''
     ORDER BY created_at ASC`,
  );

  const summary: MigrationSummary = {
    scanned: rows.length,
    migrated: 0,
    skippedMissingFile: 0,
    failed: 0,
    items: [],
  };

  for (const row of rows) {
    let fullPath: string;
    try {
      fullPath = resolveSafeLegacyPath(baseDir, row.storage_key);
    } catch (err) {
      summary.failed += 1;
      summary.items.push({
        assetId: row.id,
        originalName: row.original_name,
        status: 'failed',
        error: err instanceof Error ? err.message : 'Invalid path',
      });
      continue;
    }

    if (!fs.existsSync(fullPath)) {
      summary.skippedMissingFile += 1;
      summary.items.push({
        assetId: row.id,
        originalName: row.original_name,
        status: 'skipped_missing_file',
        error: 'Legacy file does not exist on disk',
      });
      continue;
    }

    try {
      const buffer = await fs.promises.readFile(fullPath);
      const uploaded = await uploadBufferToCloudinary({
        buffer,
        originalName: row.original_name,
        mimeType: row.mime_type,
        agencyId: row.agency_id,
        clientId: row.client_id,
        category: row.category,
        assetId: row.id,
      });

      const now = new Date().toISOString();
      const sectionKey = resolveDefaultSectionKey(row.category);

      try {
        await db.run(
          `UPDATE assets
           SET cloudinary_public_id = ?,
               cloudinary_asset_id = ?,
               resource_type = ?,
               delivery_type = ?,
               secure_url = ?,
               file_format = ?,
               section_key = COALESCE(section_key, ?),
               size_bytes = ?,
               storage_key = '',
               updated_at = ?
           WHERE id = ? AND agency_id = ?`,
          uploaded.publicId,
          uploaded.assetId,
          uploaded.resourceType,
          uploaded.deliveryType,
          uploaded.secureUrl,
          uploaded.format,
          sectionKey,
          uploaded.bytes,
          now,
          row.id,
          row.agency_id,
        );
      } catch (dbErr) {
        await deleteFromCloudinary({
          agencyId: row.agency_id,
          assetId: row.id,
          publicId: uploaded.publicId,
          resourceType: uploaded.resourceType,
          deliveryType: uploaded.deliveryType,
          queueOnFailure: false,
        });
        throw dbErr;
      }

      if (deleteLocal) {
        await fs.promises.unlink(fullPath).catch(() => undefined);
      }

      summary.migrated += 1;
      summary.items.push({
        assetId: row.id,
        originalName: row.original_name,
        status: 'migrated',
        cloudinaryPublicId: uploaded.publicId,
      });
    } catch (err) {
      summary.failed += 1;
      summary.items.push({
        assetId: row.id,
        originalName: row.original_name,
        status: 'failed',
        error: err instanceof Error ? err.message : 'Migration failed',
      });
    }
  }

  return summary;
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  getDb()
    .then((db) => migrateLegacyAssetsToCloudinary(db))
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      if (result.failed > 0) {
        process.exitCode = 1;
      }
    })
    .catch((err: unknown) => {
      console.error(err instanceof Error ? err.message : 'Migration error');
      process.exitCode = 1;
    });
}
