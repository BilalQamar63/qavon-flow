import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Router, type NextFunction, type Response } from 'express';
import multer from 'multer';
import {
  assetCategoryEnum,
  sectionKeyEnum,
  updateAssetMetadataSchema,
} from '../../src/schemas/validation.ts';
import type {
  AssetCategory,
  ClientOnboardingStatus,
  OnboardingSectionKey,
  SectionCompletionStatus,
  UserRole,
} from '../../src/types/index.ts';
import { serverConfig } from '../config.ts';
import {
  CloudinaryConfigError,
  isCloudinaryConfigured,
  type AssetApiResponse,
  type CloudinaryDeliveryType,
  type CloudinaryResourceType,
} from '../config/cloudinary.ts';
import { getDb } from '../db/database.ts';
import {
  checkClientWorkspaceAccess,
  requireAgencyStaff,
  requireAuth,
  resolveSessionFromRequest,
  type AuthenticatedRequest,
} from '../middleware/auth.ts';
import { signPayload, verifySignedPayload } from '../security/crypto.ts';
import { recordActivityAndNotification, recordSecurityLog } from '../services/audit.ts';
import { getAgencyRequiredSections } from '../services/clientHydrator.ts';
import { deleteFromCloudinary } from '../services/cloudinary/delete.service.ts';
import { replaceAssetInCloudinaryAndDb } from '../services/cloudinary/replace.service.ts';
import { generateSignedCloudinaryUrls } from '../services/cloudinary/retrieve.service.ts';
import {
  resolveDefaultSectionKey,
  uploadBufferToCloudinary,
} from '../services/cloudinary/upload.service.ts';
import {
  SAFE_INLINE_MIME_TYPES,
  validateUploadedFile,
} from '../services/fileValidation.ts';
import { calculateClientProgress } from '../services/progress.ts';
import { asyncHandler } from '../utils/asyncHandler.ts';

export const assetsRouter = Router();

interface AssetDbRow {
  id: string;
  agency_id: string;
  client_id: string;
  client_name?: string;
  category: AssetCategory;
  original_name: string;
  mime_type: string;
  size_bytes: number | string;
  storage_key: string;
  cloudinary_public_id: string;
  cloudinary_asset_id: string;
  resource_type: CloudinaryResourceType;
  delivery_type: CloudinaryDeliveryType;
  secure_url: string;
  file_format: string;
  description: string;
  section_key: OnboardingSectionKey | null;
  uploaded_by_name: string;
  uploaded_by_role: UserRole;
  created_at: string;
  updated_at: string | null;
  assigned_to_id?: string | null;
  client_status?: ClientOnboardingStatus;
}

function mapAssetRowToResponse(r: AssetDbRow): AssetApiResponse & {
  storageProvider: 'cloudinary' | 'legacy_pending';
} {
  return {
    id: r.id,
    agencyId: r.agency_id,
    clientId: r.client_id,
    ...(r.client_name !== undefined ? { clientName: r.client_name } : {}),
    category: r.category,
    originalName: r.original_name,
    mimeType: r.mime_type,
    sizeBytes: Number(r.size_bytes),
    fileFormat: r.file_format || undefined,
    resourceType: r.resource_type,
    description: r.description || '',
    sectionKey: r.section_key || resolveDefaultSectionKey(r.category),
    storageProvider: r.cloudinary_public_id ? 'cloudinary' : 'legacy_pending',
    uploadedByName: r.uploaded_by_name,
    uploadedByRole: r.uploaded_by_role,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: serverConfig.maxUploadBytes,
  },
});

