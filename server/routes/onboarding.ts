import crypto from 'node:crypto';
import { Router } from 'express';
import {
  DEFAULT_SECTION_DATA,
  ONBOARDING_SECTIONS,
  getNestedObjectValue,
  isOnboardingValueFilled,
  safeJsonParse,
} from '../../src/constants/onboarding.ts';
import {
  accessCredentialsMetaSchema,
  additionalDocumentsMetaSchema,
  brandAssetsSchema,
  companyInfoSchema,
  credentialInputSchema,
  projectRequirementsSchema,
  sectionKeyEnum,
  websiteContentSchema,
} from '../../src/schemas/validation.ts';
import type {
  AnySectionData,
  AssetCategory,
  ClientOnboardingStatus,
  OnboardingSectionKey,
  SectionCompletionStatus,
  UserRole,
} from '../../src/types/index.ts';
import { getDb } from '../db/database.ts';
import {
  checkClientWorkspaceAccess,
  requireAgencyStaff,
  requireClientScope,
  type AuthenticatedRequest,
} from '../middleware/auth.ts';
import { decryptSecret, encryptSecret, maskUsername } from '../security/crypto.ts';
import { createRateLimiter } from '../security/rateLimit.ts';
import { recordActivityAndNotification, recordSecurityLog } from '../services/audit.ts';
import { getAgencyRequiredSections } from '../services/clientHydrator.ts';
import { calculateClientProgress } from '../services/progress.ts';
import { asyncHandler } from '../utils/asyncHandler.ts';

export const onboardingRouter = Router();

const revealLimiter = createRateLimiter({
  windowMs: 60_000,
  maxRequests: 20,
  keyPrefix: 'cred_reveal',
  keyResolver: (req) => (req as AuthenticatedRequest).sessionUser?.id || null,
});

const sectionSchemaMap = {
  company_info: companyInfoSchema,
  brand_assets: brandAssetsSchema,
  website_content: websiteContentSchema,
  project_requirements: projectRequirementsSchema,
  access_credentials: accessCredentialsMetaSchema,
  additional_documents: additionalDocumentsMetaSchema,
} as const;

const SECTION_DEF_MAP = new Map(ONBOARDING_SECTIONS.map((s) => [s.key, s]));

