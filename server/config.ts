import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

interface LocalSecrets {
  authSecret: string;
  encryptionKeyHex: string;
}

const isVercel = process.env.VERCEL === '1' || Boolean(process.env.VERCEL_URL);
const DATA_DIR = isVercel
  ? path.join(os.tmpdir(), 'qavonflow-data')
  : path.resolve(process.cwd(), 'data');
const SECRETS_FILE = path.join(DATA_DIR, '.local-keys.json');

let memoryFallbackSecrets: LocalSecrets | null = null;

function loadOrCreateLocalSecrets(): LocalSecrets {
  if (memoryFallbackSecrets) {
    return memoryFallbackSecrets;
  }

  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(SECRETS_FILE)) {
      const raw = fs.readFileSync(SECRETS_FILE, 'utf8');
      const parsed = JSON.parse(raw) as LocalSecrets;
      if (parsed.authSecret && parsed.encryptionKeyHex) {
        return parsed;
      }
    }
    const generated: LocalSecrets = {
      authSecret: crypto.randomBytes(32).toString('hex'),
      encryptionKeyHex: crypto.randomBytes(32).toString('hex'),
    };
    fs.writeFileSync(SECRETS_FILE, JSON.stringify(generated, null, 2), { mode: 0o600 });
    return generated;
  } catch {
    memoryFallbackSecrets = {
      authSecret: crypto.randomBytes(32).toString('hex'),
      encryptionKeyHex: crypto.randomBytes(32).toString('hex'),
    };
    return memoryFallbackSecrets;
  }
}

function resolveEncryptionKey(): Buffer {
  const envKey = process.env.ENCRYPTION_KEY?.trim();
  if (envKey && /^[0-9a-fA-F]{64}$/.test(envKey)) {
    return Buffer.from(envKey, 'hex');
  }
  if (envKey && envKey.length >= 32) {
    return crypto.createHash('sha256').update(envKey).digest();
  }
  const local = loadOrCreateLocalSecrets();
  return Buffer.from(local.encryptionKeyHex, 'hex');
}

function resolveAuthSecret(): string {
  const envSecret = process.env.AUTH_SECRET?.trim();
  if (envSecret && envSecret.length >= 32) {
    return envSecret;
  }
  return loadOrCreateLocalSecrets().authSecret;
}

