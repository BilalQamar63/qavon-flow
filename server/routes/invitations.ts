import crypto from 'node:crypto';
import { Router } from 'express';
import { resolveSafeAppOrigin } from '../config.ts';
import { getDb } from '../db/database.ts';
import {
  checkClientWorkspaceAccess,
  requireAgencyStaff,
  setSessionCookie,
  type AuthenticatedRequest,
} from '../middleware/auth.ts';
import { generateSecureToken, hashToken } from '../security/crypto.ts';
import { createRateLimiter } from '../security/rateLimit.ts';
import { recordActivityAndNotification, recordSecurityLog } from '../services/audit.ts';
import { emailProvider, type EmailDispatchResult } from '../services/email.ts';
import { buildPortalInvitationEmail } from '../services/emailTemplates.ts';
import { asyncHandler } from '../utils/asyncHandler.ts';
import { invitationCreateSchema } from '../../src/schemas/validation.ts';
import type { InvitationStatus } from '../../src/types/index.ts';

export const invitationsRouter = Router();

const inviteLimiter = createRateLimiter({
  windowMs: 60_000,
  maxRequests: 25,
  keyPrefix: 'invite',
});

function computeEffectiveStatus(status: InvitationStatus, expiresAt: string): InvitationStatus {
  if ((status === 'sent' || status === 'pending') && new Date(expiresAt).getTime() < Date.now()) {
    return 'expired';
  }
  return status;
}

invitationsRouter.get(
  '/',
  requireAgencyStaff(['admin', 'member']),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const session = req.sessionUser!;
    const agencyId = session.agencyId;
    const clientId = typeof req.query.clientId === 'string' ? req.query.clientId : '';
    const db = await getDb();

    let sql = `
      SELECT i.*, c.company_name as client_name
      FROM invitations i
      JOIN clients c ON c.id = i.client_id
      WHERE i.agency_id = ?
    `;
    const params: string[] = [agencyId];

    if (session.role === 'member') {
      sql += ` AND c.assigned_to_id = ?`;
      params.push(session.id);
    }

    if (clientId) {
      sql += ` AND i.client_id = ?`;
      params.push(clientId);
    }

    sql += ` ORDER BY i.created_at DESC`;

    const rows = await db.all<{
      id: string;
      agency_id: string;
      client_id: string;
      client_name: string;
      email: string;
      status: InvitationStatus;
      expires_at: string;
      sent_at: string | null;
      accepted_at: string | null;
      revoked_at: string | null;
      created_at: string;
    }>(sql, ...params);

    const invitations = rows.map((r) => ({
      id: r.id,
      agencyId: r.agency_id,
      clientId: r.client_id,
      clientName: r.client_name,
      email: r.email,
      status: computeEffectiveStatus(r.status, r.expires_at),
      expiresAt: r.expires_at,
      sentAt: r.sent_at,
      acceptedAt: r.accepted_at,
      revokedAt: r.revoked_at,
      createdAt: r.created_at,
    }));

    res.json({ invitations });
  }),
);

