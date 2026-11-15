import crypto from 'node:crypto';
import {
  getConfiguredCloudinary,
  isCloudinaryConfigured,
  type CloudinaryDeleteResult,
  type CloudinaryDeliveryType,
  type CloudinaryResourceType,
} from '../../config/cloudinary.ts';
import type { DbQueryExecutor } from '../../db/database.ts';
import { recordSecurityLog } from '../audit.ts';

async function queuePendingAssetDeletion(
  db: DbQueryExecutor,
  params: {
    agencyId: string;
    assetId: string;
    publicId: string;
    resourceType: CloudinaryResourceType;
    deliveryType: CloudinaryDeliveryType;
    errorMessage: string;
  },
): Promise<void> {
  const now = new Date().toISOString();
  const existing = await db.get<{ id: string; attempts: number }>(
    'SELECT id, attempts FROM pending_asset_deletions WHERE cloudinary_public_id = ? AND resource_type = ?',
    params.publicId,
    params.resourceType,
  );

  if (existing) {
    await db.run(
      `UPDATE pending_asset_deletions
       SET attempts = attempts + 1, last_error = ?, updated_at = ?
       WHERE id = ?`,
      params.errorMessage.slice(0, 500),
      now,
      existing.id,
    );
    return;
  }

  await db.run(
    `INSERT INTO pending_asset_deletions
       (id, agency_id, asset_id, cloudinary_public_id, resource_type, delivery_type, attempts, last_error, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    crypto.randomUUID(),
    params.agencyId,
    params.assetId,
    params.publicId,
    params.resourceType,
    params.deliveryType,
    params.errorMessage.slice(0, 500),
    now,
    now,
  );
}

export async function deleteFromCloudinary(params: {
  db?: DbQueryExecutor;
  agencyId: string;
  assetId: string;
  publicId: string;
  resourceType: CloudinaryResourceType;
  deliveryType?: CloudinaryDeliveryType;
  queueOnFailure?: boolean;
}): Promise<CloudinaryDeleteResult> {
  if (!params.publicId) {
    return { deleted: true, result: 'skipped_empty_public_id', queuedForRetry: false };
  }

  const deliveryType = params.deliveryType || 'authenticated';
  try {
    const cld = getConfiguredCloudinary();
    const response = (await cld.uploader.destroy(params.publicId, {
      resource_type: params.resourceType,
      type: deliveryType,
      invalidate: true,
    })) as { result?: string } | undefined;

    const outcome = response?.result || 'unknown';
    if (outcome === 'ok' || outcome === 'not found') {
      return { deleted: true, result: outcome, queuedForRetry: false };
    }

    const message = `Unexpected Cloudinary destroy result: ${outcome}`;
    if (params.db && params.queueOnFailure !== false) {
      await queuePendingAssetDeletion(params.db, {
        agencyId: params.agencyId,
        assetId: params.assetId,
        publicId: params.publicId,
        resourceType: params.resourceType,
        deliveryType,
        errorMessage: message,
      });
    }
    recordSecurityLog('cloudinary_delete_unexpected_result', {
      agencyId: params.agencyId,
      assetId: params.assetId,
      outcome,
    });
    return {
      deleted: false,
      result: outcome,
      queuedForRetry: Boolean(params.db && params.queueOnFailure !== false),
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Cloudinary delete error';
    if (params.db && params.queueOnFailure !== false) {
      await queuePendingAssetDeletion(params.db, {
        agencyId: params.agencyId,
        assetId: params.assetId,
        publicId: params.publicId,
        resourceType: params.resourceType,
        deliveryType,
        errorMessage: message,
      });
    }
    recordSecurityLog('cloudinary_delete_failed', {
      agencyId: params.agencyId,
      assetId: params.assetId,
      errorName: err instanceof Error ? err.name : 'UnknownError',
    });
    return {
      deleted: false,
      result: 'error',
      queuedForRetry: Boolean(params.db && params.queueOnFailure !== false),
    };
  }
}

export async function retryPendingAssetDeletions(
  db: DbQueryExecutor,
): Promise<{ processed: number; resolved: number; remaining: number }> {
  if (!isCloudinaryConfigured()) {
    const row = await db.get<{ cnt: number | string }>(
      'SELECT COUNT(*) as cnt FROM pending_asset_deletions',
    );
    return { processed: 0, resolved: 0, remaining: Number(row?.cnt ?? 0) };
  }

  const rows = await db.all<{
    id: string;
    agency_id: string;
    asset_id: string;
    cloudinary_public_id: string;
    resource_type: CloudinaryResourceType;
    delivery_type: CloudinaryDeliveryType;
  }>(
    'SELECT id, agency_id, asset_id, cloudinary_public_id, resource_type, delivery_type FROM pending_asset_deletions ORDER BY created_at ASC LIMIT 50',
  );

  let resolved = 0;
  for (const row of rows) {
    const outcome = await deleteFromCloudinary({
      db,
      agencyId: row.agency_id,
      assetId: row.asset_id,
      publicId: row.cloudinary_public_id,
      resourceType: row.resource_type,
      deliveryType: row.delivery_type,
      queueOnFailure: true,
    });
    if (outcome.deleted) {
      await db.run('DELETE FROM pending_asset_deletions WHERE id = ?', row.id);
      resolved += 1;
    }
  }

  const remRow = await db.get<{ cnt: number | string }>(
    'SELECT COUNT(*) as cnt FROM pending_asset_deletions',
  );
  return { processed: rows.length, resolved, remaining: Number(remRow?.cnt ?? 0) };
}
