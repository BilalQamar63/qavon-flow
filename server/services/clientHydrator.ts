import { safeJsonParse } from '../../src/constants/onboarding.ts';
import type {
  AssetCategory,
  ClientOnboardingStatus,
  ClientRecord,
  InvitationStatus,
  OnboardingSectionKey,
  SectionCompletionStatus,
} from '../../src/types/index.ts';
import type { DbQueryExecutor } from '../db/database.ts';
import { calculateClientProgress, type RawAssetRow, type RawSectionRow } from './progress.ts';

export interface DbClientRow {
  id: string;
  agency_id: string;
  company_name: string;
  contact_name: string;
  email: string;
  phone: string;
  website: string;
  industry: string;
  description: string;
  internal_notes: string;
  status: ClientOnboardingStatus;
  assigned_to_id: string | null;
  assigned_to_name?: string | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
}

const DEFAULT_REQUIRED_SECTIONS: OnboardingSectionKey[] = [
  'company_info',
  'brand_assets',
  'website_content',
  'project_requirements',
  'access_credentials',
  'additional_documents',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object');
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

export function parseDbClientRow(raw: unknown): DbClientRow | null {
  if (!isRecord(raw) || typeof raw.id !== 'string' || typeof raw.agency_id !== 'string') {
    return null;
  }
  return {
    id: raw.id,
    agency_id: raw.agency_id,
    company_name: asString(raw.company_name),
    contact_name: asString(raw.contact_name),
    email: asString(raw.email),
    phone: asString(raw.phone),
    website: asString(raw.website),
    industry: asString(raw.industry),
    description: asString(raw.description),
    internal_notes: asString(raw.internal_notes),
    status: asString(raw.status, 'pending') as ClientOnboardingStatus,
    assigned_to_id: asNullableString(raw.assigned_to_id),
    assigned_to_name: asNullableString(raw.assigned_to_name),
    due_date: asNullableString(raw.due_date),
    created_at: asString(raw.created_at),
    updated_at: asString(raw.updated_at),
  };
}

export function parseDbClientRows(rawRows: unknown[]): DbClientRow[] {
  const result: DbClientRow[] = [];
  for (const row of rawRows) {
    const parsed = parseDbClientRow(row);
    if (parsed) {
      result.push(parsed);
    }
  }
  return result;
}

export async function getAgencyRequiredSections(
  db: DbQueryExecutor,
  agencyId: string,
): Promise<OnboardingSectionKey[]> {
  const row = await db.get<{ required_sections_json: string }>(
    'SELECT required_sections_json FROM agencies WHERE id = ?',
    agencyId,
  );

  if (!row) {
    return [...DEFAULT_REQUIRED_SECTIONS];
  }
  return safeJsonParse<OnboardingSectionKey[]>(row.required_sections_json, DEFAULT_REQUIRED_SECTIONS);
}

export function parseRawSectionRows(
  rawRows: unknown[],
): Array<RawSectionRow & { client_id: string }> {
  const result: Array<RawSectionRow & { client_id: string }> = [];
  for (const row of rawRows) {
    if (!isRecord(row) || typeof row.section_key !== 'string') continue;
    result.push({
      client_id: asString(row.client_id),
      section_key: row.section_key as OnboardingSectionKey,
      status: asString(row.status, 'not_started') as SectionCompletionStatus,
      data_json: asString(row.data_json, '{}'),
      updated_at: asString(row.updated_at),
    });
  }
  return result;
}

function parseRawAssetRows(rawRows: unknown[]): Array<RawAssetRow & { client_id: string }> {
  const result: Array<RawAssetRow & { client_id: string }> = [];
  for (const row of rawRows) {
    if (!isRecord(row) || typeof row.client_id !== 'string' || typeof row.category !== 'string') {
      continue;
    }
    result.push({
      client_id: row.client_id,
      category: row.category as AssetCategory,
      created_at: asString(row.created_at),
    });
  }
  return result;
}

/**
 * Batch-hydrates an array of client rows using 4 constant queries instead of 4 * N queries.
 */
export async function hydrateClientRecords(
  db: DbQueryExecutor,
  rows: DbClientRow[],
  requiredSections: OnboardingSectionKey[],
): Promise<ClientRecord[]> {
  if (rows.length === 0) return [];

  const agencyId = rows[0].agency_id;
  const clientIds = rows.map((r) => r.id);
  const placeholders = clientIds.map(() => '?').join(', ');

  const [rawSections, rawAssets, credCounts, allInvites] = await Promise.all([
    db.all(
      `SELECT client_id, section_key, status, data_json, updated_at
       FROM onboarding_sections
       WHERE agency_id = ? AND client_id IN (${placeholders})`,
      agencyId,
      ...clientIds,
    ),
    db.all(
      `SELECT client_id, category, created_at
       FROM assets
       WHERE agency_id = ? AND client_id IN (${placeholders})`,
      agencyId,
      ...clientIds,
    ),
    db.all(
      `SELECT client_id, COUNT(*) as cnt
       FROM credentials
       WHERE agency_id = ? AND client_id IN (${placeholders})
       GROUP BY client_id`,
      agencyId,
      ...clientIds,
    ),
    db.all(
      `SELECT client_id, status, expires_at, created_at
       FROM invitations
       WHERE agency_id = ? AND client_id IN (${placeholders})
       ORDER BY created_at DESC`,
      agencyId,
      ...clientIds,
    ),
  ]);

  const allSections = parseRawSectionRows(rawSections);
  const allAssets = parseRawAssetRows(rawAssets);

  const sectionsByClient = new Map<string, RawSectionRow[]>();
  for (const s of allSections) {
    const list = sectionsByClient.get(s.client_id);
    if (list) list.push(s);
    else sectionsByClient.set(s.client_id, [s]);
  }

  const assetsByClient = new Map<string, RawAssetRow[]>();
  for (const a of allAssets) {
    const list = assetsByClient.get(a.client_id);
    if (list) list.push(a);
    else assetsByClient.set(a.client_id, [a]);
  }

  const credCountByClient = new Map<string, number>();
  for (const c of credCounts) {
    if (isRecord(c) && typeof c.client_id === 'string') {
      credCountByClient.set(c.client_id, typeof c.cnt === 'number' ? c.cnt : Number(c.cnt ?? 0));
    }
  }

  const latestInviteByClient = new Map<string, { status: InvitationStatus; expires_at: string }>();
  for (const inv of allInvites) {
    if (isRecord(inv) && typeof inv.client_id === 'string' && !latestInviteByClient.has(inv.client_id)) {
      latestInviteByClient.set(inv.client_id, {
        status: asString(inv.status, 'pending') as InvitationStatus,
        expires_at: asString(inv.expires_at),
      });
    }
  }

  const nowMs = Date.now();

  return rows.map((row) => {
    const sections = sectionsByClient.get(row.id) || [];
    const assets = assetsByClient.get(row.id) || [];
    const credCount = credCountByClient.get(row.id) || 0;
    const latestInvite = latestInviteByClient.get(row.id);

    let latestInvitationStatus: InvitationStatus | null = latestInvite?.status || null;
    if (
      latestInvite &&
      (latestInvite.status === 'sent' || latestInvite.status === 'pending') &&
      new Date(latestInvite.expires_at).getTime() < nowMs
    ) {
      latestInvitationStatus = 'expired';
    }

    const progress = calculateClientProgress({
      requiredSections,
      sections,
      assets,
      credentialCount: credCount,
      clientUpdatedAt: row.updated_at,
    });

    return {
      id: row.id,
      agencyId: row.agency_id,
      companyName: row.company_name,
      contactName: row.contact_name,
      email: row.email,
      phone: row.phone,
      website: row.website,
      industry: row.industry,
      description: row.description,
      internalNotes: row.internal_notes,
      status: row.status,
      assignedToId: row.assigned_to_id,
      assignedToName: row.assigned_to_name ?? null,
      dueDate: row.due_date,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      progress,
      latestInvitationStatus,
    };
  });
}

export async function hydrateClientRecord(
  db: DbQueryExecutor,
  row: DbClientRow,
  requiredSections: OnboardingSectionKey[],
): Promise<ClientRecord> {
  const hydrated = await hydrateClientRecords(db, [row], requiredSections);
  return hydrated[0];
}
