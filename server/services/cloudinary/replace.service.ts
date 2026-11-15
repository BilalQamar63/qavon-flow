import fs from 'node:fs';
import path from 'node:path';
import type { AssetCategory } from '../../../src/types/index.ts';
import { serverConfig } from '../../config.ts';
import type { CloudinaryDeliveryType, CloudinaryResourceType } from '../../config/cloudinary.ts';
import type { AppDatabase } from '../../db/database.ts';
import { deleteFromCloudinary } from './delete.service.ts';
import { resolveDefaultSectionKey, uploadBufferToCloudinary } from './upload.service.ts';

export interface ExistingAssetRowForReplace {
  id: string;
  agency_id: string;
  client_id: string;
  category: AssetCategory;
  original_name: string;
  storage_key: string;
  cloudinary_public_id: string;
  resource_type: CloudinaryResourceType;
  delivery_type: CloudinaryDeliveryType;
}

export interface ReplaceAssetInput {
  db: AppDatabase;
  existing: ExistingAssetRowForReplace;
  buffer: Buffer;
  safeName: string;
  mimeType: string;
}

export interface ReplaceAssetResult {
  cloudinaryPublicId: string;
  cloudinaryAssetId: string;
  resourceType: CloudinaryResourceType;
  deliveryType: CloudinaryDeliveryType;
  secureUrl: string;
  fileFormat: string;
  sizeBytes: number;
  updatedAt: string;
  previousCleanupQueued: boolean;
}

/**
 * Safely replaces an asset file:
 * 1. Uploads replacement file to Cloudinary.
 * 2. Updates DB row atomically; rolls back newly uploaded Cloudinary resource if DB fails.
 * 3. Destroys previous Cloudinary asset (or legacy local file) ONLY after DB commit succeeds.
 */
export async function replaceAssetInCloudinaryAndDb(
  input: ReplaceAssetInput,
): Promise<ReplaceAssetResult> {
  const uploaded = await uploadBufferToCloudinary({
    buffer: input.buffer,
    originalName: input.safeName,
    mimeType: input.mimeType,
    agencyId: input.existing.agency_id,
    clientId: input.existing.client_id,
    category: input.existing.category,
    assetId: input.existing.id,
  });

  const now = new Date().toISOString();
  const sectionKey = resolveDefaultSectionKey(input.existing.category);

  try {
    await input.db.transaction(async (tx) => {
      await tx.run(
        `UPDATE assets
         SET original_name = ?,
             mime_type = ?,
             size_bytes = ?,
             storage_key = '',
             cloudinary_public_id = ?,
             cloudinary_asset_id = ?,
             resource_type = ?,
             delivery_type = ?,
             secure_url = ?,
             file_format = ?,
             section_key = COALESCE(section_key, ?),
             updated_at = ?
         WHERE id = ? AND agency_id = ?`,
        input.safeName,
        input.mimeType,
        uploaded.bytes,
        uploaded.publicId,
        uploaded.assetId,
        uploaded.resourceType,
        uploaded.deliveryType,
        uploaded.secureUrl,
        uploaded.format,
        sectionKey,
        now,
        input.existing.id,
        input.existing.agency_id,
      );
      await tx.run(
        'UPDATE clients SET updated_at = ? WHERE id = ? AND agency_id = ?',
        now,
        input.existing.client_id,
        input.existing.agency_id,
      );
    });
  } catch (dbErr) {
    await deleteFromCloudinary({
      agencyId: input.existing.agency_id,
      assetId: input.existing.id,
      publicId: uploaded.publicId,
      resourceType: uploaded.resourceType,
      deliveryType: uploaded.deliveryType,
      queueOnFailure: false,
    });
    throw dbErr;
  }

  let previousCleanupQueued = false;
  if (
    input.existing.cloudinary_public_id &&
    input.existing.cloudinary_public_id !== uploaded.publicId
  ) {
    const delOutcome = await deleteFromCloudinary({
      db: input.db,
      agencyId: input.existing.agency_id,
      assetId: input.existing.id,
      publicId: input.existing.cloudinary_public_id,
      resourceType: input.existing.resource_type || 'raw',
      deliveryType: input.existing.delivery_type || 'authenticated',
      queueOnFailure: true,
    });
    previousCleanupQueued = delOutcome.queuedForRetry;
  }

  if (input.existing.storage_key) {
    const legacyPath = path.resolve(serverConfig.legacyUploadDir, input.existing.storage_key);
    if (legacyPath.startsWith(serverConfig.legacyUploadDir + path.sep)) {
      await fs.promises.unlink(legacyPath).catch(() => undefined);
    }
  }

  return {
    cloudinaryPublicId: uploaded.publicId,
    cloudinaryAssetId: uploaded.assetId,
    resourceType: uploaded.resourceType,
    deliveryType: uploaded.deliveryType,
    secureUrl: uploaded.secureUrl,
    fileFormat: uploaded.format,
    sizeBytes: uploaded.bytes,
    updatedAt: now,
    previousCleanupQueued,
  };
}
