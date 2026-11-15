import { Router } from 'express';
import type { UserRole } from '../../src/types/index.ts';
import { getDb } from '../db/database.ts';
import { requireAgencyStaff, type AuthenticatedRequest } from '../middleware/auth.ts';
import { asyncHandler } from '../utils/asyncHandler.ts';

export const notificationsRouter = Router();

notificationsRouter.get(
  '/',
  requireAgencyStaff(['admin', 'member']),
  asyncHandler<AuthenticatedRequest>(async (req, res) => {
    const session = req.sessionUser!;
    const agencyId = session.agencyId;
    const db = await getDb();

    type NotificationRow = {
      id: string;
      agency_id: string;
      client_id: string | null;
      title: string;
      message: string;
      is_read: number;
      created_at: string;
    };

    const rows =
      session.role === 'member'
        ? await db.all<NotificationRow>(
            `SELECT n.id, n.agency_id, n.client_id, n.title, n.message, n.is_read, n.created_at
             FROM notifications n
             JOIN clients c ON c.id = n.client_id
             WHERE n.agency_id = ? AND c.agency_id = ? AND c.assigned_to_id = ?
             ORDER BY n.created_at DESC
             LIMIT 30`,
            agencyId,
            agencyId,
            session.id,
          )
        : await db.all<NotificationRow>(
            `SELECT id, agency_id, client_id, title, message, is_read, created_at
             FROM notifications
             WHERE agency_id = ?
             ORDER BY created_at DESC
             LIMIT 30`,
            agencyId,
          );

    res.json({
      notifications: rows.map((n) => ({
        id: n.id,
        agencyId: n.agency_id,
        clientId: n.client_id,
        title: n.title,
        message: n.message,
        isRead: Boolean(n.is_read),
        createdAt: n.created_at,
      })),
      unreadCount: rows.filter((n) => !n.is_read).length,
    });
  }),
);

notificationsRouter.post(
  '/:id/read',
  requireAgencyStaff(['admin', 'member']),
  asyncHandler<AuthenticatedRequest>(async (req, res) => {
    const session = req.sessionUser!;
    const notificationId = String(req.params.id);
    const agencyId = session.agencyId;
    const db = await getDb();

    if (session.role === 'member') {
      const owned = await db.get(
        `SELECT n.id FROM notifications n
         JOIN clients c ON c.id = n.client_id
         WHERE n.id = ? AND n.agency_id = ? AND c.assigned_to_id = ?`,
        notificationId,
        agencyId,
        session.id,
      );
      if (!owned) {
        res.status(404).json({ error: 'Notification not found' });
        return;
      }
    }

    const result = await db.run(
      'UPDATE notifications SET is_read = 1 WHERE id = ? AND agency_id = ?',
      notificationId,
      agencyId,
    );
    if (result.changes === 0) {
      res.status(404).json({ error: 'Notification not found' });
      return;
    }
    res.json({ ok: true });
  }),
);

notificationsRouter.post(
  '/read-all',
  requireAgencyStaff(['admin', 'member']),
  asyncHandler<AuthenticatedRequest>(async (req, res) => {
    const session = req.sessionUser!;
    const agencyId = session.agencyId;
    const db = await getDb();
    if (session.role === 'member') {
      await db.run(
        `UPDATE notifications SET is_read = 1
         WHERE agency_id = ? AND client_id IN (SELECT id FROM clients WHERE agency_id = ? AND assigned_to_id = ?)`,
        agencyId,
        agencyId,
        session.id,
      );
    } else {
      await db.run('UPDATE notifications SET is_read = 1 WHERE agency_id = ?', agencyId);
    }
    res.json({ ok: true });
  }),
);

notificationsRouter.get(
  '/activity',
  requireAgencyStaff(['admin', 'member']),
  asyncHandler<AuthenticatedRequest>(async (req, res) => {
    const session = req.sessionUser!;
    const agencyId = session.agencyId;
    const db = await getDb();

    type ActivityRow = {
      id: string;
      agency_id: string;
      client_id: string | null;
      client_name: string | null;
      actor_name: string;
      actor_role: UserRole;
      action: string;
      details: string;
      created_at: string;
    };

    const rows =
      session.role === 'member'
        ? await db.all<ActivityRow>(
            `SELECT l.id, l.agency_id, l.client_id, c.company_name as client_name, l.actor_name, l.actor_role, l.action, l.details, l.created_at
             FROM activity_logs l
             JOIN clients c ON c.id = l.client_id
             WHERE l.agency_id = ? AND c.agency_id = ? AND c.assigned_to_id = ?
             ORDER BY l.created_at DESC
             LIMIT 100`,
            agencyId,
            agencyId,
            session.id,
          )
        : await db.all<ActivityRow>(
            `SELECT l.id, l.agency_id, l.client_id, c.company_name as client_name, l.actor_name, l.actor_role, l.action, l.details, l.created_at
             FROM activity_logs l
             LEFT JOIN clients c ON c.id = l.client_id
             WHERE l.agency_id = ?
             ORDER BY l.created_at DESC
             LIMIT 100`,
            agencyId,
          );

    res.json({
      activity: rows.map((a) => ({
        id: a.id,
        agencyId: a.agency_id,
        clientId: a.client_id,
        clientName: a.client_name,
        actorName: a.actor_name,
        actorRole: a.actor_role,
        action: a.action,
        details: a.details,
        createdAt: a.created_at,
      })),
    });
  }),
);