onboardingRouter.get(
  '/:clientId',
  requireClientScope,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const clientId = String(req.params.clientId);
    const agencyId = req.sessionUser!.agencyId;
    const db = await getDb();

    const clientRow = await db.get<{
      id: string;
      company_name: string;
      contact_name: string;
      email: string;
      phone: string;
      website: string;
      industry: string;
      description: string;
      internal_notes: string;
      status: ClientOnboardingStatus;
      due_date: string | null;
      updated_at: string;
    }>(
      `SELECT id, company_name, contact_name, email, phone, website, industry, description, internal_notes, status, due_date, updated_at
       FROM clients WHERE id = ? AND agency_id = ?`,
      clientId,
      agencyId,
    );

    if (!clientRow) {
      res.status(404).json({ error: 'Client workspace not found' });
      return;
    }

    const [requiredSections, sectionRows, credentials, assets] = await Promise.all([
      getAgencyRequiredSections(db, agencyId),
      db.all<{
        section_key: OnboardingSectionKey;
        status: SectionCompletionStatus;
        data_json: string;
        reviewer_note: string | null;
        submitted_at: string | null;
        reviewed_at: string | null;
        updated_at: string | null;
      }>(
        `SELECT section_key, status, data_json, reviewer_note, submitted_at, reviewed_at, updated_at
         FROM onboarding_sections WHERE client_id = ? AND agency_id = ?`,
        clientId,
        agencyId,
      ),
      // Never include encrypted fields or plaintext secrets in ordinary GET
      db.all<{
        id: string;
        client_id: string;
        service_name: string;
        category: string;
        access_type: string;
        login_url: string;
        username_masked: string;
        notes: string;
        created_by_role: UserRole;
        created_at: string;
        last_revealed_at: string | null;
      }>(
        `SELECT id, client_id, service_name, category, access_type, login_url, username_masked, notes, created_by_role, created_at, last_revealed_at
         FROM credentials WHERE client_id = ? AND agency_id = ? ORDER BY created_at DESC`,
        clientId,
        agencyId,
      ),
      db.all<{
        id: string;
        agency_id: string;
        client_id: string;
        category: AssetCategory;
        original_name: string;
        mime_type: string;
        size_bytes: number | string;
        cloudinary_public_id: string;
        resource_type: 'image' | 'video' | 'raw';
        file_format: string;
        description: string;
        section_key: OnboardingSectionKey | null;
        uploaded_by_name: string;
        uploaded_by_role: UserRole;
        created_at: string;
        updated_at: string | null;
      }>(
        `SELECT id, agency_id, client_id, category, original_name, mime_type, size_bytes,
                cloudinary_public_id, resource_type, file_format, description, section_key,
                uploaded_by_name, uploaded_by_role, created_at, updated_at
         FROM assets WHERE client_id = ? AND agency_id = ? ORDER BY created_at DESC`,
        clientId,
        agencyId,
      ),
    ]);

    const rowMap = new Map(sectionRows.map((s) => [s.section_key, s]));

    const sections = ONBOARDING_SECTIONS.map((def) => {
      const row = rowMap.get(def.key);
      return {
        sectionKey: def.key,
        title: def.title,
        description: def.description,
        required: requiredSections.includes(def.key),
        status: row?.status || 'not_started',
        data: row
          ? safeJsonParse<AnySectionData>(row.data_json, DEFAULT_SECTION_DATA[def.key])
          : DEFAULT_SECTION_DATA[def.key],
        reviewerNote: row?.reviewer_note || null,
        submittedAt: row?.submitted_at || null,
        reviewedAt: row?.reviewed_at || null,
        updatedAt: row?.updated_at || null,
      };
    });

    const progress = calculateClientProgress({
      requiredSections,
      sections: sectionRows,
      assets,
      credentialCount: credentials.length,
      clientUpdatedAt: clientRow.updated_at,
    });

    res.json({
      client: {
        id: clientRow.id,
        companyName: clientRow.company_name,
        contactName: clientRow.contact_name,
        email: clientRow.email,
        phone: clientRow.phone,
        website: clientRow.website,
        industry: clientRow.industry,
        description: clientRow.description,
        internalNotes: req.sessionUser!.role === 'client' ? '' : clientRow.internal_notes,
        status: clientRow.status,
        dueDate: clientRow.due_date,
      },
      sections,
      credentials: credentials.map((c) => ({
        id: c.id,
        clientId: c.client_id,
        serviceName: c.service_name,
        category: c.category,
        accessType: c.access_type,
        loginUrl: c.login_url,
        usernameMasked: c.username_masked,
        notes: c.notes,
        createdByRole: c.created_by_role,
        createdAt: c.created_at,
        lastRevealedAt: c.last_revealed_at,
      })),
      assets: assets.map((a) => ({
        id: a.id,
        agencyId: a.agency_id,
        clientId: a.client_id,
        category: a.category,
        originalName: a.original_name,
        mimeType: a.mime_type,
        sizeBytes: Number(a.size_bytes),
        fileFormat: a.file_format || undefined,
        resourceType: a.resource_type,
        description: a.description || '',
        sectionKey: a.section_key,
        storageProvider: a.cloudinary_public_id ? 'cloudinary' : 'legacy_pending',
        uploadedByName: a.uploaded_by_name,
        uploadedByRole: a.uploaded_by_role,
        createdAt: a.created_at,
        updatedAt: a.updated_at,
      })),
      progress,
    });
  }),
);

