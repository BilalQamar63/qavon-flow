import crypto from 'node:crypto';
import { Router } from 'express';
import { agencySettingsSchema, teamInviteSchema } from '../../src/schemas/validation.ts';
import { safeJsonParse } from '../../src/constants/onboarding.ts';
import type { OnboardingSectionKey } from '../../src/types/index.ts';
import { serverConfig } from '../config.ts';
import { isCloudinaryConfigured } from '../config/cloudinary.ts';
import { getDb } from '../db/database.ts';
import { requireAgencyStaff, type AuthenticatedRequest } from '../middleware/auth.ts';
import { recordActivityAndNotification, recordSecurityLog } from '../services/audit.ts';
import { emailProvider } from '../services/email.ts';
import { asyncHandler } from '../utils/asyncHandler.ts';

export const settingsRouter = Router();

settingsRouter.get(
  '/',
  requireAgencyStaff(['admin', 'member']),
  asyncHandler<AuthenticatedRequest>(async (req, res) => {
    const agencyId = req.sessionUser!.agencyId;
    const db = await getDb();

    const agency = await db.get<{
      id: string;
      name: string;
      support_email: string;
      website: string;
      primary_color: string;
      default_invite_expiry_days: number;
      session_duration_hours: number;
      notify_on_submission: number;
      notify_on_asset_upload: number;
      required_sections_json: string;
    }>('SELECT * FROM agencies WHERE id = ?', agencyId);

    if (!agency) {
      res.status(404).json({ error: 'Agency workspace not found' });
      return;
    }

    const team = await db.all<{
      id: string;
      agency_id: string;
      name: string;
      email: string;
      role: 'admin' | 'member';
      title: string;
      created_at: string;
      last_active_at: string | null;
    }>(
      'SELECT id, agency_id, name, email, role, title, created_at, last_active_at FROM users WHERE agency_id = ? ORDER BY created_at ASC',
      agencyId,
    );

    res.json({
      agency: {
        id: agency.id,
        name: agency.name,
        supportEmail: agency.support_email,
        website: agency.website,
        primaryColor: agency.primary_color,
        defaultInviteExpiryDays: agency.default_invite_expiry_days,
        sessionDurationHours: agency.session_duration_hours,
        notifyOnSubmission: Boolean(agency.notify_on_submission),
        notifyOnAssetUpload: Boolean(agency.notify_on_asset_upload),
        requiredSections: safeJsonParse<OnboardingSectionKey[]>(agency.required_sections_json, [
          'company_info',
          'brand_assets',
          'website_content',
          'project_requirements',
          'access_credentials',
          'additional_documents',
        ]),
      },
      team: team.map((t) => ({
        id: t.id,
        agencyId: t.agency_id,
        name: t.name,
        email: t.email,
        role: t.role,
        title: t.title,
        createdAt: t.created_at,
        lastActiveAt: t.last_active_at,
      })),
      securityStatus: {
        encryptionAlgorithm: 'AES-256-GCM',
        encryptionKeyConfigured: serverConfig.hasExplicitEncryptionKey,
        authSecretConfigured: serverConfig.hasExplicitAuthSecret,
        smtpConfigured: emailProvider.isConfigured(),
        cloudinaryConfigured: isCloudinaryConfigured(),
        storageDriver: 'cloudinary',
        databaseDriver: db.driver,
      },
    });
  }),
);

settingsRouter.put(
  '/',
  requireAgencyStaff(['admin']),
  asyncHandler<AuthenticatedRequest>(async (req, res) => {
    const parsed = agencySettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid settings payload' });
      return;
    }

    const agencyId = req.sessionUser!.agencyId;
    const db = await getDb();
    const d = parsed.data;

    await db.run(
      `UPDATE agencies
       SET name = ?, support_email = ?, website = ?, primary_color = ?, default_invite_expiry_days = ?, session_duration_hours = ?, notify_on_submission = ?, notify_on_asset_upload = ?, required_sections_json = ?
       WHERE id = ?`,
      d.name,
      d.supportEmail,
      d.website,
      d.primaryColor,
      d.defaultInviteExpiryDays,
      d.sessionDurationHours,
      d.notifyOnSubmission ? 1 : 0,
      d.notifyOnAssetUpload ? 1 : 0,
      JSON.stringify(d.requiredSections),
      agencyId,
    );

    await recordActivityAndNotification(db, {
      agencyId,
      actorName: req.sessionUser!.name,
      actorRole: req.sessionUser!.role,
      action: 'Settings Updated',
      details: 'Updated agency profile, notification preferences, or onboarding template rules',
    });

    res.json({ ok: true });
  }),
);

