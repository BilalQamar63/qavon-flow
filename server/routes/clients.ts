import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { serverConfig } from '../config.ts';
import type { CloudinaryDeliveryType, CloudinaryResourceType } from '../config/cloudinary.ts';
import { createDefaultSectionsForClient, getDb } from '../db/database.ts';
import {
  checkClientWorkspaceAccess,
  requireAgencyStaff,
  requireClientScope,
  type AuthenticatedRequest,
} from '../middleware/auth.ts';
import { recordActivityAndNotification, recordSecurityLog } from '../services/audit.ts';
import {
  getAgencyRequiredSections,
  hydrateClientRecord,
  hydrateClientRecords,
  parseDbClientRow,
  parseDbClientRows,
} from '../services/clientHydrator.ts';
import { deleteFromCloudinary } from '../services/cloudinary/delete.service.ts';
import { asyncHandler } from '../utils/asyncHandler.ts';
import { createClientSchema, updateClientSchema } from '../../src/schemas/validation.ts';

export const clientsRouter = Router();

clientsRouter.get(
  '/',
  requireAgencyStaff(['admin', 'member']),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const session = req.sessionUser!;
    const agencyId = session.agencyId;
    const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
    const status = typeof req.query.status === 'string' ? req.query.status.trim() : 'all';
    const rawLimit = Number.parseInt(String(req.query.limit ?? '500'), 10);
    const rawOffset = Number.parseInt(String(req.query.offset ?? '0'), 10);
    const limit = Number.isFinite(rawLimit) ? Math.min(500, Math.max(1, rawLimit)) : 500;
    const offset = Number.isFinite(rawOffset) ? Math.max(0, rawOffset) : 0;

    const db = await getDb();
    let query = `
      SELECT c.*, u.name as assigned_to_name
      FROM clients c
      LEFT JOIN users u ON u.id = c.assigned_to_id
      WHERE c.agency_id = ?
    `;
    const params: (string | number)[] = [agencyId];

    if (session.role === 'member') {
      query += ` AND c.assigned_to_id = ?`;
      params.push(session.id);
    }

    if (status === 'all') {
      query += ` AND c.status != 'archived'`;
    } else {
      query += ` AND c.status = ?`;
      params.push(status);
    }

    if (search) {
      query += ` AND (LOWER(c.company_name) LIKE ? OR LOWER(c.contact_name) LIKE ? OR LOWER(c.email) LIKE ? OR LOWER(c.industry) LIKE ?)`;
      const pattern = `%${search}%`;
      params.push(pattern, pattern, pattern, pattern);
    }

    query += ` ORDER BY c.updated_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const rawRows = await db.all(query, ...params);
    const rows = parseDbClientRows(rawRows);
    const requiredSections = await getAgencyRequiredSections(db, agencyId);
    const clients = await hydrateClientRecords(db, rows, requiredSections);

    res.json({ clients });
  }),
);

clientsRouter.post(
  '/',
  requireAgencyStaff(['admin', 'member']),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const parsed = createClientSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid client payload' });
      return;
    }

    const session = req.sessionUser!;
    const agencyId = session.agencyId;
    const db = await getDb();
    const clientId = crypto.randomUUID();
    const now = new Date().toISOString();
    const data = parsed.data;

    let resolvedAssigneeId: string | null = data.assignedToId || null;
    if (session.role === 'member') {
      if (resolvedAssigneeId && resolvedAssigneeId !== session.id) {
        res.status(403).json({ error: 'Team members cannot assign new clients to other users' });
        return;
      }
      resolvedAssigneeId = session.id;
    } else if (resolvedAssigneeId) {
      const assignee = await db.get(
        'SELECT id FROM users WHERE id = ? AND agency_id = ?',
        resolvedAssigneeId,
        agencyId,
      );
      if (!assignee) {
        res.status(400).json({ error: 'Selected team member does not belong to this agency' });
        return;
      }
    }

    await db.transaction(async (tx) => {
      await tx.run(
        `INSERT INTO clients (id, agency_id, company_name, contact_name, email, phone, website, industry, description, internal_notes, status, assigned_to_id, due_date, session_version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, 1, ?, ?)`,
        clientId,
        agencyId,
        data.companyName,
        data.contactName,
        data.email,
        data.phone,
        data.website,
        data.industry,
        data.description,
        data.internalNotes,
        resolvedAssigneeId,
        data.dueDate || null,
        now,
        now,
      );

      await createDefaultSectionsForClient(tx, agencyId, clientId, {
        companyName: data.companyName,
        contactName: data.contactName,
        email: data.email,
        industry: data.industry,
        website: data.website,
        description: data.description,
      });

      await recordActivityAndNotification(tx, {
        agencyId,
        clientId,
        actorName: session.name,
        actorRole: session.role,
        action: 'Client Created',
        details: `Created onboarding workspace for ${data.companyName}`,
        notificationTitle: 'New Client Workspace Created',
        notificationMessage: `${session.name} added ${data.companyName} to onboarding.`,
      });
    });

    const rawCreated = await db.get(
      `SELECT c.*, u.name as assigned_to_name FROM clients c LEFT JOIN users u ON u.id = c.assigned_to_id WHERE c.id = ? AND c.agency_id = ?`,
      clientId,
      agencyId,
    );

    const createdRow = parseDbClientRow(rawCreated);
    if (!createdRow) {
      res.status(500).json({ error: 'Failed to load created client record' });
      return;
    }

    const requiredSections = await getAgencyRequiredSections(db, agencyId);
    res.status(201).json({ client: await hydrateClientRecord(db, createdRow, requiredSections) });
  }),
);

clientsRouter.get(
  '/:id',
  requireClientScope,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const session = req.sessionUser!;
    const clientId = String(req.params.id);
    const agencyId = session.agencyId;
    const db = await getDb();
    const rawRow = await db.get(
      `SELECT c.*, u.name as assigned_to_name
       FROM clients c
       LEFT JOIN users u ON u.id = c.assigned_to_id
       WHERE c.id = ? AND c.agency_id = ?`,
      clientId,
      agencyId,
    );

    const row = parseDbClientRow(rawRow);
    if (!row) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }

    const requiredSections = await getAgencyRequiredSections(db, agencyId);
    const client = await hydrateClientRecord(db, row, requiredSections);
    if (session.role === 'client') {
      client.internalNotes = '';
      res.json({ client, activity: [] });
      return;
    }

    const activityRows = await db.all<{
      id: string;
      agency_id: string;
      client_id: string | null;
      actor_name: string;
      actor_role: string;
      action: string;
      details: string;
      created_at: string;
    }>(
      `SELECT id, agency_id, client_id, actor_name, actor_role, action, details, created_at
       FROM activity_logs
       WHERE client_id = ? AND agency_id = ?
       ORDER BY created_at DESC
       LIMIT 30`,
      row.id,
      agencyId,
    );

    const activity = activityRows.map((a) => ({
      id: a.id,
      agencyId: a.agency_id,
      clientId: a.client_id,
      clientName: row.company_name,
      actorName: a.actor_name,
      actorRole: a.actor_role,
      action: a.action,
      details: a.details,
      createdAt: a.created_at,
    }));

    res.json({ client, activity });
  }),
);

clientsRouter.patch(
  '/:id',
  requireAgencyStaff(['admin', 'member']),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const parsed = updateClientSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid update payload' });
      return;
    }

    const session = req.sessionUser!;
    const clientId = String(req.params.id);
    const agencyId = session.agencyId;

    const access = await checkClientWorkspaceAccess(session, clientId);
    if (!access.ok) {
      if (access.code === 403) {
        recordSecurityLog('client_update_denied', {
          agencyId,
          clientId,
          actorId: session.id,
          role: session.role,
        });
      }
      res.status(access.code).json({ error: access.error });
      return;
    }

    const db = await getDb();
    const existing = parseDbClientRow(
      await db.get('SELECT * FROM clients WHERE id = ? AND agency_id = ?', clientId, agencyId),
    );

    if (!existing) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }

    const d = parsed.data;
    if (session.role === 'member') {
      if (d.assignedToId !== undefined && d.assignedToId !== existing.assigned_to_id) {
        recordSecurityLog('client_reassign_privilege_escalation_blocked', {
          agencyId,
          clientId,
          actorId: session.id,
        });
        res.status(403).json({ error: 'Only agency administrators can reassign client workspaces' });
        return;
      }
      if (d.status === 'archived') {
        res.status(403).json({ error: 'Only agency administrators can archive client workspaces' });
        return;
      }
    }

    if (d.assignedToId) {
      const assignee = await db.get(
        'SELECT id FROM users WHERE id = ? AND agency_id = ?',
        d.assignedToId,
        agencyId,
      );
      if (!assignee) {
        res.status(400).json({ error: 'Selected team member does not belong to this agency' });
        return;
      }
    }

    const now = new Date().toISOString();
    const archivingNow = d.status === 'archived' && existing.status !== 'archived';

    await db.run(
      `UPDATE clients SET
         company_name = ?,
         contact_name = ?,
         email = ?,
         phone = ?,
         website = ?,
         industry = ?,
         description = ?,
         internal_notes = ?,
         status = ?,
         assigned_to_id = ?,
         due_date = ?,
         session_version = session_version + ?,
         updated_at = ?
       WHERE id = ? AND agency_id = ?`,
      d.companyName ?? existing.company_name,
      d.contactName ?? existing.contact_name,
      d.email ?? existing.email,
      d.phone ?? existing.phone,
      d.website ?? existing.website,
      d.industry ?? existing.industry,
      d.description ?? existing.description,
      d.internalNotes ?? existing.internal_notes,
      d.status ?? existing.status,
      d.assignedToId !== undefined ? d.assignedToId : existing.assigned_to_id,
      d.dueDate !== undefined ? d.dueDate : existing.due_date,
      archivingNow ? 1 : 0,
      now,
      existing.id,
      agencyId,
    );

    if (archivingNow) {
      await db.run(
        `UPDATE invitations SET status = 'revoked', revoked_at = ? WHERE client_id = ? AND agency_id = ? AND status IN ('pending', 'sent')`,
        now,
        existing.id,
        agencyId,
      );
    }

    await recordActivityAndNotification(db, {
      agencyId,
      clientId: existing.id,
      actorName: session.name,
      actorRole: session.role,
      action: 'Client Updated',
      details: `Updated workspace details for ${d.companyName ?? existing.company_name}`,
    });

    const updatedRow = parseDbClientRow(
      await db.get(
        `SELECT c.*, u.name as assigned_to_name FROM clients c LEFT JOIN users u ON u.id = c.assigned_to_id WHERE c.id = ? AND c.agency_id = ?`,
        existing.id,
        agencyId,
      ),
    );
    if (!updatedRow) {
      res.status(500).json({ error: 'Failed to load updated client record' });
      return;
    }

    const requiredSections = await getAgencyRequiredSections(db, agencyId);
    res.json({ client: await hydrateClientRecord(db, updatedRow, requiredSections) });
  }),
);

clientsRouter.delete(
  '/:id',
  requireAgencyStaff(['admin']),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const clientId = String(req.params.id);
    const agencyId = req.sessionUser!.agencyId;
    const permanent = req.query.permanent === 'true';
    const db = await getDb();

    const existing = await db.get<{ id: string; company_name: string }>(
      'SELECT id, company_name FROM clients WHERE id = ? AND agency_id = ?',
      clientId,
      agencyId,
    );

    if (!existing) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }

    const now = new Date().toISOString();
    if (!permanent) {
      await db.run(
        `UPDATE clients SET status = 'archived', session_version = session_version + 1, updated_at = ? WHERE id = ? AND agency_id = ?`,
        now,
        existing.id,
        agencyId,
      );
      await db.run(
        `UPDATE invitations SET status = 'revoked', revoked_at = ? WHERE client_id = ? AND agency_id = ? AND status IN ('pending', 'sent')`,
        now,
        existing.id,
        agencyId,
      );
      await recordActivityAndNotification(db, {
        agencyId,
        clientId: existing.id,
        actorName: req.sessionUser!.name,
        actorRole: req.sessionUser!.role,
        action: 'Client Archived',
        details: `Archived workspace for ${existing.company_name}`,
      });
      recordSecurityLog('client_archived', {
        agencyId,
        clientId: existing.id,
        actorId: req.sessionUser!.id,
      });
      res.json({ ok: true, mode: 'archived' });
      return;
    }

    const assets = await db.all<{
      id: string;
      storage_key: string;
      cloudinary_public_id: string;
      resource_type: CloudinaryResourceType;
      delivery_type: CloudinaryDeliveryType;
    }>(
      'SELECT id, storage_key, cloudinary_public_id, resource_type, delivery_type FROM assets WHERE client_id = ? AND agency_id = ?',
      existing.id,
      agencyId,
    );

    await Promise.all(
      assets.map(async (a) => {
        if (a.cloudinary_public_id) {
          await deleteFromCloudinary({
            db,
            agencyId,
            assetId: a.id,
            publicId: a.cloudinary_public_id,
            resourceType: a.resource_type || 'raw',
            deliveryType: a.delivery_type || 'authenticated',
            queueOnFailure: true,
          });
        }
        if (a.storage_key) {
          const legacyPath = path.resolve(serverConfig.legacyUploadDir, a.storage_key);
          if (legacyPath.startsWith(serverConfig.legacyUploadDir + path.sep)) {
            await fs.promises.unlink(legacyPath).catch(() => undefined);
          }
        }
      }),
    );

    await db.run('DELETE FROM clients WHERE id = ? AND agency_id = ?', existing.id, agencyId);

    await recordActivityAndNotification(db, {
      agencyId,
      actorName: req.sessionUser!.name,
      actorRole: req.sessionUser!.role,
      action: 'Client Deleted',
      details: `Permanently removed ${existing.company_name} and all associated files`,
    });
    recordSecurityLog('client_permanently_deleted', {
      agencyId,
      clientId: existing.id,
      actorId: req.sessionUser!.id,
    });

    res.json({ ok: true, mode: 'deleted' });
  }),
);