onboardingRouter.put(
  '/:clientId/sections/:sectionKey',
  requireClientScope,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const keyParsed = sectionKeyEnum.safeParse(req.params.sectionKey);
    if (!keyParsed.success) {
      res.status(400).json({ error: 'Unknown onboarding section' });
      return;
    }

    const sectionKey = keyParsed.data;
    const schema = sectionSchemaMap[sectionKey];
    const dataParsed = schema.safeParse(req.body?.data);
    if (!dataParsed.success) {
      res.status(400).json({ error: dataParsed.error.issues[0]?.message || 'Invalid section fields' });
      return;
    }

    const markComplete = Boolean(req.body?.markComplete);
    const clientId = String(req.params.clientId);
    const session = req.sessionUser!;
    const agencyId = session.agencyId;
    const db = await getDb();

    const clientRow = await db.get<{ company_name: string; status: ClientOnboardingStatus }>(
      'SELECT company_name, status FROM clients WHERE id = ? AND agency_id = ?',
      clientId,
      agencyId,
    );

    if (!clientRow) {
      res.status(404).json({ error: 'Client workspace not found' });
      return;
    }

    if (
      session.role === 'client' &&
      (clientRow.status === 'completed' || clientRow.status === 'archived')
    ) {
      res.status(403).json({
        error: 'This onboarding workspace has been completed and locked by the agency.',
      });
      return;
    }

    const now = new Date().toISOString();
    const [requiredSections, allAssets, credRow] = await Promise.all([
      getAgencyRequiredSections(db, agencyId),
      db.all<{ category: AssetCategory; created_at: string }>(
        'SELECT category, created_at FROM assets WHERE client_id = ? AND agency_id = ?',
        clientId,
        agencyId,
      ),
      db.get<{ cnt: number | string }>(
        'SELECT COUNT(*) as cnt FROM credentials WHERE client_id = ? AND agency_id = ?',
        clientId,
        agencyId,
      ),
    ]);
    const credCount = Number(credRow?.cnt ?? 0);

    const payloadObj: AnySectionData = dataParsed.data;
    if (sectionKey === 'company_info') {
      const rawEmail = getNestedObjectValue(payloadObj, 'contactEmail');
      const emailVal = typeof rawEmail === 'string' ? rawEmail.trim() : '';
      if (emailVal && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
        res.status(400).json({ error: 'Contact Email must be a valid email address' });
        return;
      }
    }

    if (markComplete && requiredSections.includes(sectionKey)) {
      const def = SECTION_DEF_MAP.get(sectionKey);
      const missing: string[] = [];
      if (def) {
        for (const f of def.requiredFields) {
          if (!isOnboardingValueFilled(getNestedObjectValue(payloadObj, f.path))) {
            missing.push(`${f.label} is required`);
          }
        }
        if (def.requiredAssetCategories) {
          const present = new Set(allAssets.map((a) => a.category));
          for (const reqAsset of def.requiredAssetCategories) {
            if (!present.has(reqAsset.category)) {
              missing.push(`Upload required: ${reqAsset.label}`);
            }
          }
        }
        if (def.key === 'access_credentials') {
          const rawNotes = getNestedObjectValue(payloadObj, 'delegatedAccessNotes');
          const delegatedNotes = typeof rawNotes === 'string' ? rawNotes.trim() : '';
          if (credCount === 0 && !delegatedNotes) {
            missing.push('Add at least one encrypted credential or enter delegated access notes');
          }
        }
      }

      if (missing.length > 0) {
        res.status(400).json({
          error: missing[0],
          missing,
        });
        return;
      }
    }

    const nextStatus: SectionCompletionStatus = markComplete ? 'completed' : 'in_progress';
    const submittedAt = markComplete ? now : null;

    await db.run(
      `UPDATE onboarding_sections
       SET status = ?, data_json = ?, submitted_at = COALESCE(CAST(? AS TEXT), submitted_at), updated_at = ?
       WHERE client_id = ? AND agency_id = ? AND section_key = ?`,
      nextStatus,
      JSON.stringify(dataParsed.data),
      submittedAt,
      now,
      clientId,
      agencyId,
      sectionKey,
    );

    const [allSections, agencyPref] = await Promise.all([
      db.all<{
        section_key: OnboardingSectionKey;
        status: SectionCompletionStatus;
        data_json: string;
        updated_at: string | null;
      }>(
        'SELECT section_key, status, data_json, updated_at FROM onboarding_sections WHERE client_id = ? AND agency_id = ?',
        clientId,
        agencyId,
      ),
      db.get<{ notify_on_submission: number }>(
        'SELECT notify_on_submission FROM agencies WHERE id = ?',
        agencyId,
      ),
    ]);

    const progress = calculateClientProgress({
      requiredSections,
      sections: allSections,
      assets: allAssets,
      credentialCount: credCount,
      clientUpdatedAt: now,
    });

    const shouldNotify = Boolean(agencyPref?.notify_on_submission ?? 1);

    const sectionStatusMap = new Map(allSections.map((s) => [s.section_key, s.status]));
    const allRequiredSectionsCompleted = requiredSections.every(
      (reqKey) => sectionStatusMap.get(reqKey) === 'completed',
    );

    let nextClientStatus: ClientOnboardingStatus = clientRow.status;
    if (clientRow.status !== 'archived') {
      if (allRequiredSectionsCompleted && progress.overallPercentage === 100) {
        if (clientRow.status !== 'completed') {
          nextClientStatus = 'in_review';
        }
      } else if (!markComplete && clientRow.status === 'in_review') {
        nextClientStatus = 'in_progress';
      } else if (clientRow.status === 'pending' || clientRow.status === 'completed') {
        nextClientStatus = 'in_progress';
      }
    }

    await db.run(
      'UPDATE clients SET status = ?, updated_at = ? WHERE id = ? AND agency_id = ?',
      nextClientStatus,
      now,
      clientId,
      agencyId,
    );

    const def = SECTION_DEF_MAP.get(sectionKey);
    await recordActivityAndNotification(db, {
      agencyId,
      clientId,
      actorName: session.name,
      actorRole: session.role,
      action: markComplete ? 'Section Submitted' : 'Section Draft Saved',
      details: `${markComplete ? 'Submitted' : 'Saved draft for'} ${def?.title || sectionKey}`,
      notificationTitle: markComplete && shouldNotify ? 'Onboarding Section Submitted' : undefined,
      notificationMessage:
        markComplete && shouldNotify
          ? `${session.name} submitted ${def?.title || sectionKey} for ${clientRow.company_name}.`
          : undefined,
    });

    res.json({ ok: true, status: nextStatus, progress });
  }),
);

