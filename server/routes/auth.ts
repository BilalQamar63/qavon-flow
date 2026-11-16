import crypto from 'node:crypto';
import { Router } from 'express';
import { resolveSafeAppOrigin, serverConfig } from '../config.ts';
import { getDb } from '../db/database.ts';
import {
  SESSION_COOKIE_NAME,
  clearSessionCookie,
  resolveSessionFromRequest,
  revokeSessionToken,
  setSessionCookie,
} from '../middleware/auth.ts';
import { generateSecureToken, hashToken } from '../security/crypto.ts';
import { createRateLimiter } from '../security/rateLimit.ts';
import { recordActivityAndNotification, recordSecurityLog } from '../services/audit.ts';
import { emailProvider } from '../services/email.ts';
import { asyncHandler } from '../utils/asyncHandler.ts';
import { registerAgencySchema, requestMagicLinkSchema } from '../../src/schemas/validation.ts';
import type { OnboardingSectionKey } from '../../src/types/index.ts';

export const authRouter = Router();

const authLimiter = createRateLimiter({
  windowMs: 60_000,
  maxRequests: 20,
  keyPrefix: 'auth',
});

const magicLinkEmailLimiter = createRateLimiter({
  windowMs: 5 * 60_000,
  maxRequests: 10,
  keyPrefix: 'auth_email',
  keyResolver: (req) => {
    const raw = (req.body as { email?: unknown } | undefined)?.email;
    return typeof raw === 'string' ? raw.trim().toLowerCase().slice(0, 120) : null;
  },
});

authRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    const session = await resolveSessionFromRequest(req);
    if (!session) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    res.json({ user: session });
  }),
);

authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const session = await resolveSessionFromRequest(req);
    const rawCookie = req.cookies?.[SESSION_COOKIE_NAME] as string | undefined;
    await revokeSessionToken(rawCookie);
    clearSessionCookie(res);
    if (session) {
      recordSecurityLog('auth_logout', {
        userId: session.id,
        agencyId: session.agencyId,
        role: session.role,
      });
    }
    res.json({ ok: true });
  }),
);