invitationsRouter.post(
  '/',
  requireAgencyStaff(['admin', 'member']),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const parsed = invitationCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid invitation payload' });
      return;
    }

    const session = req.sessionUser!;
    const access = await checkClientWorkspaceAccess(session, parsed.data.clientId);
    if (!access.ok) {
      res.status(access.code).json({ error: access.error });
      return;
    }
    if (access.status === 'archived') {
      res.status(400).json({ error: 'Cannot invite clients to an archived workspace' });
      return;
    }

    const agencyId = session.agencyId;
    const db = await getDb();
    const client = await db.get<{
      id: string;
      company_name: string;
      contact_name: string;
      email: string;
    }>(
      'SELECT id, company_name, contact_name, email FROM clients WHERE id = ? AND agency_id = ?',
      parsed.data.clientId,
      agencyId,
    );

    if (!client) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }

    // Revoke previous active invitations for this client
    const now = new Date().toISOString();
    await db.run(
      `UPDATE invitations SET status = 'revoked', revoked_at = ? WHERE client_id = ? AND agency_id = ? AND status IN ('pending', 'sent')`,
      now,
      client.id,
      agencyId,
    );

    const rawToken = generateSecureToken(32);
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + parsed.data.expiresInDays * 86400_000).toISOString();
    const inviteId = crypto.randomUUID();

    const requestHost = req.get('x-forwarded-host') || req.get('host');
    const safeOrigin = resolveSafeAppOrigin(req.get('origin'), requestHost);
    const portalUrl = `${safeOrigin}/?portalToken=${encodeURIComponent(rawToken)}`;

    let emailResult: EmailDispatchResult = {
      configured: emailProvider.isConfigured(),
      delivered: false,
      reason: 'Generated as manual link.',
    };

    if (parsed.data.sendEmail) {
      emailResult = await emailProvider.send({
        to: client.email,
        subject: `${client.company_name} — Your QavonFlow onboarding workspace`,
        ...buildPortalInvitationEmail({
          contactName: client.contact_name,
          companyName: client.company_name,
          portalUrl,
        }),
      });
    }

    const status: InvitationStatus = parsed.data.sendEmail ? 'sent' : 'pending';

    await db.run(
      `INSERT INTO invitations (id, agency_id, client_id, email, token_hash, status, expires_at, sent_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      inviteId,
      agencyId,
      client.id,
      client.email,
      tokenHash,
      status,
      expiresAt,
      parsed.data.sendEmail ? now : null,
      now,
    );

    await recordActivityAndNotification(db, {
      agencyId,
      clientId: client.id,
      actorName: session.name,
      actorRole: session.role,
      action: 'Invitation Generated',
      details: `Generated portal invitation for ${client.contact_name} (${client.email})`,
    });

    res.status(201).json({
      invitation: {
        id: inviteId,
        agencyId,
        clientId: client.id,
        clientName: client.company_name,
        email: client.email,
        status,
        expiresAt,
        sentAt: parsed.data.sendEmail ? now : null,
        acceptedAt: null,
        revokedAt: null,
        createdAt: now,
        portalPreviewUrl: portalUrl,
        emailDelivery: emailResult,
      },
    });
  }),
);

invitationsRouter.post(
  '/:id/resend',
  requireAgencyStaff(['admin', 'member']),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const session = req.sessionUser!;
    const inviteId = String(req.params.id);
    const agencyId = session.agencyId;
    const db = await getDb();
    const existing = await db.get<{
      id: string;
      client_id: string;
      email: string;
      status: InvitationStatus;
      company_name: string;
      contact_name: string;
      assigned_to_id: string | null;
    }>(
      `SELECT i.id, i.client_id, i.email, i.status, c.company_name, c.contact_name, c.assigned_to_id
       FROM invitations i
       JOIN clients c ON c.id = i.client_id
       WHERE i.id = ? AND i.agency_id = ?`,
      inviteId,
      agencyId,
    );

    if (!existing) {
      res.status(404).json({ error: 'Invitation not found' });
      return;
    }

    if (session.role === 'member' && existing.assigned_to_id !== session.id) {
      res.status(403).json({ error: 'Team members can only resend invitations for assigned clients' });
      return;
    }

    if (existing.status === 'accepted' || existing.status === 'revoked') {
      res.status(400).json({ error: 'Cannot resend an already accepted or revoked invitation' });
      return;
    }

    const rawToken = generateSecureToken(32);
    const tokenHash = hashToken(rawToken);
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 14 * 86400_000).toISOString();

    await db.run(
      `UPDATE invitations SET token_hash = ?, status = 'sent', sent_at = ?, expires_at = ?, revoked_at = NULL WHERE id = ?`,
      tokenHash,
      now,
      expiresAt,
      existing.id,
    );

    const requestHost = req.get('x-forwarded-host') || req.get('host');
    const safeOrigin = resolveSafeAppOrigin(req.get('origin'), requestHost);
    const portalUrl = `${safeOrigin}/?portalToken=${encodeURIComponent(rawToken)}`;

    const emailResult = await emailProvider.send({
      to: existing.email,
      subject: `Reminder: Your QavonFlow onboarding workspace for ${existing.company_name}`,
      ...buildPortalInvitationEmail({
        contactName: existing.contact_name,
        companyName: existing.company_name,
        portalUrl,
        reminder: true,
      }),
    });

    await recordActivityAndNotification(db, {
      agencyId,
      clientId: existing.client_id,
      actorName: session.name,
      actorRole: session.role,
      action: 'Invitation Resent',
      details: `Issued a fresh invitation link for ${existing.email}`,
    });

    res.json({
      portalPreviewUrl: portalUrl,
      emailDelivery: emailResult,
    });
  }),
);

invitationsRouter.post(
  '/:id/revoke',
  requireAgencyStaff(['admin', 'member']),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const session = req.sessionUser!;
    const inviteId = String(req.params.id);
    const agencyId = session.agencyId;
    const db = await getDb();
    const existing = await db.get<{
      id: string;
      client_id: string;
      email: string;
      assigned_to_id: string | null;
    }>(
      `SELECT i.id, i.client_id, i.email, c.assigned_to_id
       FROM invitations i
       JOIN clients c ON c.id = i.client_id
       WHERE i.id = ? AND i.agency_id = ?`,
      inviteId,
      agencyId,
    );

    if (!existing) {
      res.status(404).json({ error: 'Invitation not found' });
      return;
    }

    if (session.role === 'member' && existing.assigned_to_id !== session.id) {
      res.status(403).json({ error: 'Team members can only revoke invitations for assigned clients' });
      return;
    }

    const now = new Date().toISOString();
    await db.run(`UPDATE invitations SET status = 'revoked', revoked_at = ? WHERE id = ?`, now, existing.id);
    // Invalidate any active client portal sessions for this workspace when revoking access
    await db.run(
      `UPDATE clients SET session_version = session_version + 1, updated_at = ? WHERE id = ? AND agency_id = ?`,
      now,
      existing.client_id,
      agencyId,
    );

    await recordActivityAndNotification(db, {
      agencyId,
      clientId: existing.client_id,
      actorName: session.name,
      actorRole: session.role,
      action: 'Invitation Revoked',
      details: `Revoked portal invitation for ${existing.email}`,
    });
    recordSecurityLog('invitation_revoked', {
      agencyId,
      clientId: existing.client_id,
      invitationId: existing.id,
      actorId: session.id,
    });

    res.json({ ok: true });
  }),
);

invitationsRouter.post(
  '/accept',
  inviteLimiter,
  asyncHandler(async (req, res) => {
    const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
    if (!token) {
      res.status(400).json({ error: 'Invitation token is required' });
      return;
    }

    const db = await getDb();
    const tokenHash = hashToken(token);
    const row = await db.get<{
      id: string;
      agency_id: string;
      client_id: string;
      status: InvitationStatus;
      expires_at: string;
      company_name: string;
      contact_name: string;
      email: string;
      client_status: string;
      client_sv: number;
      agency_name: string;
    }>(
      `SELECT i.id, i.agency_id, i.client_id, i.status, i.expires_at, c.company_name, c.contact_name, c.email, c.status as client_status, c.session_version as client_sv, a.name as agency_name
       FROM invitations i
       JOIN clients c ON c.id = i.client_id
       JOIN agencies a ON a.id = i.agency_id
       WHERE i.token_hash = ?`,
      tokenHash,
    );

    if (!row) {
      recordSecurityLog('invitation_accept_invalid_token', { ip: req.ip || 'unknown' });
      res.status(401).json({ error: 'Invalid onboarding invitation link' });
      return;
    }

    if (row.status === 'revoked') {
      recordSecurityLog('invitation_revoked_rejected', {
        agencyId: row.agency_id,
        clientId: row.client_id,
        invitationId: row.id,
      });
      res.status(403).json({ error: 'This onboarding invitation has been revoked by the agency' });
      return;
    }

    if (row.status === 'accepted') {
      recordSecurityLog('invitation_replay_blocked', {
        agencyId: row.agency_id,
        clientId: row.client_id,
        invitationId: row.id,
      });
      res.status(401).json({
        error: 'This onboarding invitation link has already been used. Ask your agency to send a fresh link.',
      });
      return;
    }

    if (row.client_status === 'archived') {
      res.status(403).json({ error: 'This client workspace is archived' });
      return;
    }

    if (new Date(row.expires_at).getTime() < Date.now() || row.status === 'expired') {
      await db.run(`UPDATE invitations SET status = 'expired' WHERE id = ?`, row.id);
      recordSecurityLog('invitation_expired_rejected', {
        agencyId: row.agency_id,
        clientId: row.client_id,
        invitationId: row.id,
      });
      res.status(401).json({ error: 'This onboarding invitation link has expired. Ask your agency to resend it.' });
      return;
    }

    const now = new Date().toISOString();
    const acceptResult = await db.run(
      `UPDATE invitations SET status = 'accepted', accepted_at = ? WHERE id = ? AND status IN ('pending', 'sent')`,
      now,
      row.id,
    );

    if (acceptResult.changes === 0) {
      recordSecurityLog('invitation_race_replay_blocked', {
        agencyId: row.agency_id,
        clientId: row.client_id,
        invitationId: row.id,
      });
      res.status(401).json({
        error: 'This onboarding invitation link has already been used. Ask your agency to send a fresh link.',
      });
      return;
    }

    if (row.client_status === 'pending') {
      await db.run(
        `UPDATE clients SET status = 'in_progress', updated_at = ? WHERE id = ? AND agency_id = ?`,
        now,
        row.client_id,
        row.agency_id,
      );
    }

    await recordActivityAndNotification(db, {
      agencyId: row.agency_id,
      clientId: row.client_id,
      actorName: row.contact_name,
      actorRole: 'client',
      action: 'Invitation Accepted',
      details: `${row.contact_name} opened the ${row.company_name} onboarding portal`,
      notificationTitle: 'Client Opened Onboarding Portal',
      notificationMessage: `${row.contact_name} (${row.company_name}) accepted their portal invitation.`,
    });
    recordSecurityLog('invitation_accepted', {
      agencyId: row.agency_id,
      clientId: row.client_id,
      invitationId: row.id,
    });

    setSessionCookie(
      res,
      {
        sv: row.client_sv,
        userId: `client-session:${row.client_id}`,
        agencyId: row.agency_id,
        role: 'client',
        clientId: row.client_id,
        name: row.contact_name,
        email: row.email,
      },
      72,
    );

    res.json({
      user: {
        id: `client-session:${row.client_id}`,
        email: row.email,
        name: row.contact_name,
        role: 'client',
        agencyId: row.agency_id,
        agencyName: row.agency_name,
        clientId: row.client_id,
      },
    });
  }),
);
