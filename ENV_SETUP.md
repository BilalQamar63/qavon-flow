# QavonFlow — Environment Variable Audit & Setup Guide

**QavonFlow** (by **Qavon Digital**) uses a unified Node.js + Express + Vite + React + TypeScript architecture (`server.ts` + `api/index.ts` for Vercel) with dual-dialect persistence: **Neon PostgreSQL (`pg`)** when `DATABASE_URL` is configured, and **SQLite (`node:sqlite`)** automatically when running locally without `DATABASE_URL`. Outbound email uses **Nodemailer** over **Brevo SMTP** (or any standard SMTP relay). Every environment variable below was verified directly from source code (`server/config.ts`, `server/config/cloudinary.ts`, `server/db/database.ts`, `server/middleware/auth.ts`, `server/services/email.ts`, `vite.config.ts`).

> **Important Security Rule**: There are **zero** client-side public environment variables (`VITE_*` or `NEXT_PUBLIC_*`) in `src/`. Every secret (`DATABASE_URL`, `AUTH_SECRET`, `ENCRYPTION_KEY`, `CLOUDINARY_API_SECRET`, `SMTP_PASS`) stays strictly server-side and is never embedded in the frontend Vite bundle.

---

## Complete Environment Variable Inventory

| Variable | Category | Required? | Where Used | Client or Server |
| :--- | :--- | :--- | :--- | :--- |
| `DATABASE_URL` | Database (Neon) | **Mandatory on Vercel** (SQLite fallback locally) | `server/config.ts`, `server/db/database.ts` | Server only |
| `DATABASE_URL_UNPOOLED` | Database (Neon) | Recommended with Neon (DDL/schema init) | `server/config.ts`, `server/db/database.ts` | Server only |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary Storage | **Mandatory** (for asset uploads/downloads) | `server/config.ts`, `server/config/cloudinary.ts` | Server only |
| `CLOUDINARY_API_KEY` | Cloudinary Storage | **Mandatory** (for asset uploads/downloads) | `server/config.ts`, `server/config/cloudinary.ts` | Server only |
| `CLOUDINARY_API_SECRET` | Cloudinary Storage | **Mandatory** (for asset uploads/downloads) | `server/config.ts`, `server/config/cloudinary.ts` | Server only |
| `AUTH_SECRET` | Authentication | **Mandatory in Prod** (auto-dev fallback) | `server/config.ts`, `server/security/crypto.ts` | Server only |
| `ENCRYPTION_KEY` | Security & Encryption | **Mandatory in Prod** (auto-dev fallback) | `server/config.ts`, `server/security/crypto.ts` | Server only |
| `APP_URL` | Application | Recommended (`VERCEL_URL` / `http://localhost:3000` fallback) | `server/config.ts` | Server only |
| `DATABASE_PATH` | Database (Local SQLite) | Optional (`./data/hub.db` or `/tmp/qavonflow-hub.db` on Vercel) | `server/config.ts`, `server/db/database.ts` | Server only |
| `PORT` | Application | Optional (`3000` default) | `server/config.ts`, `server.ts` | Server only |
| `NODE_ENV` | Application | Optional (`development` default) | `server/config.ts`, `server.ts`, `server/middleware/auth.ts` | Server only |
| `MAX_UPLOAD_MB` | Cloudinary Storage | Optional (`15` default; Vercel platform cap 4.5 MB) | `server/config.ts`, `server/routes/assets.ts` | Server only |
| `LEGACY_UPLOAD_DIR` | Migration Only | Optional (`./data/uploads` default) | `server/config.ts`, `server/services/cloudinary/migration.service.ts` | Server only |
| `FORCE_INSECURE_COOKIE` | Security | Optional (`false` default) | `server/middleware/auth.ts` | Server only |
| `SMTP_HOST` | Email (Brevo SMTP) | Recommended (`smtp-relay.brevo.com`) | `server/config.ts`, `server/services/email.ts` | Server only |
| `SMTP_PORT` | Email (Brevo SMTP) | Optional (`587` default) | `server/config.ts`, `server/services/email.ts` | Server only |
| `SMTP_USER` | Email (Brevo SMTP) | Recommended (Brevo SMTP Login) | `server/config.ts`, `server/services/email.ts` | Server only |
| `SMTP_PASS` | Email (Brevo SMTP) | Recommended (Brevo SMTP Key) | `server/config.ts`, `server/services/email.ts` | Server only |
| `EMAIL_FROM` | Email (Brevo SMTP) | Recommended (Verified sender address) | `server/config.ts`, `server/services/email.ts` | Server only |
| `DISABLE_HMR` | Dev Tooling | Optional | `vite.config.ts` | Dev server only |