authRouter.post(
  '/request-magic-link',
  authLimiter,
  magicLinkEmailLimiter,
  asyncHandler(async (req, res) => {
    const parsed = requestMagicLinkSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid email' });
      return;
    }

    const email = parsed.data.email.toLowerCase();
    const db = await getDb();
    const user = await db.get<{
      id: string;
      agency_id: string;
      email: string;
      name: string;
      role: 'admin' | 'member';
    }>('SELECT id, agency_id, email, name, role FROM users WHERE LOWER(email) = ?', email);

    if (!user) {
      recordSecurityLog('auth_magic_link_unknown_email', {
        ip: req.ip || 'unknown',
      });
      res.json({
        ok: true,
        message:
          'If an agency account exists for that email, a single-use verification link has been issued.',
        emailDelivery: {
          configured: emailProvider.isConfigured(),
          delivered: false,
        },
      });
      return;
    }

    const rawToken = generateSecureToken(32);
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
    const createdAt = new Date().toISOString();

    await db.run('DELETE FROM auth_tokens WHERE expires_at < ?', createdAt);
    await db.run(
      `INSERT INTO auth_tokens (id, user_id, token_hash, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      crypto.randomUUID(),
      user.id,
      tokenHash,
      expiresAt,
      createdAt,
    );

    const requestHost = req.get('x-forwarded-host') || req.get('host');
    const safeOrigin = resolveSafeAppOrigin(req.get('origin'), requestHost);
    const magicUrl = `${safeOrigin}/?magicToken=${encodeURIComponent(rawToken)}`;

    const emailResult = await emailProvider.send({
      to: user.email,
      subject: 'Your sign-in link for QavonFlow',
      text: `Sign in to QavonFlow (by Qavon Digital) using this single-use link (expires in 15 minutes): ${magicUrl}`,
    });

    const responseMessage = emailResult.delivered
      ? 'If an agency account exists for that email, a single-use verification link has been sent to your inbox.'
      : serverConfig.isProduction
        ? emailResult.configured
          ? 'SMTP relay delivery failed. Contact an administrator to check the SMTP settings.'
          : 'SMTP is not configured for this deployment. Contact an administrator.'
        : emailResult.configured
          ? 'SMTP relay delivery failed. Check your SMTP settings or use the verification link below.'
          : 'SMTP is not configured in this environment, so use the verification link below.';

    res.json({
      ok: true,
      message: responseMessage,
      emailDelivery: emailResult,
      previewMagicUrl: !serverConfig.isProduction && !emailResult.delivered ? magicUrl : undefined,
    });
  }),
);

authRouter.post(
  '/register-agency',
  authLimiter,
  asyncHandler(async (req, res) => {
    const parsed = registerAgencySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid registration details' });
      return;
    }

    const db = await getDb();
    const email = parsed.data.email.toLowerCase();
    const existing = await db.get('SELECT id FROM users WHERE LOWER(email) = ?', email);
    if (existing) {
      res.status(409).json({
        error: 'An account with that email already exists. Request a magic link instead.',
      });
      return;
    }

    const agencyId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    const now = new Date().toISOString();
    const requiredSections: OnboardingSectionKey[] = [
      'company_info',
      'brand_assets',
      'website_content',
      'project_requirements',
      'access_credentials',
      'additional_documents',
    ];

    await db.transaction(async (tx) => {
      await tx.run(
        `INSERT INTO agencies (id, name, support_email, website, primary_color, default_invite_expiry_days, session_duration_hours, notify_on_submission, notify_on_asset_upload, required_sections_json, created_at)
         VALUES (?, ?, ?, '', '#EDA320', 14, 72, 1, 1, ?, ?)`,
        agencyId,
        parsed.data.agencyName,
        email,
        JSON.stringify(requiredSections),
        now,
      );

      await tx.run(
        `INSERT INTO users (id, agency_id, email, name, role, title, session_version, last_active_at, created_at)
         VALUES (?, ?, ?, ?, 'admin', 'Agency Owner', 1, ?, ?)`,
        userId,
        agencyId,
        email,
        parsed.data.ownerName,
        now,
        now,
      );

      await recordActivityAndNotification(tx, {
        agencyId,
        actorName: parsed.data.ownerName,
        actorRole: 'admin',
        action: 'Agency Registered',
        details: `Created agency workspace "${parsed.data.agencyName}"`,
      });
    });

    recordSecurityLog('agency_registered', { agencyId, userId });

    setSessionCookie(
      res,
      {
        sv: 1,
        userId,
        agencyId,
        role: 'admin',
        name: parsed.data.ownerName,
        email,
      },
      72,
    );

    res.status(201).json({
      user: {
        id: userId,
        email,
        name: parsed.data.ownerName,
        role: 'admin',
        agencyId,
        agencyName: parsed.data.agencyName,
        title: 'Agency Owner',
        clientId: null,
      },
    });
  }),
);

authRouter.post(
  '/verify',
  authLimiter,
  asyncHandler(async (req, res) => {
    const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
    if (!token) {
      res.status(400).json({ error: 'Verification token is required' });
      return;
    }

    const db = await getDb();
    const tokenHash = hashToken(token);
    const tokenRow = await db.get<{
      token_id: string;
      expires_at: string;
      used_at: string | null;
      user_id: string;
      agency_id: string;
      email: string;
      name: string;
      role: 'admin' | 'member';
      title: string;
      session_version: number;
      agency_name: string;
      session_duration_hours: number;
    }>(
      `SELECT t.id as token_id, t.expires_at, t.used_at, u.id as user_id, u.agency_id, u.email, u.name, u.role, u.title, u.session_version, a.name as agency_name, a.session_duration_hours
       FROM auth_tokens t
       JOIN users u ON u.id = t.user_id
       JOIN agencies a ON a.id = u.agency_id
       WHERE t.token_hash = ?`,
      tokenHash,
    );

    if (!tokenRow) {
      recordSecurityLog('auth_verify_invalid_token', { ip: req.ip || 'unknown' });
      res.status(401).json({ error: 'Invalid magic sign-in link' });
      return;
    }

    if (tokenRow.used_at) {
      recordSecurityLog('auth_verify_replay_blocked', {
        userId: tokenRow.user_id,
        agencyId: tokenRow.agency_id,
      });
      res.status(401).json({ error: 'This magic sign-in link has already been used' });
      return;
    }

    if (new Date(tokenRow.expires_at).getTime() < Date.now()) {
      recordSecurityLog('auth_verify_expired', {
        userId: tokenRow.user_id,
        agencyId: tokenRow.agency_id,
      });
      res.status(401).json({ error: 'This magic sign-in link has expired' });
      return;
    }

    const now = new Date().toISOString();
    const updateResult = await db.run(
      'UPDATE auth_tokens SET used_at = ? WHERE id = ? AND used_at IS NULL',
      now,
      tokenRow.token_id,
    );

    if (updateResult.changes === 0) {
      recordSecurityLog('auth_verify_race_replay_blocked', {
        userId: tokenRow.user_id,
        agencyId: tokenRow.agency_id,
      });
      res.status(401).json({ error: 'This magic sign-in link has already been used' });
      return;
    }

    await db.run('UPDATE users SET last_active_at = ? WHERE id = ?', now, tokenRow.user_id);

    setSessionCookie(
      res,
      {
        sv: tokenRow.session_version,
        userId: tokenRow.user_id,
        agencyId: tokenRow.agency_id,
        role: tokenRow.role,
        name: tokenRow.name,
        email: tokenRow.email,
      },
      tokenRow.session_duration_hours || 72,
    );

    recordSecurityLog('auth_verify_success', {
      userId: tokenRow.user_id,
      agencyId: tokenRow.agency_id,
      role: tokenRow.role,
    });

    res.json({
      user: {
        id: tokenRow.user_id,
        email: tokenRow.email,
        name: tokenRow.name,
        role: tokenRow.role,
        agencyId: tokenRow.agency_id,
        agencyName: tokenRow.agency_name,
        title: tokenRow.title,
        clientId: null,
      },
    });
  }),
);
