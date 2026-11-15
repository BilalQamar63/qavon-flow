import crypto from 'node:crypto';
import type { UserRole } from '../../src/types/index.ts';
import type { DbQueryExecutor } from '../db/database.ts';

const SENSITIVE_LOG_KEY_PATTERN = /(token|secret|password|key|cookie|auth|credential)/i;

export function recordSecurityLog(
  event: string,
  meta: Record<string, string | number | boolean | null | undefined>,
): void {
  if (process.env.NODE_ENV === 'test') return;
  const sanitized: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (v === undefined) continue;
    sanitized[k] = SENSITIVE_LOG_KEY_PATTERN.test(k) ? '[REDACTED]' : v;
  }
  console.info(
    JSON.stringify({
      type: 'security_event',
      ts: new Date().toISOString(),
      event,
      ...sanitized,
    }),
  );
}

export async function recordActivityAndNotification(
  db: DbQueryExecutor,
  params: {
    agencyId: string;
    clientId?: string | null;
    actorName: string;
    actorRole: UserRole;
    action: string;
    details: string;
    notificationTitle?: string;
    notificationMessage?: string;
  },
): Promise<void> {
  const now = new Date().toISOString();
  const logId = crypto.randomUUID();

  await db.run(
    `INSERT INTO activity_logs (id, agency_id, client_id, actor_name, actor_role, action, details, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    logId,
    params.agencyId,
    params.clientId ?? null,
    params.actorName,
    params.actorRole,
    params.action,
    params.details,
    now,
  );

  if (params.notificationTitle && params.notificationMessage) {
    await db.run(
      `INSERT INTO notifications (id, agency_id, client_id, title, message, is_read, created_at)
       VALUES (?, ?, ?, ?, ?, 0, ?)`,
      crypto.randomUUID(),
      params.agencyId,
      params.clientId ?? null,
      params.notificationTitle,
      params.notificationMessage,
      now,
    );
  }
}
