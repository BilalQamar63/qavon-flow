import { Router } from 'express';
import { getDb } from '../db/database.ts';
import { requireAgencyStaff, type AuthenticatedRequest } from '../middleware/auth.ts';
import {
  getAgencyRequiredSections,
  hydrateClientRecords,
  parseDbClientRows,
} from '../services/clientHydrator.ts';
import { asyncHandler } from '../utils/asyncHandler.ts';
import { CLIENT_STATUS_LABELS, ONBOARDING_SECTIONS } from '../../src/constants/onboarding.ts';
import type {
  AssetCategory,
  ClientOnboardingStatus,
  DashboardOverview,
  OnboardingSectionKey,
  PendingRequirementSummary,
  UserRole,
} from '../../src/types/index.ts';

export const dashboardRouter = Router();

dashboardRouter.get(
  '/overview',
  requireAgencyStaff(['admin', 'member']),
  asyncHandler<AuthenticatedRequest>(async (req, res) => {
    const session = req.sessionUser!;
    const agencyId = session.agencyId;
    const isMember = session.role === 'member';
    const db = await getDb();

    const clientQuery = isMember
      ? `SELECT c.*, u.name as assigned_to_name
         FROM clients c
         LEFT JOIN users u ON u.id = c.assigned_to_id
         WHERE c.agency_id = ? AND c.status != 'archived' AND c.assigned_to_id = ?
         ORDER BY c.created_at DESC`
      : `SELECT c.*, u.name as assigned_to_name
         FROM clients c
         LEFT JOIN users u ON u.id = c.assigned_to_id
         WHERE c.agency_id = ? AND c.status != 'archived'
         ORDER BY c.created_at DESC`;

    const rawRows = isMember
      ? await db.all(clientQuery, agencyId, session.id)
      : await db.all(clientQuery, agencyId);

    const clientRows = parseDbClientRows(rawRows);
    const requiredSections = await getAgencyRequiredSections(db, agencyId);
    const hydratedClients = await hydrateClientRecords(db, clientRows, requiredSections);

    const totalClients = hydratedClients.length;
    const statusCounts: Record<ClientOnboardingStatus, number> = {
      pending: 0,
      in_progress: 0,
      in_review: 0,
      completed: 0,
      overdue: 0,
      archived: 0,
    };
    let completionSum = 0;

    for (const c of hydratedClients) {
      statusCounts[c.status] += 1;
      completionSum += c.progress.overallPercentage;
    }

    const activeOnboardings = statusCounts.in_progress + statusCounts.in_review;
    const completedOnboardings = statusCounts.completed;
    const pendingOnboardings = statusCounts.pending;
    const overdueOnboardings = statusCounts.overdue;
    const averageCompletion = totalClients === 0 ? 0 : Math.round(completionSum / totalClients);

    const totalAssetsRow = isMember
      ? await db.get<{ cnt: number | string }>(
          `SELECT COUNT(*) as cnt
           FROM assets a
           JOIN clients c ON c.id = a.client_id
           WHERE a.agency_id = ? AND c.agency_id = ? AND c.status != 'archived' AND c.assigned_to_id = ?`,
          agencyId,
          agencyId,
          session.id,
        )
      : await db.get<{ cnt: number | string }>(
          `SELECT COUNT(*) as cnt
           FROM assets a
           JOIN clients c ON c.id = a.client_id
           WHERE a.agency_id = ? AND c.agency_id = ? AND c.status != 'archived'`,
          agencyId,
          agencyId,
        );

    const trackedStatuses: ClientOnboardingStatus[] = [
      'completed',
      'in_progress',
      'in_review',
      'pending',
      'overdue',
    ];

    const statusDistribution = trackedStatuses.map((status) => ({
      status,
      label: CLIENT_STATUS_LABELS[status],
      count: statusCounts[status],
    }));

    const groupedSectionRows = isMember
      ? await db.all<{ section_key: OnboardingSectionKey; cnt: number | string }>(
          `SELECT s.section_key, COUNT(*) as cnt
           FROM onboarding_sections s
           JOIN clients c ON c.id = s.client_id
           WHERE s.agency_id = ? AND c.agency_id = ? AND c.status != 'archived' AND s.status = 'completed' AND c.assigned_to_id = ?
           GROUP BY s.section_key`,
          agencyId,
          agencyId,
          session.id,
        )
      : await db.all<{ section_key: OnboardingSectionKey; cnt: number | string }>(
          `SELECT s.section_key, COUNT(*) as cnt
           FROM onboarding_sections s
           JOIN clients c ON c.id = s.client_id
           WHERE s.agency_id = ? AND c.agency_id = ? AND c.status != 'archived' AND s.status = 'completed'
           GROUP BY s.section_key`,
          agencyId,
          agencyId,
        );

    const completedBySection = new Map<OnboardingSectionKey, number>(
      groupedSectionRows.map((row) => [row.section_key, Number(row.cnt ?? 0)]),
    );

    const sectionCompletionRates = ONBOARDING_SECTIONS.map((def) => {
      const completedCount = completedBySection.get(def.key) || 0;
      return {
        sectionKey: def.key,
        title: def.shortTitle,
        completedCount,
        totalClients,
        percentage: totalClients === 0 ? 0 : Math.round((completedCount / totalClients) * 100),
      };
    });

    const priorityRank: Record<ClientOnboardingStatus, number> = {
      overdue: 0,
      pending: 1,
      in_review: 2,
      in_progress: 3,
      completed: 4,
      archived: 5,
    };

    const pendingRequirements: PendingRequirementSummary[] = hydratedClients
      .filter((c) => {
        const missingCount =
          c.progress.missingRequiredItems.length + c.progress.pendingAssetSlots.length;
        return c.status !== 'completed' && missingCount > 0;
      })
      .sort((a, b) => priorityRank[a.status] - priorityRank[b.status])
      .slice(0, 5)
      .map((c) => {
        const firstField = c.progress.missingRequiredItems[0];
        const firstAsset = c.progress.pendingAssetSlots[0];
        return {
          clientId: c.id,
          companyName: c.companyName,
          status: c.status,
          dueDate: c.dueDate,
          missingCount:
            c.progress.missingRequiredItems.length + c.progress.pendingAssetSlots.length,
          nextRequirementLabel: firstField
            ? `${firstField.sectionTitle}: ${firstField.fieldLabel}`
            : firstAsset
              ? `Brand Assets: ${firstAsset.label}`
              : 'Pending section review',
          nextSectionKey: firstField ? firstField.sectionKey : 'brand_assets',
        };
      });

    type RecentAssetRow = {
      id: string;
      agency_id: string;
      client_id: string;
      client_name: string;
      category: AssetCategory;
      original_name: string;
      mime_type: string;
      size_bytes: number;
      cloudinary_public_id: string;
      resource_type: 'image' | 'video' | 'raw';
      file_format: string;
      description: string;
      section_key: OnboardingSectionKey | null;
      uploaded_by_name: string;
      uploaded_by_role: UserRole;
      created_at: string;
      updated_at: string | null;
    };

    const recentAssetRows = isMember
      ? await db.all<RecentAssetRow>(
          `SELECT a.id, a.agency_id, a.client_id, c.company_name as client_name, a.category, a.original_name,
                  a.mime_type, a.size_bytes, a.cloudinary_public_id, a.resource_type, a.file_format,
                  a.description, a.section_key, a.uploaded_by_name, a.uploaded_by_role, a.created_at, a.updated_at
           FROM assets a
           JOIN clients c ON c.id = a.client_id
           WHERE a.agency_id = ? AND c.agency_id = ? AND c.status != 'archived' AND c.assigned_to_id = ?
           ORDER BY a.created_at DESC
           LIMIT 5`,
          agencyId,
          agencyId,
          session.id,
        )
      : await db.all<RecentAssetRow>(
          `SELECT a.id, a.agency_id, a.client_id, c.company_name as client_name, a.category, a.original_name,
                  a.mime_type, a.size_bytes, a.cloudinary_public_id, a.resource_type, a.file_format,
                  a.description, a.section_key, a.uploaded_by_name, a.uploaded_by_role, a.created_at, a.updated_at
           FROM assets a
           JOIN clients c ON c.id = a.client_id
           WHERE a.agency_id = ? AND c.agency_id = ? AND c.status != 'archived'
           ORDER BY a.created_at DESC
           LIMIT 5`,
          agencyId,
          agencyId,
        );

    type RecentActivityRow = {
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

    const recentActivity = isMember
      ? await db.all<RecentActivityRow>(
          `SELECT l.id, l.agency_id, l.client_id, c.company_name as client_name, l.actor_name, l.actor_role, l.action, l.details, l.created_at
           FROM activity_logs l
           JOIN clients c ON c.id = l.client_id
           WHERE l.agency_id = ? AND c.agency_id = ? AND c.assigned_to_id = ?
           ORDER BY l.created_at DESC
           LIMIT 8`,
          agencyId,
          agencyId,
          session.id,
        )
      : await db.all<RecentActivityRow>(
          `SELECT l.id, l.agency_id, l.client_id, c.company_name as client_name, l.actor_name, l.actor_role, l.action, l.details, l.created_at
           FROM activity_logs l
           LEFT JOIN clients c ON c.id = l.client_id
           WHERE l.agency_id = ?
           ORDER BY l.created_at DESC
           LIMIT 8`,
          agencyId,
        );

    const overview: DashboardOverview = {
      stats: {
        totalClients,
        activeOnboardings,
        completedOnboardings,
        pendingOnboardings,
        overdueOnboardings,
        averageCompletion,
        totalAssets: Number(totalAssetsRow?.cnt ?? 0),
      },
      statusDistribution,
      sectionCompletionRates,
      recentClients: hydratedClients.slice(0, 5),
      pendingRequirements,
      recentAssets: recentAssetRows.map((a) => ({
        id: a.id,
        agencyId: a.agency_id,
        clientId: a.client_id,
        clientName: a.client_name,
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
      recentActivity: recentActivity.map((a) => ({
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
    };

    res.json(overview);
  }),
);