assetsRouter.get(
  '/',
  requireAgencyStaff(['admin', 'member']),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const session = req.sessionUser!;
    const agencyId = session.agencyId;
    const clientId = typeof req.query.clientId === 'string' ? req.query.clientId : '';
    const category = typeof req.query.category === 'string' ? req.query.category : '';
    const sectionKey = typeof req.query.sectionKey === 'string' ? req.query.sectionKey : '';
    const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
    const rawLimit = Number.parseInt(String(req.query.limit ?? '500'), 10);
    const rawOffset = Number.parseInt(String(req.query.offset ?? '0'), 10);
    const limit = Number.isFinite(rawLimit) ? Math.min(500, Math.max(1, rawLimit)) : 500;
    const offset = Number.isFinite(rawOffset) ? Math.max(0, rawOffset) : 0;

    const db = await getDb();
    let sql = `
      SELECT a.id, a.agency_id, a.client_id, c.company_name as client_name, a.category, a.original_name,
             a.mime_type, a.size_bytes, a.storage_key, a.cloudinary_public_id, a.cloudinary_asset_id,
             a.resource_type, a.delivery_type, a.secure_url, a.file_format, a.description, a.section_key,
             a.uploaded_by_name, a.uploaded_by_role, a.created_at, a.updated_at
      FROM assets a
      JOIN clients c ON c.id = a.client_id
      WHERE a.agency_id = ? AND c.agency_id = ?
    `;
    const params: (string | number)[] = [agencyId, agencyId];

    if (session.role === 'member') {
      sql += ` AND c.assigned_to_id = ?`;
      params.push(session.id);
    }
    if (clientId) {
      sql += ` AND a.client_id = ?`;
      params.push(clientId);
    }
    if (category) {
      sql += ` AND a.category = ?`;
      params.push(category);
    }
    if (sectionKey) {
      sql += ` AND a.section_key = ?`;
      params.push(sectionKey);
    }
    if (search) {
      sql += ` AND (LOWER(a.original_name) LIKE ? OR LOWER(c.company_name) LIKE ? OR LOWER(a.description) LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    sql += ` ORDER BY a.created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const rows = (await db.all(sql, ...params)) as unknown as AssetDbRow[];

    res.json({
      assets: rows.map(mapAssetRowToResponse),
    });
  }),
);

assetsRouter.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const assetId = String(req.params.id);
    const session = req.sessionUser!;
    const db = await getDb();

    const asset = (await db.get(
      `SELECT a.*, c.company_name as client_name, c.assigned_to_id
       FROM assets a
       JOIN clients c ON c.id = a.client_id
       WHERE a.id = ? AND a.agency_id = ? AND c.agency_id = ?`,
      assetId,
      session.agencyId,
      session.agencyId,
    )) as AssetDbRow | undefined;

    if (!asset) {
      res.status(404).json({ error: 'Asset not found' });
      return;
    }

    if (session.role === 'client' && session.clientId !== asset.client_id) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
    if (session.role === 'member' && asset.assigned_to_id !== session.id) {
      res.status(403).json({ error: 'Team members can only view assets for assigned clients' });
      return;
    }

    const dlToken = signPayload(
      {
        assetId: asset.id,
        agencyId: asset.agency_id,
        clientId: asset.client_id,
      },
      300,
    );

    let cloudinarySignedUrls: {
      previewUrl: string;
      downloadUrl: string;
      expiresAtUnix: number;
    } | null = null;

    if (asset.cloudinary_public_id && isCloudinaryConfigured()) {
      const urls = generateSignedCloudinaryUrls({
        publicId: asset.cloudinary_public_id,
        resourceType: asset.resource_type,
        deliveryType: asset.delivery_type,
        fileFormat: asset.file_format,
        originalName: asset.original_name,
        mimeType: asset.mime_type,
        expiresInSeconds: 300,
      });
      cloudinarySignedUrls = {
        previewUrl: urls.previewUrl,
        downloadUrl: urls.downloadUrl,
        expiresAtUnix: urls.expiresAtUnix,
      };
    }

    res.json({
      asset: mapAssetRowToResponse(asset),
      previewUrl: `/api/assets/${asset.id}/download?dlToken=${encodeURIComponent(dlToken)}&inline=1`,
      downloadUrl: `/api/assets/${asset.id}/download?dlToken=${encodeURIComponent(dlToken)}`,
      cloudinarySignedUrls,
    });
  }),
);