onboardingRouter.post(
  '/:clientId/sections/:sectionKey/review',
  requireAgencyStaff(['admin', 'member']),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const keyParsed = sectionKeyEnum.safeParse(req.params.sectionKey);
    if (!keyParsed.success) {
      res.status(400).json({ error: 'Unknown onboarding section' });
      return;
    }

    const rawDecision = req.body?.decision;
    if (rawDecision !== 'completed' && rawDecision !== 'needs_revision') {
      res.status(400).json({ error: 'Decision must be either completed or needs_revision' });
      return;
    }

    const session = req.sessionUser!;
    const clientId = String(req.params.clientId);
    const agencyId = session.agencyId;
    const access = await checkClientWorkspaceAccess(session, clientId);
    if (!access.ok) {
      res.status(access.code).json({ error: access.error });
      return;
    }

    const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 1000) : '';
    const db = await getDb();
    const now = new Date().toISOString();

    const updateRes = await db.run(
      `UPDATE onboarding_sections
       SET status = ?, reviewer_note = ?, reviewed_at = ?, updated_at = ?
       WHERE client_id = ? AND agency_id = ? AND section_key = ?`,
      rawDecision,
      note || null,
      now,
      now,
      clientId,
      agencyId,
      keyParsed.data,
    );

    if (updateRes.changes === 0) {
      res.status(404).json({ error: 'Onboarding section not found' });
      return;
    }

    const [requiredSections, allSections] = await Promise.all([
      getAgencyRequiredSections(db, agencyId),
      db.all<{ section_key: OnboardingSectionKey; status: SectionCompletionStatus }>(
        'SELECT section_key, status FROM onboarding_sections WHERE client_id = ? AND agency_id = ?',
        clientId,
        agencyId,
      ),
    ]);

    const sectionStatusMap = new Map(allSections.map((s) => [s.section_key, s.status]));
    const hasNeedsRevision = allSections.some((s) => s.status === 'needs_revision');
    const allRequiredApproved =
      !hasNeedsRevision &&
      requiredSections.every((reqKey) => sectionStatusMap.get(reqKey) === 'completed');
    if (allRequiredApproved) {
      await db.run(
        `UPDATE clients SET status = 'completed', updated_at = ? WHERE id = ? AND agency_id = ?`,
        now,
        clientId,
        agencyId,
      );
    } else if (rawDecision === 'needs_revision') {
      await db.run(
        `UPDATE clients SET status = 'in_progress', updated_at = ? WHERE id = ? AND agency_id = ?`,
        now,
        clientId,
        agencyId,
      );
    }

    const def = SECTION_DEF_MAP.get(keyParsed.data);
    await recordActivityAndNotification(db, {
      agencyId,
      clientId,
      actorName: session.name,
      actorRole: session.role,
      action: rawDecision === 'completed' ? 'Section Approved' : 'Revision Requested',
      details: `${rawDecision === 'completed' ? 'Approved' : 'Requested revision on'} ${def?.title || keyParsed.data}`,
    });

    res.json({ ok: true, status: rawDecision });
  }),
);