---

## Detailed Per-Variable Reference

### 1. Cloudinary Centralized Storage Variables

#### `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
- **Purpose**: Authenticates the Node.js `cloudinary` SDK so client-uploaded logos, guidelines, media, and documents are stored in Cloudinary (`type: 'authenticated'`) and accessed via expiring signed URLs.
- **Required?**: Mandatory for all asset upload (`POST`), replacement (`PUT`), download/preview (`GET`), and cloud deletion (`DELETE`) operations. If missing, asset routes cleanly fail with HTTP `503` without leaking credentials.
- **Used in**: `server/config.ts`, `server/config/cloudinary.ts`, `server/services/cloudinary/*.ts`
- **Exposure**: **Server-only** (never returned to React or client bundles).
- **How to obtain**:
  1. Sign in or create a free/paid account at [cloudinary.com](https://cloudinary.com).
  2. Open **Programmable Media** -> **Dashboard** (or **Settings -> API Keys**).
  3. Copy your **Cloud Name** (`CLOUDINARY_CLOUD_NAME`).
  4. Click **API Keys** -> copy **API Key** (`CLOUDINARY_API_KEY`).
  5. Click the eye icon / **Reveal** next to **API Secret** -> copy **API Secret** (`CLOUDINARY_API_SECRET`).
  6. Never reuse demo keys in production and rotate keys immediately if exposed.
- **Default**: None (empty string when unset; `isCloudinaryConfigured()` returns `false`).
- **Missing/Incorrect Behavior**: Server logs `[ENV WARNING]` on boot; `POST /api/assets/upload`, `PUT /api/assets/:id`, and `GET /api/assets/:id/download` return `503`. Incorrect values cause signed URL generation or Cloudinary API uploads to reject with `502`.

---

### 2. Authentication & Security Keys

#### `AUTH_SECRET`
- **Purpose**: HMAC-SHA256 signing secret for HTTP-only `hub_session` cookies and 5-minute `dlToken` asset download tokens.
- **Required?**: **Mandatory in Production**; optional in local development (auto-generates and persists a random 32-byte key into `data/.local-keys.json`).
- **Used in**: `server/config.ts`, `server/security/crypto.ts`
- **Exposure**: **Server-only**.
- **How to generate**:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- **Format**: High-entropy string with **at least 32 characters** (64 hex chars recommended).
- **Missing/Incorrect Behavior**: If omitted or shorter than 32 characters in production, logs `[ENV WARNING]` and falls back to `data/.local-keys.json` (which does not survive ephemeral container restarts and breaks multi-instance session validation).

#### `ENCRYPTION_KEY`
- **Purpose**: Master key for **AES-256-GCM** authenticated encryption (`iv.authTag.ciphertext`) of client credential usernames and secrets in the `credentials` SQLite table.
- **Required?**: **Mandatory in Production**; optional in local development (auto-persisted in `data/.local-keys.json`).
- **Used in**: `server/config.ts`, `server/security/crypto.ts`
- **Exposure**: **Server-only**.
- **How to generate**:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- **Format**: Exactly **64 hexadecimal characters** (32 raw bytes). Strings >= 32 characters that are not 64 hex chars are SHA-256 hashed into a 32-byte key.
- **Missing/Incorrect Behavior**: Rotating or losing this key renders previously encrypted Credential Vault records undecryptable until re-encrypted.

#### `FORCE_INSECURE_COOKIE`
- **Purpose**: Allows setting `hub_session` without the `Secure` attribute **only** when running `NODE_ENV=production` locally over plain `http://localhost`.
- **Required?**: Optional (`false` default).
- **Used in**: `server/middleware/auth.ts`
- **Exposure**: **Server-only**.
- **Missing/Incorrect Behavior**: Must remain `"false"` (or unset) behind HTTPS in production; setting `"true"` in production allows cookies over unencrypted HTTP.

---

### 3. Database & Upload Limits

#### `DATABASE_URL` & `DATABASE_URL_UNPOOLED` (Neon PostgreSQL)
- **Purpose**: Connects QavonFlow to a hosted **Neon PostgreSQL** database (`pg` Pool) when set. On startup, `createPostgresAppDatabase()` uses `DATABASE_URL_UNPOOLED` (or `DATABASE_URL` if unpooled is omitted) with `pg_advisory_lock` to create tables, indexes, and initial workspace data safely across concurrent Vercel cold starts.
- **Required?**: **Mandatory on Vercel / Production**; optional in local development (falls back automatically to SQLite when unset).
- **Used in**: `server/config.ts`, `server/db/database.ts`
- **Exposure**: **Server-only**.
- **How to obtain**: In **Neon Dashboard -> Connect -> Connection string**, copy both the **Pooled connection** string (`DATABASE_URL`) and the **Direct / Unpooled connection** string (`DATABASE_URL_UNPOOLED`).

#### `DATABASE_PATH` (Local SQLite Fallback)
- **Purpose**: Filesystem path where SQLite persists tables locally when `DATABASE_URL` is not configured. Ignored when `DATABASE_URL` is set.
- **Required?**: Optional.
- **Used in**: `server/config.ts`, `server/db/database.ts`
- **Exposure**: **Server-only**.
- **Default**: `./data/hub.db` (or `/tmp/qavonflow-hub.db` on Vercel)
- **Missing/Incorrect Behavior**: Parent directories are created automatically. An unwriteable path or read-only filesystem rejects during `getDb()` initialization.

#### `MAX_UPLOAD_MB`
- **Purpose**: Maximum single-file upload limit enforced by Multer (`memoryStorage`) on `POST /api/assets/upload` and `PUT /api/assets/:id`.
- **Required?**: Optional.
- **Used in**: `server/config.ts`, `server/routes/assets.ts`
- **Exposure**: **Server-only**.
- **Default**: `15` (15 MB).
- **Missing/Incorrect Behavior**: Exceeding the configured limit returns HTTP `413 Payload Too Large`.

#### `LEGACY_UPLOAD_DIR` (or fallback `UPLOAD_DIR`)
- **Purpose**: Path to legacy pre-Cloudinary local uploads scanned ONLY by `npm run migrate:cloudinary` (`server/services/cloudinary/migration.service.ts`). Active uploads never write to disk.
- **Required?**: Optional.
- **Used in**: `server/config.ts`, `server/db/database.ts` (demo SVG seed), `server/services/cloudinary/migration.service.ts`.
- **Default**: `./data/uploads`.

---

### 4. Application Runtime & Origin

#### `APP_URL`
- **Purpose**: Public base URL of the deployment (e.g., `https://hub.youragency.com`), used for strict `Origin` header CSRF checks and generating magic-link / invitation URLs.
- **Required?**: Recommended in all deployments; mandatory when behind custom domains/proxies.
- **Used in**: `server/config.ts`, `server.ts`, `server/routes/auth.ts`, `server/routes/invitations.ts`
- **Exposure**: **Server-only**.
- **Default**: `http://localhost:3000`
- **Missing/Incorrect Behavior**: State-changing requests from an unexpected `Origin` may be rejected (`403`) or magic-link preview URLs will point to `localhost:3000`.

#### `PORT` & `NODE_ENV`
- **Purpose**: Controls HTTP bind port (`PORT`, default `3000`) and Express/security mode (`NODE_ENV`: `development`, `production`, or `test`).
- **Used in**: `server.ts`, `server/config.ts`, `server/middleware/auth.ts`.

---

### 5. Email / Brevo SMTP Configuration

#### `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`
- **Purpose**: Live outbound mail delivery via **Nodemailer** (`server/services/email.ts`) for agency magic-link sign-in emails and client portal invitation emails.
- **Required?**: Recommended in production (optional locally — omits live sending and shows preview links in development).
- **Used in**: `server/config.ts`, `server/services/email.ts`
- **How to obtain (Free via Brevo — No Custom Domain Required)**:
  1. Sign in to **Brevo** -> **Senders, Domains & IPs -> Senders** and add/verify your sender email address (e.g., your Gmail address).
  2. Open **SMTP & API -> SMTP** -> copy **SMTP Server** (`smtp-relay.brevo.com`), **Port** (`587`), and **Login** (`SMTP_USER`).
  3. Generate an **SMTP Key** and paste it as `SMTP_PASS`.
  4. Set `EMAIL_FROM` to `QavonFlow <your-verified-sender@gmail.com>`.
- **Behavior**: When `SMTP_HOST`, `SMTP_USER`, and `SMTP_PASS` are configured, `NodemailerSmtpProvider` sends emails automatically over TLS/STARTTLS (`secure: port === 465`). When omitted locally, `emailProvider.isConfigured()` returns `false` and the API returns `previewMagicUrl` / `portalPreviewUrl` cleanly for manual testing.

---

## Quick Local Setup Steps

```bash
# 1. Install dependencies
npm install

# 2. Copy template and populate Cloudinary + secrets
cp .env.example .env

# 3. Generate strong 64-hex keys for AUTH_SECRET and ENCRYPTION_KEY
node -e "console.log('AUTH_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('hex'))"

# 4. Start full-stack dev server on http://localhost:3000
npm run dev

# 5. (Optional) Migrate existing seeded/legacy files in ./data/uploads to Cloudinary
npm run migrate:cloudinary
```