const isProduction = process.env.NODE_ENV === 'production';
const rawAppUrl =
  process.env.APP_URL?.trim() ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL.trim()}` : 'http://localhost:3000');
const appUrl = rawAppUrl.replace(/\/$/, '');
const hasExplicitAuthSecret = Boolean(
  process.env.AUTH_SECRET?.trim() && process.env.AUTH_SECRET.trim().length >= 32,
);
const hasExplicitEncryptionKey = Boolean(process.env.ENCRYPTION_KEY?.trim());

export interface EnvironmentValidationReport {
  isProduction: boolean;
  isVercel: boolean;
  databaseDriver: 'postgresql' | 'sqlite';
  hasExplicitAuthSecret: boolean;
  hasExplicitEncryptionKey: boolean;
  cloudinaryConfigured: boolean;
  smtpConfigured: boolean;
  missingCloudinary: string[];
  warnings: string[];
}

export function validateEnvironmentConfig(): EnvironmentValidationReport {
  const missingCloudinary: string[] = [];
  if (!process.env.CLOUDINARY_CLOUD_NAME?.trim()) missingCloudinary.push('CLOUDINARY_CLOUD_NAME');
  if (!process.env.CLOUDINARY_API_KEY?.trim()) missingCloudinary.push('CLOUDINARY_API_KEY');
  if (!process.env.CLOUDINARY_API_SECRET?.trim()) missingCloudinary.push('CLOUDINARY_API_SECRET');

  const databaseDriver: 'postgresql' | 'sqlite' =
    process.env.DATABASE_URL?.trim() || process.env.DATABASE_URL_UNPOOLED?.trim()
      ? 'postgresql'
      : 'sqlite';

  const smtpConfigured = Boolean(
    process.env.SMTP_HOST?.trim() &&
      process.env.SMTP_USER?.trim() &&
      process.env.SMTP_PASS?.trim() &&
      process.env.EMAIL_FROM?.trim(),
  );

  const warnings: string[] = [];
  if (isProduction && (!hasExplicitAuthSecret || !hasExplicitEncryptionKey)) {
    warnings.push(
      '[ENV WARNING] Explicit AUTH_SECRET (>=32 chars) and/or ENCRYPTION_KEY env vars are not set in production; sessions and encrypted credentials will not persist across cold starts until configured.',
    );
  }
  if (isVercel && databaseDriver !== 'postgresql') {
    warnings.push(
      '[ENV WARNING] Running on Vercel without DATABASE_URL (Neon PostgreSQL). Falling back to ephemeral /tmp SQLite which does not persist across serverless invocations.',
    );
  }
  if (missingCloudinary.length > 0) {
    warnings.push(
      `[ENV WARNING] Cloudinary file storage is incomplete. Missing: ${missingCloudinary.join(', ')}. Asset upload/replace/download endpoints will return HTTP 503 until configured.`,
    );
  }

  return {
    isProduction,
    isVercel,
    databaseDriver,
    hasExplicitAuthSecret,
    hasExplicitEncryptionKey,
    cloudinaryConfigured: missingCloudinary.length === 0,
    smtpConfigured,
    missingCloudinary,
    warnings,
  };
}

if (process.env.NODE_ENV !== 'test') {
  const report = validateEnvironmentConfig();
  for (const warning of report.warnings) {
    console.warn(warning);
  }
}

export function resolveSafeAppOrigin(requestOrigin?: string, requestHost?: string): string {
  const configuredOrigin = (() => {
    try {
      return new URL(appUrl).origin;
    } catch {
      return 'http://localhost:3000';
    }
  })();

  if (!requestOrigin) return configuredOrigin;

  try {
    const parsed = new URL(requestOrigin);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return configuredOrigin;
    }
    if (parsed.origin === configuredOrigin) {
      return parsed.origin;
    }
    if (requestHost && parsed.host === requestHost && (!isProduction || parsed.protocol === 'https:')) {
      return parsed.origin;
    }
    if (!isProduction && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')) {
      return parsed.origin;
    }
  } catch {
    return configuredOrigin;
  }

  return configuredOrigin;
}

export const serverConfig = {
  port: Number(process.env.PORT || 3000),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction,
  isVercel,
  appUrl,
  get databaseUrl(): string {
    return process.env.DATABASE_URL?.trim() || '';
  },
  get databaseUrlUnpooled(): string {
    return process.env.DATABASE_URL_UNPOOLED?.trim() || '';
  },
  get databaseDriver(): 'postgresql' | 'sqlite' {
    return process.env.DATABASE_URL?.trim() || process.env.DATABASE_URL_UNPOOLED?.trim()
      ? 'postgresql'
      : 'sqlite';
  },
  databasePath: isVercel && !process.env.DATABASE_PATH
    ? path.join(os.tmpdir(), 'qavonflow-hub.db')
    : path.resolve(process.cwd(), process.env.DATABASE_PATH || './data/hub.db'),
  /** Legacy local disk directory used strictly for migrating pre-Cloudinary files. */
  legacyUploadDir: path.resolve(
    process.cwd(),
    process.env.LEGACY_UPLOAD_DIR || process.env.UPLOAD_DIR || './data/uploads',
  ),
  maxUploadBytes: Number(process.env.MAX_UPLOAD_MB || 15) * 1024 * 1024,
  authSecret: resolveAuthSecret(),
  encryptionKey: resolveEncryptionKey(),
  hasExplicitAuthSecret,
  hasExplicitEncryptionKey,
  cloudinary: {
    get cloudName(): string {
      return process.env.CLOUDINARY_CLOUD_NAME?.trim() || '';
    },
    get apiKey(): string {
      return process.env.CLOUDINARY_API_KEY?.trim() || '';
    },
    get apiSecret(): string {
      return process.env.CLOUDINARY_API_SECRET?.trim() || '';
    },
  },
  smtp: {
    get host(): string {
      return process.env.SMTP_HOST?.trim() || '';
    },
    get port(): number {
      const parsed = Number(process.env.SMTP_PORT || 587);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 587;
    },
    get user(): string {
      return process.env.SMTP_USER?.trim() || '';
    },
    get pass(): string {
      return process.env.SMTP_PASS?.trim() || '';
    },
    get from(): string {
      return process.env.EMAIL_FROM?.trim() || 'onboarding@localhost';
    },
  },
};

