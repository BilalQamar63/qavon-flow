import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { Pool } from 'pg';
import { serverConfig } from '../config.ts';
import { encryptSecret, hashToken } from '../security/crypto.ts';
import { DEFAULT_SECTION_DATA, ONBOARDING_SECTIONS } from '../../src/constants/onboarding.ts';
import type { OnboardingSectionKey } from '../../src/types/index.ts';

export type DbParam = string | number | boolean | null | undefined;
export type DbDriver = 'postgresql' | 'sqlite';

export interface DbQueryExecutor {
  readonly driver: DbDriver;
  get<T = Record<string, unknown>>(sql: string, ...params: DbParam[]): Promise<T | undefined>;
  all<T = Record<string, unknown>>(sql: string, ...params: DbParam[]): Promise<T[]>;
  run(sql: string, ...params: DbParam[]): Promise<{ changes: number }>;
  exec(sql: string): Promise<void>;
}

export interface AppDatabase extends DbQueryExecutor {
  transaction<T>(fn: (tx: DbQueryExecutor) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

let dbPromise: Promise<AppDatabase> | null = null;
let dbInstance: AppDatabase | null = null;

/**
 * Converts positional SQLite-style `?` placeholders into PostgreSQL `$1, $2, ...`
 * while skipping `?` characters inside `'...'` string literals or SQL comments.
 */
export function convertPlaceholdersToPostgres(sql: string): string {
  let out = '';
  let paramIndex = 0;
  let inSingleQuote = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (inLineComment) {
      out += ch;
      if (ch === '\n') inLineComment = false;
      continue;
    }

    if (inBlockComment) {
      out += ch;
      if (ch === '*' && next === '/') {
        out += '/';
        i += 1;
        inBlockComment = false;
      }
      continue;
    }

    if (inSingleQuote) {
      out += ch;
      if (ch === "'" && next === "'") {
        out += "'";
        i += 1;
      } else if (ch === "'") {
        inSingleQuote = false;
      }
      continue;
    }

    if (ch === '-' && next === '-') {
      inLineComment = true;
      out += '--';
      i += 1;
      continue;
    }

    if (ch === '/' && next === '*') {
      inBlockComment = true;
      out += '/*';
      i += 1;
      continue;
    }

    if (ch === "'") {
      inSingleQuote = true;
      out += ch;
      continue;
    }

    if (ch === '?') {
      paramIndex += 1;
      out += `$${paramIndex}`;
      continue;
    }

    out += ch;
  }

  return out;
}

function normalizeSqlParams(params: DbParam[]): (string | number | boolean | null)[] {
  return params.map((p) => (p === undefined ? null : p));
}

function normalizeSqliteParams(params: DbParam[]): (string | number | null)[] {
  return params.map((p) => {
    if (p === undefined || p === null) return null;
    if (typeof p === 'boolean') return p ? 1 : 0;
    return p;
  });
}

function buildSqliteExecutor(sqlite: DatabaseSync): DbQueryExecutor {
  return {
    driver: 'sqlite',
    async get<T = Record<string, unknown>>(sql: string, ...params: DbParam[]): Promise<T | undefined> {
      return sqlite.prepare(sql).get(...normalizeSqliteParams(params)) as T | undefined;
    },
    async all<T = Record<string, unknown>>(sql: string, ...params: DbParam[]): Promise<T[]> {
      return sqlite.prepare(sql).all(...normalizeSqliteParams(params)) as T[];
    },
    async run(sql: string, ...params: DbParam[]): Promise<{ changes: number }> {
      const res = sqlite.prepare(sql).run(...normalizeSqliteParams(params));
      return { changes: Number(res.changes ?? 0) };
    },
    async exec(sql: string): Promise<void> {
      sqlite.exec(sql);
    },
  };
}

export function wrapSqliteDatabase(sqlite: DatabaseSync): AppDatabase {
  const executor = buildSqliteExecutor(sqlite);
  return {
    ...executor,
    async transaction<T>(fn: (tx: DbQueryExecutor) => Promise<T>): Promise<T> {
      sqlite.exec('BEGIN');
      try {
        const result = await fn(executor);
        sqlite.exec('COMMIT');
        return result;
      } catch (err) {
        try {
          sqlite.exec('ROLLBACK');
        } catch {
          // Ignore rollback failure when already closed
        }
        throw err;
      }
    },
    async close(): Promise<void> {
      sqlite.close();
    },
  };
}

export async function createSqliteAppDatabase(dbPath = ':memory:'): Promise<AppDatabase> {
  if (dbPath !== ':memory:') {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
  const { DatabaseSync } = await import('node:sqlite');
  const sqlite = new DatabaseSync(dbPath);
  sqlite.exec('PRAGMA journal_mode = WAL;');
  sqlite.exec('PRAGMA foreign_keys = ON;');
  return wrapSqliteDatabase(sqlite);
}

interface PgQueryable {
  query(text: string, values?: (string | number | boolean | null)[]): Promise<{
    rows: Record<string, unknown>[];
    rowCount: number | null;
  }>;
}

function buildPostgresExecutor(client: PgQueryable): DbQueryExecutor {
  return {
    driver: 'postgresql',
    async get<T = Record<string, unknown>>(sql: string, ...params: DbParam[]): Promise<T | undefined> {
      const pgSql = convertPlaceholdersToPostgres(sql);
      const res = await client.query(pgSql, normalizeSqlParams(params));
      return (res.rows[0] as T | undefined) ?? undefined;
    },
    async all<T = Record<string, unknown>>(sql: string, ...params: DbParam[]): Promise<T[]> {
      const pgSql = convertPlaceholdersToPostgres(sql);
      const res = await client.query(pgSql, normalizeSqlParams(params));
      return res.rows as T[];
    },
    async run(sql: string, ...params: DbParam[]): Promise<{ changes: number }> {
      const pgSql = convertPlaceholdersToPostgres(sql);
      const res = await client.query(pgSql, normalizeSqlParams(params));
      return { changes: Number(res.rowCount ?? 0) };
    },
    async exec(sql: string): Promise<void> {
      await client.query(sql);
    },
  };
}

function parseNeonConnectionString(rawUrl: string): {
  connectionString: string;
  ssl: { rejectUnauthorized: boolean } | undefined;
} {
  try {
    const parsed = new URL(rawUrl);
    const isLocal =
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === '::1';
    const sslMode = parsed.searchParams.get('sslmode');
    // Remove sslmode & channel_binding from URL so pg Pool handles explicit TLS config cleanly
    parsed.searchParams.delete('sslmode');
    parsed.searchParams.delete('channel_binding');
    const useSsl = sslMode === 'require' || sslMode === 'verify-full' || (!isLocal && sslMode !== 'disable');
    return {
      connectionString: parsed.toString(),
      ssl: useSsl ? { rejectUnauthorized: false } : undefined,
    };
  } catch {
    return {
      connectionString: rawUrl,
      ssl: { rejectUnauthorized: false },
    };
  }
}

async function createPostgresAppDatabase(connectionUrl: string, unpooledUrl?: string): Promise<AppDatabase> {
  const runtimeCfg = parseNeonConnectionString(connectionUrl);
  const pool = new Pool({
    connectionString: runtimeCfg.connectionString,
    ssl: runtimeCfg.ssl,
    max: serverConfig.isVercel ? 5 : 10,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });

  // If unpooled URL is available (e.g. Neon DATABASE_URL_UNPOOLED), use it once for advisory-locked DDL init
  const initUrl = unpooledUrl?.trim() || connectionUrl;
  const initCfg = parseNeonConnectionString(initUrl);
  const initPool =
    initUrl !== connectionUrl
      ? new Pool({
          connectionString: initCfg.connectionString,
          ssl: initCfg.ssl,
          max: 2,
          idleTimeoutMillis: 5_000,
          connectionTimeoutMillis: 10_000,
        })
      : pool;

  const client = await initPool.connect();
  try {
    const initExec = buildPostgresExecutor(client);
    // Coordinate cold-start schema init & initial seed across concurrent serverless instances
    await initExec.exec('SELECT pg_advisory_lock(74829103);');
    try {
      await initSchema(initExec);
      await seedInitialWorkspaceIfEmpty(initExec);
    } finally {
      await initExec.exec('SELECT pg_advisory_unlock(74829103);').catch(() => undefined);
    }
  } finally {
    client.release();
    if (initPool !== pool) {
      await initPool.end().catch(() => undefined);
    }
  }

  const executor = buildPostgresExecutor(pool);
  return {
    ...executor,
    async transaction<T>(fn: (tx: DbQueryExecutor) => Promise<T>): Promise<T> {
      const txClient = await pool.connect();
      const txExecutor = buildPostgresExecutor(txClient);
      try {
        await txClient.query('BEGIN');
        const result = await fn(txExecutor);
        await txClient.query('COMMIT');
        return result;
      } catch (err) {
        await txClient.query('ROLLBACK').catch(() => undefined);
        throw err;
      } finally {
        txClient.release();
      }
    },
    async close(): Promise<void> {
      await pool.end();
    },
  };
}

export async function getDb(customPath?: string): Promise<AppDatabase> {
  if (customPath) {
    const db = await createSqliteAppDatabase(customPath);
    await initSchema(db);
    return db;
  }

  if (dbInstance) {
    return dbInstance;
  }

  if (!dbPromise) {
    dbPromise = (async () => {
      const pgUrl = serverConfig.databaseUrl || serverConfig.databaseUrlUnpooled;
      if (pgUrl) {
        const pgDb = await createPostgresAppDatabase(pgUrl, serverConfig.databaseUrlUnpooled);
        dbInstance = pgDb;
        return pgDb;
      }

      const sqliteDb = await createSqliteAppDatabase(serverConfig.databasePath);
      await initSchema(sqliteDb);
      await seedInitialWorkspaceIfEmpty(sqliteDb);
      dbInstance = sqliteDb;
      return sqliteDb;
    })().catch((err) => {
      dbPromise = null;
      dbInstance = null;
      throw err;
    });
  }

  return dbPromise;
}

export async function resetDbInstanceForTests(): Promise<void> {
  if (dbInstance) {
    await dbInstance.close().catch(() => undefined);
  }
  dbInstance = null;
  dbPromise = null;
}

export async function initSchema(db: DbQueryExecutor): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS agencies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      support_email TEXT NOT NULL,
      website TEXT NOT NULL DEFAULT '',
      primary_color TEXT NOT NULL DEFAULT '#EDA320',
      default_invite_expiry_days INTEGER NOT NULL DEFAULT 14,
      session_duration_hours INTEGER NOT NULL DEFAULT 72,
      notify_on_submission INTEGER NOT NULL DEFAULT 1,
      notify_on_asset_upload INTEGER NOT NULL DEFAULT 1,
      required_sections_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      agency_id TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
      title TEXT NOT NULL DEFAULT 'Team Member',
      session_version INTEGER NOT NULL DEFAULT 1,
      last_active_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_users_agency ON users(agency_id);

    CREATE TABLE IF NOT EXISTS revoked_sessions (
      jti TEXT PRIMARY KEY,
      expires_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_revoked_sessions_exp ON revoked_sessions(expires_at);

    CREATE TABLE IF NOT EXISTS auth_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_auth_tokens_hash ON auth_tokens(token_hash);

    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      agency_id TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
      company_name TEXT NOT NULL,
      contact_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      website TEXT NOT NULL DEFAULT '',
      industry TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      internal_notes TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL CHECK (status IN ('pending', 'in_progress', 'in_review', 'completed', 'overdue', 'archived')),
      assigned_to_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      due_date TEXT,
      session_version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_clients_agency_status ON clients(agency_id, status);
    CREATE INDEX IF NOT EXISTS idx_clients_agency_assignee_status ON clients(agency_id, assigned_to_id, status);
    CREATE INDEX IF NOT EXISTS idx_clients_agency_updated ON clients(agency_id, updated_at DESC);

    CREATE TABLE IF NOT EXISTS invitations (
      id TEXT PRIMARY KEY,
      agency_id TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
      client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'accepted', 'expired', 'revoked')),
      expires_at TEXT NOT NULL,
      sent_at TEXT,
      accepted_at TEXT,
      revoked_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_invitations_client ON invitations(client_id);
    CREATE INDEX IF NOT EXISTS idx_invitations_agency_status ON invitations(agency_id, status);
    CREATE INDEX IF NOT EXISTS idx_invitations_client_created ON invitations(client_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_invitations_hash ON invitations(token_hash);

    CREATE TABLE IF NOT EXISTS onboarding_sections (
      id TEXT PRIMARY KEY,
      agency_id TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
      client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      section_key TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('not_started', 'in_progress', 'completed', 'needs_revision')),
      data_json TEXT NOT NULL,
      reviewer_note TEXT,
      submitted_at TEXT,
      reviewed_at TEXT,
      updated_at TEXT,
      UNIQUE(client_id, section_key)
    );
    CREATE INDEX IF NOT EXISTS idx_sections_client ON onboarding_sections(client_id);

    CREATE TABLE IF NOT EXISTS credentials (
      id TEXT PRIMARY KEY,
      agency_id TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
      client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      service_name TEXT NOT NULL,
      category TEXT NOT NULL CHECK (category IN ('hosting', 'domain', 'cms', 'analytics', 'other')),
      access_type TEXT NOT NULL CHECK (access_type IN ('delegated_invite', 'temporary_token', 'username_password')),
      login_url TEXT NOT NULL DEFAULT '',
      username_encrypted TEXT NOT NULL,
      username_masked TEXT NOT NULL,
      secret_encrypted TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      created_by_role TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_revealed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_credentials_client ON credentials(client_id);

    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      agency_id TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
      client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      storage_key TEXT NOT NULL DEFAULT '',
      cloudinary_public_id TEXT NOT NULL DEFAULT '',
      cloudinary_asset_id TEXT NOT NULL DEFAULT '',
      resource_type TEXT NOT NULL DEFAULT 'raw',
      delivery_type TEXT NOT NULL DEFAULT 'authenticated',
      secure_url TEXT NOT NULL DEFAULT '',
      file_format TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      section_key TEXT,
      uploaded_by_name TEXT NOT NULL,
      uploaded_by_role TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_assets_agency_client ON assets(agency_id, client_id);
    CREATE INDEX IF NOT EXISTS idx_assets_agency_cat ON assets(agency_id, category);
    CREATE INDEX IF NOT EXISTS idx_assets_agency_client_cat ON assets(agency_id, client_id, category);
    CREATE INDEX IF NOT EXISTS idx_assets_client_created ON assets(client_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS pending_asset_deletions (
      id TEXT PRIMARY KEY,
      agency_id TEXT NOT NULL,
      asset_id TEXT NOT NULL,
      cloudinary_public_id TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      delivery_type TEXT NOT NULL DEFAULT 'authenticated',
      attempts INTEGER NOT NULL DEFAULT 1,
      last_error TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_pending_deletions_created ON pending_asset_deletions(created_at ASC);

    CREATE TABLE IF NOT EXISTS activity_logs (
      id TEXT PRIMARY KEY,
      agency_id TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
      client_id TEXT REFERENCES clients(id) ON DELETE CASCADE,
      actor_name TEXT NOT NULL,
      actor_role TEXT NOT NULL,
      action TEXT NOT NULL,
      details TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_activity_agency ON activity_logs(agency_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_activity_client ON activity_logs(client_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      agency_id TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
      client_id TEXT REFERENCES clients(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_notifications_agency ON notifications(agency_id, is_read, created_at DESC);
  `);

  // Safe schema upgrades for existing databases
  if (db.driver === 'postgresql') {
    await db.exec(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE assets ADD COLUMN IF NOT EXISTS cloudinary_public_id TEXT NOT NULL DEFAULT '';
      ALTER TABLE assets ADD COLUMN IF NOT EXISTS cloudinary_asset_id TEXT NOT NULL DEFAULT '';
      ALTER TABLE assets ADD COLUMN IF NOT EXISTS resource_type TEXT NOT NULL DEFAULT 'raw';
      ALTER TABLE assets ADD COLUMN IF NOT EXISTS delivery_type TEXT NOT NULL DEFAULT 'authenticated';
      ALTER TABLE assets ADD COLUMN IF NOT EXISTS secure_url TEXT NOT NULL DEFAULT '';
      ALTER TABLE assets ADD COLUMN IF NOT EXISTS file_format TEXT NOT NULL DEFAULT '';
      ALTER TABLE assets ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
      ALTER TABLE assets ADD COLUMN IF NOT EXISTS section_key TEXT;
      ALTER TABLE assets ADD COLUMN IF NOT EXISTS updated_at TEXT;
    `);
  } else {
    const ensureColumn = async (
      table: 'users' | 'clients' | 'assets',
      column: string,
      definition: string,
    ) => {
      const cols = await db.all<{ name?: string }>(`PRAGMA table_info(${table})`);
      if (!cols.some((c) => c.name === column)) {
        await db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
      }
    };
    await ensureColumn('users', 'session_version', 'INTEGER NOT NULL DEFAULT 1');
    await ensureColumn('clients', 'session_version', 'INTEGER NOT NULL DEFAULT 1');
    await ensureColumn('assets', 'cloudinary_public_id', "TEXT NOT NULL DEFAULT ''");
    await ensureColumn('assets', 'cloudinary_asset_id', "TEXT NOT NULL DEFAULT ''");
    await ensureColumn('assets', 'resource_type', "TEXT NOT NULL DEFAULT 'raw'");
    await ensureColumn('assets', 'delivery_type', "TEXT NOT NULL DEFAULT 'authenticated'");
    await ensureColumn('assets', 'secure_url', "TEXT NOT NULL DEFAULT ''");
    await ensureColumn('assets', 'file_format', "TEXT NOT NULL DEFAULT ''");
    await ensureColumn('assets', 'description', "TEXT NOT NULL DEFAULT ''");
    await ensureColumn('assets', 'section_key', 'TEXT');
    await ensureColumn('assets', 'updated_at', 'TEXT');
  }

  await db.exec('CREATE INDEX IF NOT EXISTS idx_assets_public_id ON assets(cloudinary_public_id);');
}

export async function createDefaultSectionsForClient(
  db: DbQueryExecutor,
  agencyId: string,
  clientId: string,
  companySeed?: {
    companyName?: string;
    contactName?: string;
    email?: string;
    industry?: string;
    website?: string;
    description?: string;
  },
): Promise<void> {
  for (const def of ONBOARDING_SECTIONS) {
    let payload = structuredClone(DEFAULT_SECTION_DATA[def.key]);
    if (def.key === 'company_info' && companySeed) {
      payload = {
        ...DEFAULT_SECTION_DATA.company_info,
        companyName: companySeed.companyName || '',
        contactName: companySeed.contactName || '',
        contactEmail: companySeed.email || '',
        industry: companySeed.industry || '',
        website: companySeed.website || '',
        businessDescription: companySeed.description || '',
      };
    }
    await db.run(
      `INSERT INTO onboarding_sections (id, agency_id, client_id, section_key, status, data_json, updated_at)
       VALUES (?, ?, ?, ?, 'not_started', ?, NULL)
       ON CONFLICT (client_id, section_key) DO NOTHING`,
      crypto.randomUUID(),
      agencyId,
      clientId,
      def.key,
      JSON.stringify(payload),
    );
  }
}

function writeSeedAssetFile(
  driver: DbDriver,
  agencyId: string,
  clientId: string,
  filename: string,
  content: string,
): { storageKey: string; sizeBytes: number } {
  const storageKey = `${agencyId}/${clientId}/${filename}`;
  const sizeBytes = Buffer.byteLength(content, 'utf8');

  if (driver === 'postgresql' || serverConfig.isVercel) {
    return { storageKey, sizeBytes };
  }

  try {
    const fullPath = path.resolve(serverConfig.legacyUploadDir, storageKey);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf8');
  } catch {
    // Gracefully skip disk seed write if running on a read-only filesystem
  }

  return { storageKey, sizeBytes };
}

async function seedInitialWorkspaceIfEmpty(db: DbQueryExecutor): Promise<void> {
  const row = await db.get<{ cnt: number | string }>('SELECT COUNT(*) as cnt FROM agencies');
  if (Number(row?.cnt ?? 0) > 0) return;

  const now = new Date();
  const iso = (daysAgo: number) => new Date(now.getTime() - daysAgo * 86400_000).toISOString();
  const futureIso = (daysAhead: number) => new Date(now.getTime() + daysAhead * 86400_000).toISOString();

  const agencyId = 'agency-studio-amber';
  const requiredSections: OnboardingSectionKey[] = [
    'company_info',
    'brand_assets',
    'website_content',
    'project_requirements',
    'access_credentials',
    'additional_documents',
  ];

  await db.run(
    `INSERT INTO agencies (id, name, support_email, website, primary_color, default_invite_expiry_days, session_duration_hours, notify_on_submission, notify_on_asset_upload, required_sections_json, created_at)
     VALUES (?, ?, ?, ?, ?, 14, 72, 1, 1, ?, ?)
     ON CONFLICT (id) DO NOTHING`,
    agencyId,
    'Studio Amber Digital',
    'onboarding@studioamber.co',
    'https://studioamber.co',
    '#EDA320',
    JSON.stringify(requiredSections),
    iso(30),
  );

  const adminId = 'user-alex-admin';
  const memberId = 'user-maya-member';

  await db.run(
    `INSERT INTO users (id, agency_id, email, name, role, title, last_active_at, created_at)
     VALUES (?, ?, ?, ?, 'admin', ?, ?, ?)
     ON CONFLICT (id) DO NOTHING`,
    adminId,
    agencyId,
    'alex@studioamber.co',
    'Alex Mercer',
    'Managing Partner',
    iso(0),
    iso(30),
  );

  await db.run(
    `INSERT INTO users (id, agency_id, email, name, role, title, last_active_at, created_at)
     VALUES (?, ?, ?, ?, 'member', ?, ?, ?)
     ON CONFLICT (id) DO NOTHING`,
    memberId,
    agencyId,
    'maya@studioamber.co',
    'Maya Lin',
    'Senior Producer',
    iso(1),
    iso(25),
  );

  // Client 1: Completed (Northstar Logistics)
  const c1 = 'client-northstar';
  await db.run(
    `INSERT INTO clients (id, agency_id, company_name, contact_name, email, phone, website, industry, description, internal_notes, status, assigned_to_id, due_date, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?)
     ON CONFLICT (id) DO NOTHING`,
    c1,
    agencyId,
    'Northstar Freight Systems',
    'Elena Vance',
    'elena@northstarfreight.com',
    '+1 (312) 555-0148',
    'https://northstarfreight.com',
    'Supply Chain & Logistics',
    'Midwest cold-chain freight carrier modernizing its shipper portal and corporate website.',
    'All brand assets and DNS access verified. Kickoff scheduled for Tuesday.',
    memberId,
    futureIso(10),
    iso(14),
    iso(1),
  );

  await createDefaultSectionsForClient(db, agencyId, c1);
  const markCompletedSql = `UPDATE onboarding_sections SET status = 'completed', data_json = ?, submitted_at = ?, reviewed_at = ?, updated_at = ? WHERE client_id = ? AND section_key = ?`;

  await db.run(
    markCompletedSql,
    JSON.stringify({
      companyName: 'Northstar Freight Systems',
      businessDescription: 'Midwest cold-chain freight carrier serving pharmaceutical and food distributors.',
      industry: 'Supply Chain & Logistics',
      contactName: 'Elena Vance',
      contactEmail: 'elena@northstarfreight.com',
      contactPhone: '+1 (312) 555-0148',
      website: 'https://northstarfreight.com',
      businessAddress: '450 W Monroe St, Suite 900, Chicago, IL 60606',
      socialLinks: {
        linkedin: 'https://linkedin.com/company/northstar-freight',
        instagram: '',
        twitter: 'https://x.com/northstarfreight',
        facebook: '',
      },
    }),
    iso(5),
    iso(4),
    iso(5),
    c1,
    'company_info',
  );
  await db.run(
    markCompletedSql,
    JSON.stringify({
      brandColors: ['#0F172A', '#EDA320', '#F8F5EE'],
      typographyNotes: 'Primary headings in Plus Jakarta Sans Bold; body copy in DM Sans.',
      designReferences: 'Clean industrial logistics aesthetic with crisp route maps.',
      brandVoiceNotes: 'Authoritative, dependable, transparent.',
    }),
    iso(4),
    iso(3),
    iso(4),
    c1,
    'brand_assets',
  );
  await db.run(
    markCompletedSql,
    JSON.stringify({
      homepageCopy: 'Temperature-controlled freight delivered on schedule across 38 states.',
      aboutCopy: 'Founded in 2014, Northstar operates 140 refrigerated units with live telemetry.',
      servicesCopy: 'Dedicated Refrigerated Lanes · Pharma Cold-Chain · Cross-Dock Warehousing',
      contactPageCopy: 'Dispatch desk operates 24/7 from our Chicago hub.',
      existingWebsiteRefs: 'https://northstarfreight.com/services',
    }),
    iso(3),
    iso(2),
    iso(3),
    c1,
    'website_content',
  );
  await db.run(
    markCompletedSql,
    JSON.stringify({
      projectGoals: 'Increase enterprise RFP inquiries by 35% and simplify lane quote requests.',
      requiredFeatures: 'Interactive service map, instant lane quote calculator, carrier compliance downloads.',
      designPreferences: 'High-contrast typography, light neutral canvas, subtle amber CTAs.',
      functionalRequirements: 'HubSpot CRM webhook integration and SOC-2 compliance page.',
      referenceWebsites: 'https://flexport.com',
      targetDeadline: futureIso(28).slice(0, 10),
      additionalInstructions: 'Keep mobile navigation streamlined for fleet managers on the road.',
    }),
    iso(2),
    iso(1),
    iso(2),
    c1,
    'project_requirements',
  );
  await db.run(
    markCompletedSql,
    JSON.stringify({
      accessMethodPreference: 'delegated_invite',
      delegatedAccessNotes: 'Invited engineering@studioamber.co as Cloudflare DNS Admin.',
      confirmedSecurityReview: true,
    }),
    iso(2),
    iso(1),
    iso(2),
    c1,
    'access_credentials',
  );
  await db.run(
    markCompletedSql,
    JSON.stringify({
      documentNotes: 'Uploaded W-9 and signed Master Services Agreement.',
      noAdditionalDocsNeeded: false,
    }),
    iso(2),
    iso(1),
    iso(2),
    c1,
    'additional_documents',
  );

  // Seed encrypted credential & SVG logo for c1
  await db.run(
    `INSERT INTO credentials (id, agency_id, client_id, service_name, category, access_type, login_url, username_encrypted, username_masked, secret_encrypted, notes, created_by_role, created_at)
     VALUES (?, ?, ?, ?, 'domain', 'delegated_invite', ?, ?, ?, ?, ?, 'client', ?)`,
    crypto.randomUUID(),
    agencyId,
    c1,
    'Cloudflare DNS',
    'https://dash.cloudflare.com',
    encryptSecret('dns-admin@northstarfreight.com'),
    'dn•••@northstarfreight.com',
    encryptSecret('Delegated Admin Invite Token: CF-NORTHSTAR-9821-TEMP'),
    'Invite expires after verification.',
    iso(2),
  );

  const logo1Svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="96" viewBox="0 0 320 96"><rect width="320" height="96" rx="12" fill="#191A1D"/><polygon points="36,24 54,68 42,68 36,52 30,68 18,68" fill="#EDA320"/><text x="72" y="57" font-family="sans-serif" font-size="24" font-weight="700" fill="#FFFFFF">NORTHSTAR</text></svg>`;
  const logo1Desc = writeSeedAssetFile(db.driver, agencyId, c1, 'northstar-primary-logo.svg', logo1Svg);
  await db.run(
    `INSERT INTO assets (id, agency_id, client_id, category, original_name, mime_type, size_bytes, storage_key, resource_type, file_format, description, section_key, uploaded_by_name, uploaded_by_role, created_at, updated_at)
     VALUES (?, ?, ?, 'primary_logo', 'northstar-primary-logo.svg', 'image/svg+xml', ?, ?, 'image', 'svg', 'Sample seeded brand mark — replace or upload via Cloudinary', 'brand_assets', 'Elena Vance', 'client', ?, ?)`,
    crypto.randomUUID(),
    agencyId,
    c1,
    logo1Desc.sizeBytes,
    logo1Desc.storageKey,
    iso(4),
    iso(4),
  );

  await db.run(
    `INSERT INTO invitations (id, agency_id, client_id, email, token_hash, status, expires_at, sent_at, accepted_at, created_at)
     VALUES (?, ?, ?, 'elena@northstarfreight.com', ?, 'accepted', ?, ?, ?, ?)`,
    crypto.randomUUID(),
    agencyId,
    c1,
    hashToken('seed-northstar-used'),
    futureIso(14),
    iso(14),
    iso(13),
    iso(14),
  );

  // Client 2: In Progress (Lumen Botanicals)
  const c2 = 'client-lumen';
  await db.run(
    `INSERT INTO clients (id, agency_id, company_name, contact_name, email, phone, website, industry, description, internal_notes, status, assigned_to_id, due_date, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'in_progress', ?, ?, ?, ?)
     ON CONFLICT (id) DO NOTHING`,
    c2,
    agencyId,
    'Lumen Botanicals',
    'Marcus Thorne',
    'marcus@lumenbotanicals.co',
    '+1 (415) 555-0192',
    'https://lumenbotanicals.co',
    'Skincare & E-Commerce',
    'Direct-to-consumer botanical skincare brand preparing a Shopify headless storefront.',
    'Waiting on homepage copy and hosting credentials.',
    adminId,
    futureIso(6),
    iso(7),
    iso(1),
  );
  await createDefaultSectionsForClient(db, agencyId, c2);
  await db.run(
    `UPDATE onboarding_sections SET status = 'completed', data_json = ?, submitted_at = ?, updated_at = ? WHERE client_id = ? AND section_key = 'company_info'`,
    JSON.stringify({
      companyName: 'Lumen Botanicals',
      businessDescription: 'Small-batch organic skincare formulated with cold-pressed desert botanicals.',
      industry: 'Skincare & E-Commerce',
      contactName: 'Marcus Thorne',
      contactEmail: 'marcus@lumenbotanicals.co',
      contactPhone: '+1 (415) 555-0192',
      website: 'https://lumenbotanicals.co',
      businessAddress: '712 Valencia St, San Francisco, CA 94110',
      socialLinks: {
        linkedin: '',
        instagram: 'https://instagram.com/lumenbotanicals',
        twitter: '',
        facebook: '',
      },
    }),
    iso(5),
    iso(5),
    c2,
  );
  await db.run(
    `UPDATE onboarding_sections SET status = 'in_progress', data_json = ?, updated_at = ? WHERE client_id = ? AND section_key = 'brand_assets'`,
    JSON.stringify({
      brandColors: ['#191A1D', '#D97706', '#F8F5EE'],
      typographyNotes: 'Editorial serif display headings paired with warm humanist sans.',
      designReferences: 'Aesop, Crown Affair',
      brandVoiceNotes: 'Calm, restorative, grounded in clinical botanical science.',
    }),
    iso(2),
    c2,
  );
  const logo2Svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="96" viewBox="0 0 320 96"><rect width="320" height="96" rx="12" fill="#FAF7F0" stroke="#E5E0D5"/><circle cx="46" cy="48" r="18" fill="#EDA320"/><text x="80" y="56" font-family="serif" font-size="26" font-weight="600" fill="#191A1D">Lumen Botanicals</text></svg>`;
  const logo2Desc = writeSeedAssetFile(db.driver, agencyId, c2, 'lumen-wordmark.svg', logo2Svg);
  await db.run(
    `INSERT INTO assets (id, agency_id, client_id, category, original_name, mime_type, size_bytes, storage_key, resource_type, file_format, description, section_key, uploaded_by_name, uploaded_by_role, created_at, updated_at)
     VALUES (?, ?, ?, 'primary_logo', 'lumen-wordmark.svg', 'image/svg+xml', ?, ?, 'image', 'svg', 'Sample seeded wordmark — replace or upload via Cloudinary', 'brand_assets', 'Marcus Thorne', 'client', ?, ?)`,
    crypto.randomUUID(),
    agencyId,
    c2,
    logo2Desc.sizeBytes,
    logo2Desc.storageKey,
    iso(3),
    iso(3),
  );

  await db.run(
    `INSERT INTO invitations (id, agency_id, client_id, email, token_hash, status, expires_at, sent_at, accepted_at, created_at)
     VALUES (?, ?, ?, 'marcus@lumenbotanicals.co', ?, 'accepted', ?, ?, ?, ?)`,
    crypto.randomUUID(),
    agencyId,
    c2,
    hashToken('seed-lumen-used'),
    futureIso(10),
    iso(7),
    iso(6),
    iso(7),
  );

  // Client 3: Overdue (Kestrel Architecture)
  const c3 = 'client-kestrel';
  await db.run(
    `INSERT INTO clients (id, agency_id, company_name, contact_name, email, phone, website, industry, description, internal_notes, status, assigned_to_id, due_date, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'overdue', ?, ?, ?, ?)
     ON CONFLICT (id) DO NOTHING`,
    c3,
    agencyId,
    'Kestrel Architecture Studio',
    'Sora Takahashi',
    'sora@kestrelarch.com',
    '+1 (206) 555-0174',
    'https://kestrelarch.com',
    'Architecture & Design',
    'Commercial timber-frame architecture practice launching a new portfolio and RFP hub.',
    'Follow up needed on project photography and brand guidelines.',
    memberId,
    iso(2),
    iso(18),
    iso(4),
  );
  await createDefaultSectionsForClient(db, agencyId, c3, {
    companyName: 'Kestrel Architecture Studio',
    contactName: 'Sora Takahashi',
    email: 'sora@kestrelarch.com',
    industry: 'Architecture & Design',
    website: 'https://kestrelarch.com',
    description: 'Sustainable mass-timber architecture studio based in Seattle.',
  });
  await db.run(
    `INSERT INTO invitations (id, agency_id, client_id, email, token_hash, status, expires_at, sent_at, created_at)
     VALUES (?, ?, ?, 'sora@kestrelarch.com', ?, 'sent', ?, ?, ?)`,
    crypto.randomUUID(),
    agencyId,
    c3,
    hashToken('seed-kestrel-pending'),
    futureIso(5),
    iso(12),
    iso(12),
  );

  // Client 4: Pending (Verve Advisory)
  const c4 = 'client-verve';
  await db.run(
    `INSERT INTO clients (id, agency_id, company_name, contact_name, email, phone, website, industry, description, internal_notes, status, assigned_to_id, due_date, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)
     ON CONFLICT (id) DO NOTHING`,
    c4,
    agencyId,
    'Verve Financial Advisory',
    'David Okafor',
    'david@verveadvisory.io',
    '+1 (646) 555-0133',
    'https://verveadvisory.io',
    'B2B FinTech & Advisory',
    'Fractional CFO & compliance advisory launching a client onboarding refresh.',
    'New client added; send portal invitation link.',
    adminId,
    futureIso(14),
    iso(1),
    iso(1),
  );
  await createDefaultSectionsForClient(db, agencyId, c4, {
    companyName: 'Verve Financial Advisory',
    contactName: 'David Okafor',
    email: 'david@verveadvisory.io',
    industry: 'B2B FinTech & Advisory',
    website: 'https://verveadvisory.io',
    description: 'Fractional CFO and financial modeling partner for Series A startups.',
  });

  // Activity Logs & Notifications
  const insertLogSql = `INSERT INTO activity_logs (id, agency_id, client_id, actor_name, actor_role, action, details, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
  await db.run(insertLogSql, crypto.randomUUID(), agencyId, c1, 'Alex Mercer', 'admin', 'Section Approved', 'Approved Access & Credentials for Northstar Freight Systems', iso(1));
  await db.run(insertLogSql, crypto.randomUUID(), agencyId, c2, 'Marcus Thorne', 'client', 'Asset Uploaded', 'Uploaded lumen-wordmark.svg to Brand Assets', iso(3));
  await db.run(insertLogSql, crypto.randomUUID(), agencyId, c2, 'Marcus Thorne', 'client', 'Section Submitted', 'Completed Company Information section', iso(5));
  await db.run(insertLogSql, crypto.randomUUID(), agencyId, c4, 'Alex Mercer', 'admin', 'Client Created', 'Created workspace for Verve Financial Advisory', iso(1));

  const insertNotifSql = `INSERT INTO notifications (id, agency_id, client_id, title, message, is_read, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`;
  await db.run(insertNotifSql, crypto.randomUUID(), agencyId, c2, 'New Brand Asset Uploaded', 'Marcus Thorne uploaded lumen-wordmark.svg for Lumen Botanicals.', 0, iso(3));
  await db.run(insertNotifSql, crypto.randomUUID(), agencyId, c3, 'Onboarding Past Due', 'Kestrel Architecture Studio is 2 days past its target onboarding deadline.', 0, iso(1));
  await db.run(insertNotifSql, crypto.randomUUID(), agencyId, c1, 'Onboarding Completed', 'Northstar Freight Systems completed all 6 onboarding sections.', 1, iso(1));
}