async function handleAssetUpload(req: AuthenticatedRequest, res: Response): Promise<void> {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: 'No file attached' });
    return;
  }

  const validation = validateUploadedFile(file);
  if (!validation.ok) {
    res.status(400).json({ error: validation.error });
    return;
  }

  const clientId = typeof req.body?.clientId === 'string' ? req.body.clientId : '';
  const catParsed = assetCategoryEnum.safeParse(req.body?.category);
  if (!clientId || !catParsed.success) {
    res.status(400).json({ error: 'Valid clientId and asset category are required' });
    return;
  }

  const descriptionRaw =
    typeof req.body?.description === 'string' ? req.body.description.trim().slice(0, 500) : '';
  const sectionKeyParsed =
    typeof req.body?.sectionKey === 'string' && req.body.sectionKey.trim()
      ? sectionKeyEnum.safeParse(req.body.sectionKey.trim())
      : null;
  if (sectionKeyParsed && !sectionKeyParsed.success) {
    res.status(400).json({ error: 'Invalid onboarding section key' });
    return;
  }
  const sectionKey: OnboardingSectionKey = sectionKeyParsed?.success
    ? sectionKeyParsed.data
    : resolveDefaultSectionKey(catParsed.data);

  const session = req.sessionUser!;
  const access = await checkClientWorkspaceAccess(session, clientId);
  if (!access.ok) {
    if (access.code === 403) {
      recordSecurityLog('asset_upload_denied', {
        agencyId: session.agencyId,
        clientId,
        actorId: session.id,
        role: session.role,
      });
    }
    res.status(access.code).json({ error: access.error });
    return;
  }

  if (
    session.role === 'client' &&
    (access.status === 'completed' || access.status === 'archived')
  ) {
    res.status(403).json({
      error: 'This onboarding workspace is completed and locked.',
    });
    return;
  }

  const db = await getDb();
  const client = await db.get<{ id: string; company_name: string }>(
    'SELECT id, company_name FROM clients WHERE id = ? AND agency_id = ?',
    clientId,
    session.agencyId,
  );

  if (!client) {
    res.status(404).json({ error: 'Client workspace not found' });
    return;
  }

  const assetId = crypto.randomUUID();
  let uploaded;
  try {
    uploaded = await uploadBufferToCloudinary({
      buffer: file.buffer,
      originalName: validation.safeName,
      mimeType: file.mimetype,
      agencyId: session.agencyId,
      clientId,
      category: catParsed.data,
      assetId,
    });
  } catch (err: unknown) {
    if (err instanceof CloudinaryConfigError) {
      res.status(503).json({ error: err.message });
      return;
    }
    const cloudinaryHttpCode =
      typeof err === 'object' && err !== null && 'http_code' in err &&
      typeof err.http_code === 'number'
        ? err.http_code
        : undefined;
    const errorName =
      err instanceof Error
        ? err.name
        : typeof err === 'object' &&
            err !== null &&
            'name' in err &&
            typeof err.name === 'string'
          ? err.name
          : 'UnknownError';
    recordSecurityLog('cloudinary_upload_failed', {
      agencyId: session.agencyId,
      clientId,
      errorName,
      cloudinaryHttpCode,
    });
    res.status(502).json({ error: 'Cloud file storage upload failed. Please retry.' });
    return;
  }

  const now = new Date().toISOString();

  try {
    await db.transaction(async (tx) => {
      await tx.run(
        `INSERT INTO assets (
           id, agency_id, client_id, category, original_name, mime_type, size_bytes,
           storage_key, cloudinary_public_id, cloudinary_asset_id, resource_type, delivery_type,
           secure_url, file_format, description, section_key, uploaded_by_name, uploaded_by_role,
           created_at, updated_at
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        assetId,
        session.agencyId,
        clientId,
        catParsed.data,
        validation.safeName,
        file.mimetype,
        uploaded.bytes,
        uploaded.publicId,
        uploaded.assetId,
        uploaded.resourceType,
        uploaded.deliveryType,
        uploaded.secureUrl,
        uploaded.format,
        descriptionRaw,
        sectionKey,
        session.name,
        session.role,
        now,
        now,
      );

      await tx.run(
        'UPDATE clients SET updated_at = ? WHERE id = ? AND agency_id = ?',
        now,
        clientId,
        session.agencyId,
      );
    });
  } catch (dbErr) {
    // Rollback orphaned Cloudinary resource on DB failure
    await deleteFromCloudinary({
      agencyId: session.agencyId,
      assetId,
      publicId: uploaded.publicId,
      resourceType: uploaded.resourceType,
      deliveryType: uploaded.deliveryType,
      queueOnFailure: false,
    });
    throw dbErr;
  }

  const agencyPref = await db.get<{ notify_on_asset_upload: number }>(
    'SELECT notify_on_asset_upload FROM agencies WHERE id = ?',
    session.agencyId,
  );
  const shouldNotify = Boolean(agencyPref?.notify_on_asset_upload ?? 1);

  await recordActivityAndNotification(db, {
    agencyId: session.agencyId,
    clientId,
    actorName: session.name,
    actorRole: session.role,
    action: 'Asset Uploaded',
    details: `Uploaded ${validation.safeName} (${catParsed.data}) for ${client.company_name}`,
    notificationTitle: shouldNotify ? 'New Asset Uploaded' : undefined,
    notificationMessage: shouldNotify
      ? `${session.name} uploaded ${validation.safeName} for ${client.company_name}.`
      : undefined,
  });

  res.status(201).json({
    asset: {
      id: assetId,
      agencyId: session.agencyId,
      clientId,
      clientName: client.company_name,
      category: catParsed.data,
      originalName: validation.safeName,
      mimeType: file.mimetype,
      sizeBytes: uploaded.bytes,
      fileFormat: uploaded.format || undefined,
      resourceType: uploaded.resourceType,
      description: descriptionRaw,
      sectionKey,
      storageProvider: 'cloudinary',
      uploadedByName: session.name,
      uploadedByRole: session.role,
      createdAt: now,
      updatedAt: now,
    },
  });
}

assetsRouter.post('/', requireAuth, upload.single('file'), asyncHandler(handleAssetUpload));
assetsRouter.post('/upload', requireAuth, upload.single('file'), asyncHandler(handleAssetUpload));

assetsRouter.patch(
  '/:id',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const parsed = updateAssetMetadataSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid asset update' });
      return;
    }

    const assetId = String(req.params.id);
    const session = req.sessionUser!;
    const db = await getDb();

    const existing = (await db.get(
      `SELECT a.*, c.company_name as client_name, c.assigned_to_id, c.status as client_status
       FROM assets a
       JOIN clients c ON c.id = a.client_id
       WHERE a.id = ? AND a.agency_id = ? AND c.agency_id = ?`,
      assetId,
      session.agencyId,
      session.agencyId,
    )) as AssetDbRow | undefined;

    if (!existing) {
      res.status(404).json({ error: 'Asset not found' });
      return;
    }

    if (session.role === 'client') {
      if (session.clientId !== existing.client_id) {
        res.status(403).json({ error: 'Clients can only update assets in their own workspace' });
        return;
      }
      if (existing.client_status === 'completed' || existing.client_status === 'archived') {
        res.status(403).json({ error: 'This onboarding workspace is completed and locked.' });
        return;
      }
      if (existing.uploaded_by_role !== 'client') {
        res.status(403).json({ error: 'Clients can only edit files they uploaded' });
        return;
      }
    } else if (session.role === 'member' && existing.assigned_to_id !== session.id) {
      res.status(403).json({ error: 'Team members can only update assets for assigned clients' });
      return;
    }

    const nextOriginalName = parsed.data.originalName
      ? parsed.data.originalName.replace(/[^\w.\-() ]+/g, '_').slice(0, 140) || existing.original_name
      : existing.original_name;
    const nextCategory = parsed.data.category ?? existing.category;
    const nextDescription = parsed.data.description ?? existing.description;
    const nextSectionKey =
      parsed.data.sectionKey !== undefined
        ? parsed.data.sectionKey
        : parsed.data.category
          ? resolveDefaultSectionKey(nextCategory)
          : existing.section_key;

    const now = new Date().toISOString();

    await db.run(
      `UPDATE assets
       SET original_name = ?, category = ?, description = ?, section_key = ?, updated_at = ?
       WHERE id = ? AND agency_id = ?`,
      nextOriginalName,
      nextCategory,
      nextDescription,
      nextSectionKey,
      now,
      existing.id,
      session.agencyId,
    );
    await db.run(
      'UPDATE clients SET updated_at = ? WHERE id = ? AND agency_id = ?',
      now,
      existing.client_id,
      session.agencyId,
    );

    const updated = (await db.get(
      `SELECT a.*, c.company_name as client_name
       FROM assets a
       JOIN clients c ON c.id = a.client_id
       WHERE a.id = ? AND a.agency_id = ?`,
      existing.id,
      session.agencyId,
    )) as unknown as AssetDbRow;

    await recordActivityAndNotification(db, {
      agencyId: session.agencyId,
      clientId: existing.client_id,
      actorName: session.name,
      actorRole: session.role,
      action: 'Asset Updated',
      details: `Updated metadata for ${nextOriginalName}`,
    });

    res.json({ asset: mapAssetRowToResponse(updated) });
  }),
);

assetsRouter.put(
  '/:id',
  requireAuth,
  upload.single('file'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'Replacement file is required' });
      return;
    }

    const validation = validateUploadedFile(file);
    if (!validation.ok) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const assetId = String(req.params.id);
    const session = req.sessionUser!;
    const db = await getDb();

    const existing = (await db.get(
      `SELECT a.*, c.company_name as client_name, c.assigned_to_id, c.status as client_status
       FROM assets a
       JOIN clients c ON c.id = a.client_id
       WHERE a.id = ? AND a.agency_id = ? AND c.agency_id = ?`,
      assetId,
      session.agencyId,
      session.agencyId,
    )) as AssetDbRow | undefined;

    if (!existing) {
      res.status(404).json({ error: 'Asset not found' });
      return;
    }

    if (session.role === 'client') {
      if (session.clientId !== existing.client_id) {
        res.status(403).json({ error: 'Clients can only replace assets in their own workspace' });
        return;
      }
      if (existing.client_status === 'completed' || existing.client_status === 'archived') {
        res.status(403).json({ error: 'This onboarding workspace is completed and locked.' });
        return;
      }
      if (existing.uploaded_by_role !== 'client') {
        res.status(403).json({ error: 'Clients can only replace files they uploaded' });
        return;
      }
    } else if (session.role === 'member' && existing.assigned_to_id !== session.id) {
      res.status(403).json({ error: 'Team members can only replace assets in assigned workspaces' });
      return;
    }

    try {
      await replaceAssetInCloudinaryAndDb({
        db,
        existing: {
          id: existing.id,
          agency_id: existing.agency_id,
          client_id: existing.client_id,
          category: existing.category,
          original_name: existing.original_name,
          storage_key: existing.storage_key,
          cloudinary_public_id: existing.cloudinary_public_id,
          resource_type: existing.resource_type,
          delivery_type: existing.delivery_type,
        },
        buffer: file.buffer,
        safeName: validation.safeName,
        mimeType: file.mimetype,
      });
    } catch (err: unknown) {
      if (err instanceof CloudinaryConfigError) {
        res.status(503).json({ error: err.message });
        return;
      }
      recordSecurityLog('cloudinary_replace_failed', {
        agencyId: session.agencyId,
        assetId: existing.id,
        errorName: err instanceof Error ? err.name : 'UnknownError',
      });
      res.status(502).json({ error: 'Unable to replace asset file in cloud storage.' });
      return;
    }

    const updated = (await db.get(
      `SELECT a.*, c.company_name as client_name
       FROM assets a
       JOIN clients c ON c.id = a.client_id
       WHERE a.id = ? AND a.agency_id = ?`,
      existing.id,
      session.agencyId,
    )) as unknown as AssetDbRow;

    await recordActivityAndNotification(db, {
      agencyId: session.agencyId,
      clientId: existing.client_id,
      actorName: session.name,
      actorRole: session.role,
      action: 'Asset Replaced',
      details: `Replaced ${existing.original_name} with ${validation.safeName}`,
    });

    res.json({ asset: mapAssetRowToResponse(updated) });
  }),
);

assetsRouter.post(
  '/:id/download-token',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const assetId = String(req.params.id);
    const session = req.sessionUser!;
    const db = await getDb();
    const asset = await db.get<{
      id: string;
      agency_id: string;
      client_id: string;
      assigned_to_id: string | null;
    }>(
      `SELECT a.id, a.agency_id, a.client_id, c.assigned_to_id
       FROM assets a
       JOIN clients c ON c.id = a.client_id
       WHERE a.id = ? AND a.agency_id = ? AND c.agency_id = ?`,
      assetId,
      session.agencyId,
      session.agencyId,
    );

    if (!asset) {
      res.status(404).json({ error: 'Asset not found' });
      return;
    }

    if (session.role === 'client' && session.clientId !== asset.client_id) {
      recordSecurityLog('asset_download_token_denied', {
        agencyId: session.agencyId,
        assetId: asset.id,
        role: session.role,
      });
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    if (session.role === 'member' && asset.assigned_to_id !== session.id) {
      recordSecurityLog('asset_download_token_denied', {
        agencyId: session.agencyId,
        assetId: asset.id,
        actorId: session.id,
        role: session.role,
      });
      res.status(403).json({ error: 'Team members can only access assets for assigned clients' });
      return;
    }

    const dlToken = signPayload(
      {
        assetId: asset.id,
        agencyId: asset.agency_id,
        clientId: asset.client_id,
      },
      300,
    );

    res.json({
      url: `/api/assets/${asset.id}/download?dlToken=${encodeURIComponent(dlToken)}`,
    });
  }),
);

assetsRouter.get(
  '/:id/download',
  asyncHandler(async (req, res) => {
    const assetId = String(req.params.id);
    const dlToken = typeof req.query.dlToken === 'string' ? req.query.dlToken : '';
    const requestedInline = req.query.inline === '1';

    let authorizedAgencyId: string | null = null;
    let authorizedClientId: string | null = null;
    let sessionUserId: string | null = null;
    let isClientRole = false;
    let isMemberRole = false;

    if (dlToken) {
      const verified = verifySignedPayload<{ assetId: string; agencyId: string; clientId: string }>(
        dlToken,
      );
      if (!verified || verified.assetId !== assetId) {
        recordSecurityLog('asset_download_invalid_token', { assetId });
        res.status(401).json({ error: 'Invalid or expired download link' });
        return;
      }
      authorizedAgencyId = verified.agencyId;
      authorizedClientId = verified.clientId;
    } else {
      const session = await resolveSessionFromRequest(req);
      if (!session) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }
      authorizedAgencyId = session.agencyId;
      authorizedClientId = session.clientId ?? null;
      sessionUserId = session.id;
      isClientRole = session.role === 'client';
      isMemberRole = session.role === 'member';
    }

    const db = await getDb();
    const asset = await db.get<{
      id: string;
      agency_id: string;
      client_id: string;
      original_name: string;
      mime_type: string;
      storage_key: string;
      cloudinary_public_id: string;
      resource_type: CloudinaryResourceType;
      delivery_type: CloudinaryDeliveryType;
      file_format: string;
      assigned_to_id: string | null;
    }>(
      `SELECT a.id, a.agency_id, a.client_id, a.original_name, a.mime_type, a.storage_key,
              a.cloudinary_public_id, a.resource_type, a.delivery_type, a.file_format, c.assigned_to_id
       FROM assets a
       JOIN clients c ON c.id = a.client_id
       WHERE a.id = ? AND a.agency_id = ? AND c.agency_id = ?`,
      assetId,
      authorizedAgencyId,
      authorizedAgencyId,
    );

    if (!asset) {
      res.status(404).json({ error: 'Asset not found' });
      return;
    }

    if ((isClientRole || dlToken) && authorizedClientId !== asset.client_id) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    if (!dlToken && isMemberRole && asset.assigned_to_id !== sessionUserId) {
      res.status(403).json({ error: 'Team members can only download assets for assigned clients' });
      return;
    }

    if (!asset.cloudinary_public_id) {
      res.status(409).json({
        error:
          'This legacy asset has not been migrated to Cloudinary yet. Configure CLOUDINARY_* variables and run npm run migrate:cloudinary.',
      });
      return;
    }

    let signedUrls;
    try {
      signedUrls = generateSignedCloudinaryUrls({
        publicId: asset.cloudinary_public_id,
        resourceType: asset.resource_type || 'raw',
        deliveryType: asset.delivery_type || 'authenticated',
        fileFormat: asset.file_format,
        originalName: asset.original_name,
        mimeType: asset.mime_type,
        expiresInSeconds: 300,
      });
    } catch (err: unknown) {
      if (err instanceof CloudinaryConfigError) {
        res.status(503).json({ error: err.message });
        return;
      }
      throw err;
    }

    const allowInline = requestedInline && SAFE_INLINE_MIME_TYPES.has(asset.mime_type);
    const safeDispositionName = asset.original_name.replace(/["\\\r\n]/g, '_');

    try {
      const targetUrl = allowInline ? signedUrls.originalUrl : signedUrls.downloadUrl;
      const upstream = await fetch(targetUrl);
      if (!upstream.ok) {
        res.status(upstream.status === 404 ? 404 : 502).json({
          error: 'Asset file missing or inaccessible from Cloudinary storage',
        });
        return;
      }

      const buffer = Buffer.from(await upstream.arrayBuffer());
      res.setHeader('Content-Type', asset.mime_type);
      res.setHeader(
        'Content-Disposition',
        `${allowInline ? 'inline' : 'attachment'}; filename="${safeDispositionName}"; filename*=UTF-8''${encodeURIComponent(asset.original_name)}`,
      );
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
      res.setHeader(
        'Content-Security-Policy',
        asset.mime_type === 'application/pdf'
          ? "default-src 'none'; frame-ancestors 'self'"
          : "default-src 'none'; style-src 'unsafe-inline'; sandbox; frame-ancestors 'self'",
      );
      res.send(buffer);
    } catch {
      res.status(502).json({ error: 'Unable to retrieve asset stream from Cloudinary' });
    }
  }),
);

assetsRouter.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const assetId = String(req.params.id);
    const session = req.sessionUser!;
    const db = await getDb();
    const asset = await db.get<{
      id: string;
      agency_id: string;
      client_id: string;
      original_name: string;
      storage_key: string;
      cloudinary_public_id: string;
      resource_type: CloudinaryResourceType;
      delivery_type: CloudinaryDeliveryType;
      uploaded_by_role: UserRole;
      assigned_to_id: string | null;
      client_status: ClientOnboardingStatus;
    }>(
      `SELECT a.id, a.agency_id, a.client_id, a.original_name, a.storage_key,
              a.cloudinary_public_id, a.resource_type, a.delivery_type,
              a.uploaded_by_role, c.assigned_to_id, c.status as client_status
       FROM assets a
       JOIN clients c ON c.id = a.client_id
       WHERE a.id = ? AND a.agency_id = ? AND c.agency_id = ?`,
      assetId,
      session.agencyId,
      session.agencyId,
    );

    if (!asset) {
      res.status(404).json({ error: 'Asset not found' });
      return;
    }

    if (session.role === 'client') {
      if (session.clientId !== asset.client_id) {
        res.status(403).json({ error: 'Clients can only delete assets in their own workspace' });
        return;
      }
      if (asset.client_status === 'completed' || asset.client_status === 'archived') {
        res.status(403).json({ error: 'This onboarding workspace is completed and locked.' });
        return;
      }
      if (asset.uploaded_by_role !== 'client') {
        recordSecurityLog('client_asset_delete_denied', {
          agencyId: session.agencyId,
          clientId: asset.client_id,
          assetId: asset.id,
        });
        res.status(403).json({ error: 'Clients can only delete files they uploaded' });
        return;
      }
    } else if (session.role === 'member' && asset.assigned_to_id !== session.id) {
      recordSecurityLog('member_asset_delete_denied', {
        agencyId: session.agencyId,
        clientId: asset.client_id,
        assetId: asset.id,
        actorId: session.id,
      });
      res.status(403).json({ error: 'Team members can only delete assets in assigned workspaces' });
      return;
    }

    let cloudCleanupQueued = false;
    if (asset.cloudinary_public_id) {
      const deleteOutcome = await deleteFromCloudinary({
        db,
        agencyId: session.agencyId,
        assetId: asset.id,
        publicId: asset.cloudinary_public_id,
        resourceType: asset.resource_type || 'raw',
        deliveryType: asset.delivery_type || 'authenticated',
        queueOnFailure: true,
      });
      cloudCleanupQueued = deleteOutcome.queuedForRetry;
    }

    if (asset.storage_key) {
      const legacyPath = path.resolve(serverConfig.legacyUploadDir, asset.storage_key);
      if (legacyPath.startsWith(serverConfig.legacyUploadDir + path.sep)) {
        await fs.promises.unlink(legacyPath).catch(() => undefined);
      }
    }

    await db.run('DELETE FROM assets WHERE id = ? AND agency_id = ?', asset.id, session.agencyId);

    const now = new Date().toISOString();

    if (asset.client_status === 'in_review' || asset.client_status === 'completed') {
      const [requiredSections, sections, remainingAssets, credRow] = await Promise.all([
        getAgencyRequiredSections(db, session.agencyId),
        db.all<{
          section_key: OnboardingSectionKey;
          status: SectionCompletionStatus;
          data_json: string;
          updated_at: string | null;
        }>(
          'SELECT section_key, status, data_json, updated_at FROM onboarding_sections WHERE client_id = ? AND agency_id = ?',
          asset.client_id,
          session.agencyId,
        ),
        db.all<{ category: AssetCategory; created_at: string }>(
          'SELECT category, created_at FROM assets WHERE client_id = ? AND agency_id = ?',
          asset.client_id,
          session.agencyId,
        ),
        db.get<{ cnt: number | string }>(
          'SELECT COUNT(*) as cnt FROM credentials WHERE client_id = ? AND agency_id = ?',
          asset.client_id,
          session.agencyId,
        ),
      ]);
      const credCount = Number(credRow?.cnt ?? 0);

      const progress = calculateClientProgress({
        requiredSections,
        sections,
        assets: remainingAssets,
        credentialCount: credCount,
        clientUpdatedAt: now,
      });

      if (progress.overallPercentage < 100) {
        await db.run(
          `UPDATE clients SET status = 'in_progress', updated_at = ? WHERE id = ? AND agency_id = ?`,
          now,
          asset.client_id,
          session.agencyId,
        );
      } else {
        await db.run(
          'UPDATE clients SET updated_at = ? WHERE id = ? AND agency_id = ?',
          now,
          asset.client_id,
          session.agencyId,
        );
      }
    } else {
      await db.run(
        'UPDATE clients SET updated_at = ? WHERE id = ? AND agency_id = ?',
        now,
        asset.client_id,
        session.agencyId,
      );
    }

    await recordActivityAndNotification(db, {
      agencyId: session.agencyId,
      clientId: asset.client_id,
      actorName: session.name,
      actorRole: session.role,
      action: 'Asset Deleted',
      details: `Deleted ${asset.original_name}`,
    });

    res.json({ ok: true, cloudCleanupQueued });
  }),
);

assetsRouter.use((err: unknown, _req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({ error: 'File exceeds the 15 MB upload limit.' });
    return;
  }
  next(err);
});