onboardingRouter.post(
  '/:clientId/credentials',
  requireClientScope,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const parsed = credentialInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid credential entry' });
      return;
    }

    const clientId = String(req.params.clientId);
    const session = req.sessionUser!;
    const agencyId = session.agencyId;
    const db = await getDb();

    const clientRow = await db.get<{ status: ClientOnboardingStatus }>(
      'SELECT status FROM clients WHERE id = ? AND agency_id = ?',
      clientId,
      agencyId,
    );

    if (!clientRow) {
      res.status(404).json({ error: 'Client workspace not found' });
      return;
    }

    if (
      session.role === 'client' &&
      (clientRow.status === 'completed' || clientRow.status === 'archived')
    ) {
      res.status(403).json({
        error: 'This onboarding workspace is completed and locked.',
      });
      return;
    }

    const d = parsed.data;
    const credId = crypto.randomUUID();
    const now = new Date().toISOString();

    // Encrypt both username and secret value with AES-256-GCM before storage
    const usernameEncrypted = encryptSecret(d.username);
    const secretEncrypted = encryptSecret(d.secretValue);
    const masked = maskUsername(d.username);

    await db.transaction(async (tx) => {
      await tx.run(
        `INSERT INTO credentials (id, agency_id, client_id, service_name, category, access_type, login_url, username_encrypted, username_masked, secret_encrypted, notes, created_by_role, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        credId,
        agencyId,
        clientId,
        d.serviceName,
        d.category,
        d.accessType,
        d.loginUrl,
        usernameEncrypted,
        masked,
        secretEncrypted,
        d.notes,
        session.role,
        now,
      );

      await tx.run(
        'UPDATE clients SET updated_at = ? WHERE id = ? AND agency_id = ?',
        now,
        clientId,
        agencyId,
      );

      await recordActivityAndNotification(tx, {
        agencyId,
        clientId,
        actorName: session.name,
        actorRole: session.role,
        action: 'Encrypted Credential Added',
        details: `Stored AES-256-GCM encrypted access for ${d.serviceName} (${d.category})`,
        notificationTitle: 'New Encrypted Access Submitted',
        notificationMessage: `${session.name} submitted encrypted ${d.serviceName} access.`,
      });
    });

    res.status(201).json({
      credential: {
        id: credId,
        clientId,
        serviceName: d.serviceName,
        category: d.category,
        accessType: d.accessType,
        loginUrl: d.loginUrl,
        usernameMasked: masked,
        notes: d.notes,
        createdByRole: session.role,
        createdAt: now,
        lastRevealedAt: null,
      },
    });
  }),
);

// Only authorized agency staff (admin / assigned member) can reveal decrypted credentials
onboardingRouter.post(
  '/:clientId/credentials/:credId/reveal',
  requireAgencyStaff(['admin', 'member']),
  revealLimiter,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const clientId = String(req.params.clientId);
    const credId = String(req.params.credId);
    const session = req.sessionUser!;
    const agencyId = session.agencyId;
    const db = await getDb();

    const row = await db.get<{
      id: string;
      service_name: string;
      username_encrypted: string;
      secret_encrypted: string;
      assigned_to_id: string | null;
    }>(
      `SELECT cr.id, cr.service_name, cr.username_encrypted, cr.secret_encrypted, c.assigned_to_id
       FROM credentials cr
       JOIN clients c ON c.id = cr.client_id
       WHERE cr.id = ? AND cr.client_id = ? AND cr.agency_id = ? AND c.agency_id = ?`,
      credId,
      clientId,
      agencyId,
      agencyId,
    );

    if (!row) {
      res.status(404).json({ error: 'Credential entry not found' });
      return;
    }

    if (session.role === 'member' && row.assigned_to_id !== session.id) {
      recordSecurityLog('credential_reveal_denied', {
        agencyId,
        clientId,
        credId: row.id,
        actorId: session.id,
      });
      res.status(403).json({
        error: 'Only agency admins or the assigned team member can decrypt credentials for this client',
      });
      return;
    }

    const now = new Date().toISOString();
    const username = decryptSecret(row.username_encrypted);
    const secretValue = decryptSecret(row.secret_encrypted);

    await db.run(
      'UPDATE credentials SET last_revealed_at = ? WHERE id = ? AND agency_id = ?',
      now,
      row.id,
      agencyId,
    );

    await recordActivityAndNotification(db, {
      agencyId,
      clientId,
      actorName: session.name,
      actorRole: session.role,
      action: 'Credential Revealed',
      details: `${session.name} decrypted ${row.service_name} access credentials (audited)`,
    });
    recordSecurityLog('credential_revealed', {
      agencyId,
      clientId,
      credId: row.id,
      actorId: session.id,
      role: session.role,
    });

    res.json({
      id: row.id,
      username,
      secretValue,
      revealedAt: now,
    });
  }),
);

onboardingRouter.delete(
  '/:clientId/credentials/:credId',
  requireClientScope,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const clientId = String(req.params.clientId);
    const credId = String(req.params.credId);
    const session = req.sessionUser!;
    const agencyId = session.agencyId;
    const db = await getDb();

    const clientRow = await db.get<{ status: ClientOnboardingStatus }>(
      'SELECT status FROM clients WHERE id = ? AND agency_id = ?',
      clientId,
      agencyId,
    );

    if (
      session.role === 'client' &&
      clientRow &&
      (clientRow.status === 'completed' || clientRow.status === 'archived')
    ) {
      res.status(403).json({ error: 'This onboarding workspace is completed and locked.' });
      return;
    }

    const existing = await db.get<{
      id: string;
      service_name: string;
      created_by_role: UserRole;
    }>(
      'SELECT id, service_name, created_by_role FROM credentials WHERE id = ? AND client_id = ? AND agency_id = ?',
      credId,
      clientId,
      agencyId,
    );

    if (!existing) {
      res.status(404).json({ error: 'Credential entry not found' });
      return;
    }

    if (session.role === 'client' && existing.created_by_role !== 'client') {
      recordSecurityLog('client_credential_delete_denied', {
        agencyId,
        clientId,
        credId: existing.id,
      });
      res.status(403).json({ error: 'Clients can only delete credentials they submitted' });
      return;
    }

    await db.run('DELETE FROM credentials WHERE id = ? AND agency_id = ?', existing.id, agencyId);

    await recordActivityAndNotification(db, {
      agencyId,
      clientId,
      actorName: session.name,
      actorRole: session.role,
      action: 'Credential Removed',
      details: `Removed encrypted access entry for ${existing.service_name}`,
    });

    res.json({ ok: true });
  }),
);
