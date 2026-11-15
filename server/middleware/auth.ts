import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { getDb } from '../db/database.ts';
import { signPayload, verifySignedPayload } from '../security/crypto.ts';
import { recordSecurityLog } from '../services/audit.ts';
import type { SessionUser, UserRole } from '../../src/types/index.ts';

export const SESSION_COOKIE_NAME = 'hub_session';

export interface SessionCookiePayload {
  jti: string;
  sv: number;
  userId: string;
  agencyId: string;
  role: UserRole;
  clientId?: string | null;
  name: string;
  email: string;
}

export interface AuthenticatedRequest extends Request {
  sessionUser?: SessionUser;
}

function getCookieBaseOptions() {
  const secure = process.env.NODE_ENV === 'production' && process.env.FORCE_INSECURE_COOKIE !== 'true';
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure,
    path: '/',
  };
}

export function setSessionCookie(
  res: Response,
  payload: Omit<SessionCookiePayload, 'jti'>,
  hours = 72,
): void {
  const token = signPayload<SessionCookiePayload>(
    {
      ...payload,
      jti: crypto.randomUUID(),
    },
    hours * 3600,
  );
  res.cookie(SESSION_COOKIE_NAME, token, {
    ...getCookieBaseOptions(),
    maxAge: hours * 3600 * 1000,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE_NAME, getCookieBaseOptions());
}

export async function revokeSessionToken(rawCookie: string | undefined): Promise<void> {
  if (!rawCookie) return;
  const decoded = verifySignedPayload<SessionCookiePayload>(rawCookie);
  if (!decoded || !decoded.jti) return;
  const db = await getDb();
  const nowIso = new Date().toISOString();
  const expIso = new Date(decoded.exp * 1000).toISOString();
  await db.run('DELETE FROM revoked_sessions WHERE expires_at < ?', nowIso);
  await db.run(
    'INSERT INTO revoked_sessions (jti, expires_at) VALUES (?, ?) ON CONFLICT (jti) DO NOTHING',
    decoded.jti,
    expIso,
  );
}

export async function resolveSessionFromRequest(req: Request): Promise<SessionUser | null> {
  const rawCookie = req.cookies?.[SESSION_COOKIE_NAME] as string | undefined;
  if (!rawCookie) return null;

  const decoded = verifySignedPayload<SessionCookiePayload>(rawCookie);
  if (!decoded || !decoded.jti || typeof decoded.sv !== 'number') return null;

  const db = await getDb();
  const revoked = await db.get('SELECT jti FROM revoked_sessions WHERE jti = ?', decoded.jti);
  if (revoked) return null;

  const agency = await db.get<{ id: string; name: string }>(
    'SELECT id, name FROM agencies WHERE id = ?',
    decoded.agencyId,
  );

  if (!agency) return null;

  if (decoded.role === 'client') {
    if (!decoded.clientId) return null;
    const client = await db.get<{
      id: string;
      contact_name: string;
      email: string;
      status: string;
      session_version: number;
    }>(
      'SELECT id, contact_name, email, status, session_version FROM clients WHERE id = ? AND agency_id = ?',
      decoded.clientId,
      decoded.agencyId,
    );

    if (!client || client.status === 'archived' || client.session_version !== decoded.sv) {
      return null;
    }

    return {
      id: `client-session:${client.id}`,
      email: client.email,
      name: client.contact_name,
      role: 'client',
      agencyId: agency.id,
      agencyName: agency.name,
      clientId: client.id,
    };
  }

  const user = await db.get<{
    id: string;
    agency_id: string;
    email: string;
    name: string;
    role: 'admin' | 'member';
    title: string;
    session_version: number;
  }>(
    'SELECT id, agency_id, email, name, role, title, session_version FROM users WHERE id = ? AND agency_id = ?',
    decoded.userId,
    decoded.agencyId,
  );

  if (!user || user.session_version !== decoded.sv) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    agencyId: user.agency_id,
    agencyName: agency.name,
    title: user.title,
    clientId: null,
  };
}

export async function checkClientWorkspaceAccess(
  session: SessionUser,
  clientId: string,
): Promise<
  | { ok: true; status: string; assignedToId: string | null }
  | { ok: false; code: 403 | 404; error: string }
> {
  if (session.role === 'client' && session.clientId !== clientId) {
    return {
      ok: false,
      code: 403,
      error: 'Access denied: clients can only access their assigned portal',
    };
  }

  const db = await getDb();
  const row = await db.get<{ id: string; status: string; assigned_to_id: string | null }>(
    'SELECT id, status, assigned_to_id FROM clients WHERE id = ? AND agency_id = ?',
    clientId,
    session.agencyId,
  );

  if (!row) {
    return { ok: false, code: 404, error: 'Client workspace not found' };
  }

  if (session.role === 'member' && row.assigned_to_id !== session.id) {
    return {
      ok: false,
      code: 403,
      error: 'Team members can only access workspaces assigned to them',
    };
  }

  return { ok: true, status: row.status, assignedToId: row.assigned_to_id };
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  resolveSessionFromRequest(req)
    .then((session) => {
      if (!session) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }
      req.sessionUser = session;
      next();
    })
    .catch(next);
}

export function requireAgencyStaff(
  allowedRoles: ('admin' | 'member')[] = ['admin', 'member'],
) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const promise = req.sessionUser
      ? Promise.resolve(req.sessionUser)
      : resolveSessionFromRequest(req);

    promise
      .then((session) => {
        if (!session) {
          res.status(401).json({ error: 'Authentication required' });
          return;
        }
        if (session.role === 'client' || !allowedRoles.includes(session.role)) {
          recordSecurityLog('authorization_denied', {
            path: req.originalUrl,
            method: req.method,
            role: session.role,
            agencyId: session.agencyId,
            userId: session.id,
          });
          res.status(403).json({ error: 'Insufficient permissions for this action' });
          return;
        }
        req.sessionUser = session;
        next();
      })
      .catch(next);
  };
}

export function requireClientScope(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  (async () => {
    const session = req.sessionUser || (await resolveSessionFromRequest(req));
    if (!session) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    req.sessionUser = session;

    const targetClientId = String(req.params.clientId || req.params.id || '');
    if (!targetClientId) {
      res.status(400).json({ error: 'Client identifier is required' });
      return;
    }

    const access = await checkClientWorkspaceAccess(session, targetClientId);
    if (!access.ok) {
      if (access.code === 403) {
        recordSecurityLog('client_scope_denied', {
          path: req.originalUrl,
          method: req.method,
          role: session.role,
          agencyId: session.agencyId,
          userId: session.id,
          targetClientId,
        });
      }
      res.status(access.code).json({ error: access.error });
      return;
    }

    next();
  })().catch(next);
}