settingsRouter.post(
  '/team',
  requireAgencyStaff(['admin']),
  asyncHandler<AuthenticatedRequest>(async (req, res) => {
    const parsed = teamInviteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Invalid team member details',
      });
      return;
    }

    const agencyId = req.sessionUser!.agencyId;
    const db = await getDb();
    const email = parsed.data.email.toLowerCase();

    const existing = await db.get('SELECT id FROM users WHERE LOWER(email) = ?', email);
    if (existing) {
      res.status(409).json({ error: 'A user with this email already exists' });
      return;
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await db.run(
      `INSERT INTO users (id, agency_id, email, name, role, title, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      id,
      agencyId,
      email,
      parsed.data.name,
      parsed.data.role,
      parsed.data.title,
      now,
    );

    await recordActivityAndNotification(db, {
      agencyId,
      actorName: req.sessionUser!.name,
      actorRole: req.sessionUser!.role,
      action: 'Team Member Added',
      details: `Added ${parsed.data.name} (${parsed.data.role}) to the agency workspace`,
    });

    res.status(201).json({
      member: {
        id,
        agencyId,
        name: parsed.data.name,
        email,
        role: parsed.data.role,
        title: parsed.data.title,
        createdAt: now,
        lastActiveAt: null,
      },
    });
  }),
);

settingsRouter.patch(
  '/team/:userId',
  requireAgencyStaff(['admin']),
  asyncHandler<AuthenticatedRequest>(async (req, res) => {
    const role = req.body?.role === 'admin' ? 'admin' : req.body?.role === 'member' ? 'member' : null;
    if (!role) {
      res.status(400).json({ error: 'Valid role (admin or member) is required' });
      return;
    }

    const agencyId = req.sessionUser!.agencyId;
    const userId = String(req.params.userId);
    if (userId === req.sessionUser!.id && role !== 'admin') {
      res.status(400).json({ error: 'You cannot demote your own administrator account' });
      return;
    }

    const db = await getDb();
    const existing = await db.get<{ id: string; name: string }>(
      'SELECT id, name FROM users WHERE id = ? AND agency_id = ?',
      userId,
      agencyId,
    );

    if (!existing) {
      res.status(404).json({ error: 'Team member not found' });
      return;
    }

    await db.run(
      'UPDATE users SET role = ?, session_version = session_version + 1 WHERE id = ? AND agency_id = ?',
      role,
      userId,
      agencyId,
    );

    await recordActivityAndNotification(db, {
      agencyId,
      actorName: req.sessionUser!.name,
      actorRole: req.sessionUser!.role,
      action: 'Role Updated',
      details: `Updated ${existing.name}'s role to ${role}`,
    });
    recordSecurityLog('team_role_updated', {
      agencyId,
      targetUserId: userId,
      newRole: role,
      actorId: req.sessionUser!.id,
    });

    res.json({ ok: true });
  }),
);

settingsRouter.delete(
  '/team/:userId',
  requireAgencyStaff(['admin']),
  asyncHandler<AuthenticatedRequest>(async (req, res) => {
    const agencyId = req.sessionUser!.agencyId;
    const userId = String(req.params.userId);

    if (userId === req.sessionUser!.id) {
      res.status(400).json({ error: 'You cannot remove your own account while signed in' });
      return;
    }

    const db = await getDb();
    const existing = await db.get<{ id: string; name: string }>(
      'SELECT id, name FROM users WHERE id = ? AND agency_id = ?',
      userId,
      agencyId,
    );

    if (!existing) {
      res.status(404).json({ error: 'Team member not found' });
      return;
    }

    await db.run('DELETE FROM users WHERE id = ? AND agency_id = ?', userId, agencyId);

    await recordActivityAndNotification(db, {
      agencyId,
      actorName: req.sessionUser!.name,
      actorRole: req.sessionUser!.role,
      action: 'Team Member Removed',
      details: `Removed ${existing.name} from the agency team`,
    });
    recordSecurityLog('team_member_removed', {
      agencyId,
      targetUserId: userId,
      actorId: req.sessionUser!.id,
    });

    res.json({ ok: true });
  }),
);
