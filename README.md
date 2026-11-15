# QavonFlow

### Client onboarding, without the chaos.

QavonFlow is a **Client Onboarding & Asset Management Platform** developed by **Qavon Digital**. It provides agencies, freelancers, consultants, and service businesses with one centralized workspace to collect project requirements, organize client files and brand assets, store encrypted service credentials, and track onboarding progress.

**A Qavon Digital Product** — *Collect. Organize. Start Creating.*

---

## 1. Introduction

Signing a new client is supposed to kick off productive design and engineering work. Instead, agencies routinely lose days or weeks chasing logos, style guides, domain access, page copy, and project goals across email chains, Slack messages, and shared drive links.

**QavonFlow** gives service teams one repeatable system to onboard every client cleanly. Agencies create scoped client workspaces, send expiring passwordless portal links, track live completion percentages, review submitted modules, and store client files and credentials inside a single multi-tenant web application.

---

## 2. Project Overview

QavonFlow is a full-stack TypeScript web application built around two distinct, role-isolated product surfaces:

- **Agency Operations Console**: Designed for managing partners, producers, and delivery teams to oversee active onboardings, inspect completion analytics, review client submissions, manage team assignments, and retrieve files or decrypted service access.
- **External Client Portal**: A focused, distraction-free workspace accessed via an expiring invitation link where clients see exactly what is required, save partial drafts at their own pace, upload categorized files, enter encrypted service credentials, and track progress toward kickoff.

---

## 3. Why This Software Was Created

Most agencies invest heavily in project management tools for *internal delivery* (Linear, Jira, Asana) and CRM systems for *sales* (HubSpot, Pipedrive), yet the handoff between closing a deal and starting execution—**client onboarding**—remains manual and fragmented.

This software was created to treat client onboarding as a structured, auditable product workflow rather than an inbox chore. Every missing requirement, asset slot, draft submission, revision request, and sensitive credential lives in one predictable place tied directly to the client record.

---

## 4. The Real-World Business Problem

When agencies onboard clients without a dedicated portal, the same operational bottlenecks repeat on every engagement:

1. **Endless Back-and-Forth Follow-Ups**: Account managers spend hours emailing clients to ask what is still missing because neither side has a shared checklist of completed vs. outstanding items.
2. **Disorganized & Unusable Brand Assets**: Primary logos, monochrome marks, favicons, brand guidelines PDFs, and hero photos arrive scattered across email replies, ZIP attachments, and expiring transfer links—often in the wrong format or without clear categorization.
3. **Incomplete Website Copy & Scope Gaps**: Crucial messaging, service descriptions, functional requirements, and target launch dates arrive late or half-finished, delaying designers and developers.
4. **Insecure Credential Sharing**: Hosting logins, registrar credentials, CMS passwords, and API tokens are frequently pasted in plaintext inside emails or chat channels with no encryption at rest and no audit log of who accessed them.
5. **No Executive Visibility**: Agency leadership cannot easily see across all clients which onboardings are on track, awaiting agency review, or overdue.

---

## 5. Our Solution

QavonFlow solves these problems through four integrated mechanisms:

- **Structured Six-Module Onboarding Checklist**: Standardizes collection into *Company Information*, *Brand Assets*, *Website Content*, *Project Requirements*, *Access & Credentials*, and *Additional Documents*, with per-agency customization of which modules are required.
- **Expiring, Scoped Client Invitations**: Generates cryptographically random, SHA-256 hashed invitation links with configurable expiration, one-click resend, and instant revocation that invalidates active client portal sessions.
- **Categorized Asset Library with Signed Cloudinary Storage**: Validates file MIME types, extensions, magic bytes, and active SVG scripts on upload, stores assets securely in **Cloudinary** (`type: 'authenticated'`), and serves previews/downloads only via 5-minute HMAC-signed access tokens and signed Cloudinary URLs.
- **Dynamic Progress & Missing-Item Tracking**: Automatically computes each client's completion percentage from fulfilled required fields, uploaded logo requirements, credential coverage, and completed modules—surfacing the exact remaining items to both the client and the agency team.

---

## 6. Target Users

- **Digital & Creative Agencies** managing concurrent website, branding, and product retainers.
- **Web Development & Software Consultancies** collecting specs, DNS/hosting access, and staging credentials before sprint zero.
- **Brand Identity & Design Studios** gathering vector logos, color palettes, typography notes, and moodboards.
- **Independent Consultants & Studio Producers** looking for a repeatable, client-facing portal experience without bloated enterprise project suites.

---

## 7. Core Features

- **Agency Dashboard & Analytics**: Live SQL-backed KPIs (total clients, active onboardings, completed onboardings, pending & overdue requests), per-module completion bar breakdown, status distribution donut chart, pending requirement queue, recent asset uploads, and activity feed.
- **Client Lifecycle Management**: Create, edit, search, filter by status (`pending`, `in_progress`, `in_review`, `completed`, `overdue`, `archived`), assign producers, set target due dates, archive, or permanently delete workspaces.
- **Client Portal Invitations**: Issue expiring magic portal links (3, 7, 14, or 30 days—configurable), view invitation history, resend fresh links, or revoke access at any time.
- **Guided Onboarding Workspace**: Step-by-step navigation across six sections with draft saving (`Save Draft`), server-validated formal submission (`Submit Section`), hex color palette builder, and section-level agency review (`Approve Section` / `Request Changes` with feedback notes).
- **AES-256-GCM Encrypted Credential Vault**: Stores hosting, domain, CMS, analytics, and third-party access entries encrypted at rest; encourages delegated collaborator invites and temporary tokens; masks usernames in standard reads; logs every decryption event.
- **Centralized Asset Library**: Table and card-grid views with client/category/search filters, sorting, upload progress bar, inline image/PDF preview dialog, metadata editing (`PATCH`), atomic file replacement (`PUT`), signed attachment downloads, and Cloudinary deletion controls.
- **Team & Role-Based Access Control**: Invite team members as `admin` or `member`, update roles (automatically invalidating prior session tokens), and scope `member` access strictly to assigned client workspaces.
- **Notifications & Audit Trail**: Unread notification inbox for section submissions and asset uploads alongside a chronological workspace activity log.

---

## 8. Application Workflow

```text
1. Agency Setup & Client Creation
   └─► Admin creates a client workspace, sets a due date, and assigns a producer.

2. Secure Invitation Dispatch
   └─► Agency generates an expiring SHA-256 hashed portal link (?portalToken=...).

3. Client Portal Onboarding
   ├─► Client opens the link → authenticated as scoped role: "client"
   ├─► Saves drafts across 6 structured modules & resumes anytime
   ├─► Uploads brand logos, website media, and contracts (validated & stored privately)
   └─► Submits encrypted DNS/CMS/hosting access in the Credential Vault

4. Completion & Agency Review
   ├─► Once all required modules & assets reach 100%, client moves to "in_review"
   ├─► Agency producer/admin inspects assets, copy, and credentials
   └─► Approves sections ("completed" → portal locks read-only) or requests revisions

5. Project Kickoff Ready
   └─► Team has verified assets, structured brief, and audited access in one place.
```

---

## 9. Agency Administrator Experience

Agency administrators (`admin`) and assigned team members (`member`) operate inside the full Agency Shell (`Sidebar` + `Topbar`):

- **Overview**: Immediate executive snapshot of pipeline health, completion bottlenecks per onboarding module, overdue clients, and latest file uploads.
- **Clients Directory**: Filterable table across all lifecycle states (`All Active`, `Pending`, `In Progress`, `In Review`, `Completed`, `Overdue`, `Archived`) with quick actions to open the workspace, manage invitations, edit details, or archive/delete.
- **Onboarding Workspace (Staff Mode)**: View and edit any module, inspect `Client Profile & Notes` (including private `internalNotes` hidden from clients), audit client-specific activity history, and sign off on submitted sections.
- **Team & Workspace Settings** *(admin write access, member read-only)*: Manage staff accounts and roles, customize agency branding details, configure default invitation expiration and session lifetime, toggle submission/upload notifications, choose required onboarding sections, and inspect live security posture (`AES-256-GCM`, key configuration, storage driver, SMTP status).

---

## 10. Client Portal Experience

When a client opens their invitation link, they enter a stripped-down, high-clarity portal (`ClientPortalShell`) completely isolated from internal agency navigation, other clients, and private agency notes:

- **Clear Orientation**: A dark-surface welcome banner explains the three-step onboarding flow alongside a live progress summary card showing exact remaining required fields and missing asset uploads.
- **Self-Paced Progress & Resume**: Clients can save partial work as drafts at any time (`in_progress`) and return later without losing form inputs or uploaded files.
- **Immediate Validation & Feedback**: Attempting to submit an incomplete required module highlights the exact missing fields or asset slots (such as a required Primary Logo) inline and blocks incomplete submission.
- **Read-Only Sign-Off Lock**: Once the agency approves all required sections and marks the workspace `completed`, the portal displays an approved banner and locks forms, uploads, and credentials against accidental post-sign-off edits (enforced both in UI and with `403` server checks).

---

## 11. Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | React 19, TypeScript, Material UI (`@mui/material` v9), Redux Toolkit + RTK Query, Lucide Icons, Tailwind CSS v4 |
| **Backend** | Node.js (22+), Express 4 (`tsx`), `cookie-parser`, `multer` (in-memory multipart buffering for byte-level inspection) |
| **Cloud Storage** | Cloudinary (`cloudinary` v2 Node SDK) with authenticated delivery, organized agency/client folders, and signed URLs |
| **Database** | **Neon PostgreSQL (`pg`)** in production/Vercel (`DATABASE_URL`), with automatic **SQLite (`node:sqlite`)** fallback locally |
| **Email** | **Nodemailer** SMTP relay (`Brevo` free SMTP or any SMTP provider) with graceful preview-link fallback when unconfigured |
| **Validation** | Centralized Zod v4 schemas shared between frontend and backend (`src/schemas/validation.ts`) |
| **Security & Crypto** | Node.js `node:crypto` (AES-256-GCM, SHA-256 token hashing, HMAC-SHA256 signed cookies & URLs, `timingSafeEqual`) |
| **Deployment** | Ready for **Vercel** (`vercel.json` + `api/index.ts`), Railway, Render, or Node.js container |
| **Build & Testing** | Vite 8, Vitest 5, TypeScript (`tsc --noEmit`) |

---

## 12. Architecture Overview

The application runs as a unified full-stack TypeScript service (`server.ts`):

- **Development Mode**: Express handles `/api/*` endpoints and mounts `vite.middlewares` in SPA middleware mode on port `3000`.
- **Production Mode**: Express serves the pre-built `dist/` bundle alongside `/api/*` APIs.
- **State & Caching**: The React frontend uses Redux Toolkit (`uiSlice`) for workspace navigation/filters and RTK Query (`hubApi`) for normalized API caching, tag invalidation (`Session`, `Dashboard`, `Clients`, `Onboarding`, `Assets`, etc.), and automatic `401` session expiration handling (`baseQueryWithSessionGuard`).
- **Modular Backend Boundaries**: Routes (`server/routes/*`) delegate auth/tenant checks to `server/middleware/auth.ts`, progress math to `server/services/progress.ts`, batch client hydration to `server/services/clientHydrator.ts`, file signature checks to `server/services/fileValidation.ts`, centralized cloud storage to `server/services/cloudinary/*`, and audit/notifications to `server/services/audit.ts`.

---

## 13. Project Folder Structure

```text
├── api/
│   └── index.ts                         # Vercel Serverless Function entrypoint delegating /api/* to cached Express app
├── server.ts                            # Express app factory (getApp/createApp), security headers, CSRF origin check
├── server/
│   ├── config.ts                        # Env config, Vercel/origin resolution, read-only FS fallback, SMTP & DB getters
│   ├── config/
│   │   └── cloudinary.ts                # Server-only Cloudinary v2 client initialization & typed asset contracts
│   ├── db/
│   │   └── database.ts                  # Async dual-dialect adapter (Neon PostgreSQL `pg` + SQLite), advisory locks & seed
│   ├── middleware/
│   │   └── auth.ts                      # Signed HTTP-only cookies, JTI revocation, RBAC, client scope enforcement
│   ├── routes/
│   │   ├── assets.ts                    # Full Asset CRUD (POST/GET/PATCH/PUT/DELETE) backed by Cloudinary & validation
│   │   ├── auth.ts                      # Magic-link request/verify, agency registration, session & logout
│   │   ├── clients.ts                   # Client CRUD, search/status filtering, archive & permanent delete
│   │   ├── dashboard.ts                 # Live SQL-computed dashboard KPIs, charts, and pending requirements
│   │   ├── invitations.ts               # Client portal invite issue, resend, revoke, and token acceptance
│   │   ├── notifications.ts             # Notification inbox & chronological activity log endpoints
│   │   ├── onboarding.ts                # Workspace fetch, section save/review, AES-256-GCM credential endpoints
│   │   └── settings.ts                  # Agency profile/template settings and team RBAC management
│   ├── security/
│   │   ├── crypto.ts                    # AES-256-GCM encrypt/decrypt, HMAC payload signing, SHA-256 token hashing
│   │   └── rateLimit.ts                 # Sliding-window in-memory rate limiter for auth, invites & credential reveals
│   └── services/
│       ├── audit.ts                     # Activity log, notification creator, and structured security event logs
│       ├── clientHydrator.ts            # Batch client progress & invitation status hydration (avoids N+1 queries)
│       ├── cloudinary/
│       │   ├── delete.service.ts        # Cloudinary resource destruction & pending deletion retry queue
│       │   ├── migration.service.ts     # Migrates legacy local uploads to Cloudinary safely
│       │   ├── replace.service.ts       # Atomic replacement (upload new -> commit DB -> delete old)
│       │   ├── retrieve.service.ts      # Expiring signed Cloudinary preview & authenticated download URLs
│       │   └── upload.service.ts        # Folder organization, resource_type detection & stream upload
│       ├── email.ts                     # EmailProvider interface & honest SMTP configuration detection
│       ├── fileValidation.ts            # MIME allowlist, extension mapping, magic-byte & SVG XSS inspection
│       └── progress.ts                  # Dynamic section, field, asset slot & credential completion calculator
├── public/
│   ├── qavonflow-icon.svg               # Minimalist geometric vector favicon & icon mark
│   └── qavonflow-logo.svg               # Horizontal QavonFlow by Qavon Digital SVG lockup
├── src/
│   ├── App.tsx                          # Auth/portal session router, lazy-loaded pages, token callback handler
│   ├── main.tsx                         # React root, Redux Provider, MUI ThemeProvider & Snackbar host
│   ├── index.css                        # Tailwind CSS v4 & font base setup
│   ├── components/
│   │   ├── common/                      # BrandLogo, FileUploader, FilePreviewDialog, ProgressIndicator, StatusBadge, etc.
│   │   ├── layout/                      # AgencyShell, ClientPortalShell, Sidebar, Topbar
│   │   └── notifications/               # NotificationMenu popover
│   ├── constants/
│   │   ├── branding.ts                  # Centralized QavonFlow & Qavon Digital brand identity tokens
│   │   └── onboarding.ts                # Six onboarding module definitions, asset categories & safe JSON parser
│   ├── features/
│   │   ├── activity/                    # ActivityPage
│   │   ├── assets/                      # AssetsPage (table/grid library)
│   │   ├── auth/                        # AuthView (magic-link sign-in & agency registration)
│   │   ├── clients/                     # ClientsPage, ClientFormDialog, InviteClientDialog
│   │   ├── dashboard/                   # OverviewPage (KPIs, donut chart, module analytics)
│   │   ├── onboarding/                  # OnboardingWorkspaceView, CredentialVaultPanel, SectionAssetsList
│   │   ├── settings/                    # SettingsPage
│   │   └── team/                        # TeamPage
│   ├── hooks/
│   │   └── useDebouncedValue.ts         # Search debouncing hook
│   ├── schemas/
│   │   └── validation.ts                # Shared Zod schemas & safe URL scheme validation
│   ├── store/
│   │   ├── index.ts                     # Redux store configuration
│   │   ├── hooks.ts                     # Typed useAppDispatch & useAppSelector
│   │   ├── api/hubApi.ts                # RTK Query endpoints + 401 session expiration guard
│   │   └── slices/uiSlice.ts            # Navigation, filters & toast state
│   ├── theme/                           # MUI palette, typography, spacing, shadows & component overrides
│   ├── types/
│   │   └── index.ts                     # Shared TypeScript interfaces & domain enums
│   └── utils/
│       ├── apiError.ts                  # API error extraction & safe download helper
│       └── format.ts                    # Date & byte formatting utilities
├── tests/
│   ├── e2eWorkflows.test.ts             # 16 real HTTP end-to-end tests across all workflows
│   └── securityAndProgress.test.ts      # 14 unit/integration tests for crypto, progress, validation & hydration
├── .env.example
├── .gitignore
├── index.html
├── metadata.json
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## 14. Database Architecture

Data is persisted through an async dual-dialect database layer (`server/db/database.ts`): **Neon PostgreSQL** (`pg` `Pool` with `pg_advisory_lock` schema initialization when `DATABASE_URL` is configured) or **SQLite** (`node:sqlite` WAL mode + foreign keys) locally.

| Table | Purpose & Key Columns |
| :--- | :--- |
| `agencies` | Tenant root: name, support email, branding color, invite expiry & session duration defaults, notification toggles, `required_sections_json`. |
| `users` | Agency staff (`admin`, `member`), scoped to `agency_id`, tracking `session_version` for immediate session invalidation on role changes. |
| `auth_tokens` | SHA-256 hashed single-use agency magic-link tokens (`token_hash`, `expires_at`, `used_at`). |
| `revoked_sessions` | Revoked JWT IDs (`jti`, `expires_at`) populated on logout. |
| `clients` | Client workspaces scoped by `agency_id` with `assigned_to_id`, `status`, `due_date`, `internal_notes`, and `session_version`. |
| `invitations` | SHA-256 hashed client portal invitations (`status`: `pending`, `sent`, `accepted`, `expired`, `revoked`). |
| `onboarding_sections` | Per-client section JSON payloads (`data_json`), status, `reviewer_note`, and submission/review timestamps. |
| `credentials` | AES-256-GCM encrypted `username_encrypted` & `secret_encrypted`, masked display preview, and `last_revealed_at`. |
| `assets` | File & Cloudinary metadata (`category`, `mime_type`, `size_bytes`, `cloudinary_public_id`, `cloudinary_asset_id`, `resource_type`, `delivery_type`, `secure_url`, `file_format`, `description`, `section_key`, `updated_at`) scoped by `agency_id` and `client_id`. |
| `pending_asset_deletions` | Safe retry queue for Cloudinary asset cleanup if an external API delete temporarily fails. |
| `activity_logs` | Immutable chronological audit log of agency and client actions. |
| `notifications` | Agency notification feed items with `is_read` state. |

---

## 15. Authentication Architecture

Authentication is completely passwordless and role-scoped:

1. **Agency Staff Sign-In (`/api/auth/request-magic-link` & `/api/auth/verify`)**:
   - Generates a 32-byte `crypto.randomBytes` token, stores only its SHA-256 hash (`auth_tokens`), and sets a 15-minute expiry.
   - Single-use verification atomically sets `used_at` (`WHERE id = ? AND used_at IS NULL`) to block token replay attacks.
   - Unknown emails receive a uniform generic response to prevent account enumeration.
   - New agencies can self-register via `/api/auth/register-agency`.
   - *Live Email & Fallback*: When `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, and `EMAIL_FROM` are configured (such as **Brevo SMTP**), `/api/auth/request-magic-link` dispatches live email via Nodemailer. When SMTP is not configured locally, it returns `emailDelivery.delivered: false` alongside a non-production `previewMagicUrl`.
2. **Client Portal Access (`/api/invitations` & `/api/invitations/accept`)**:
   - Invitations use the same 32-byte random + SHA-256 storage pattern, honor expiration timestamps, enforce single acceptance, and support revocation (which also increments `clients.session_version` to drop active client sessions).
3. **Signed HTTP-Only Session Cookies (`hub_session`)**:
   - HMAC-SHA256 signed payload containing `jti`, `sv` (session version), `userId`, `agencyId`, `role`, and `clientId`.
   - Verified with `crypto.timingSafeEqual` on every request; checked against `revoked_sessions` and live `session_version` in SQLite.

---

## 16. Security Implementation

- **Encryption at Rest (`server/security/crypto.ts`)**: Both credential usernames and secret values are encrypted with **AES-256-GCM** using a 32-byte key and a fresh 12-byte random IV per write (`iv.authTag.ciphertext`). Standard workspace `GET` responses never return ciphertext or plaintext—only masked usernames. Decryption (`POST .../reveal`) is restricted to `admin` or the assigned `member`, rate-limited, and audited in `activity_logs`.
- **Multi-Tenant & Client Isolation (`server/middleware/auth.ts`)**: All queries filter by `agency_id`. External `client` sessions are strictly locked to their `client_id`, denied agency endpoints (`403`), and stripped of `internalNotes`. Agency `member` accounts can only access clients assigned to them (`assigned_to_id`).
- **Hardened File Uploads & Downloads (`server/routes/assets.ts`, `server/services/fileValidation.ts`, `server/services/cloudinary/*`)**:
  - Allowlisted MIME types (`png`, `jpeg`, `webp`, `svg`, `pdf`, `doc`, `docx`, `txt/md/csv`, `zip`, `mp4`) matched against extensions and verified against file **magic bytes**.
  - SVG uploads are scanned to reject active XSS vectors (`<script>`, `on*` event attributes, `<foreignObject>`, `<iframe>`, `javascript:`/`data:text/html`).
  - Files are streamed directly into **Cloudinary** (`type: 'authenticated'`, foldered under `client-onboarding/<agencyId>/<clientId>/...`), with automatic rollback if database persistence fails.
  - Downloads and inline previews require a **5-minute HMAC-signed token** bound to `assetId`, `agencyId`, and `clientId`, resolved to expiring signed Cloudinary URLs and served with `X-Content-Type-Options: nosniff` and `Content-Security-Policy: sandbox` on inline renders.
- **CSRF, Headers & Rate Limiting (`server.ts`, `server/security/rateLimit.ts`)**:
  - `Origin` header validation blocks cross-origin state-changing requests (`403`).
  - Sets `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy`, and `Cache-Control: no-store` on API responses.
  - Sliding-window rate limiting protects magic-link requests, verification, invitations, and credential reveals.

---

## 17. Screenshots

No screenshot image files of the running application are currently committed to this repository (none are fabricated or staged).

To inspect the live UI locally—including the seeded **Studio Amber Digital** demo workspace (`alex@studioamber.co`), sample clients, asset previews, and the client portal flow—follow the **Installation & Local Development** steps below and open `http://localhost:3000`.

---

## 18. Installation & Local Development

### Prerequisites

- **Node.js 22+** (required for built-in `node:sqlite`)
- **npm 10+**

### Local Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```
2. **Create your environment file**:
   ```bash
   cp .env.example .env
   ```
   For production deployments, generate real 64-hex-character values for `AUTH_SECRET` and `ENCRYPTION_KEY`. In local development, omitting them auto-generates and persists local keys in `data/.local-keys.json`.
3. **Start the full-stack development server**:
   ```bash
   npm run dev
   ```
   The Express API and Vite frontend start together on `http://localhost:3000`.
   On first launch, SQLite initializes `./data/hub.db` and seeds a demo agency (**Studio Amber Digital**) with sample clients and assets so you can sign in immediately as `alex@studioamber.co` (admin) or `maya@studioamber.co` (member) using the generated preview magic link.
4. **Build and run in production mode**:
   ```bash
   npm run build
   npm start
   ```

---

## 19. Environment Variables

For complete per-variable explanations, obtaining instructions, and deployment guides, see [`ENV_SETUP.md`](./ENV_SETUP.md), [`ENVIRONMENT_CHECKLIST.md`](./ENVIRONMENT_CHECKLIST.md), and [`VERCEL_DEPLOYMENT.md`](./VERCEL_DEPLOYMENT.md).

All environment variables below correspond directly to `server/config.ts`, `server/config/cloudinary.ts`, and `server/middleware/auth.ts`:

| Variable | Required | Default | Description |
| :--- | :--- | :--- | :--- |
| `DATABASE_URL` | **Mandatory on Vercel** | Empty | Neon PostgreSQL pooled connection string (`DATABASE_URL_UNPOOLED` recommended for schema init). |
| `CLOUDINARY_CLOUD_NAME` | **Mandatory for Assets** | Empty | Cloudinary Cloud Name (`Settings -> API Keys`). |
| `CLOUDINARY_API_KEY` | **Mandatory for Assets** | Empty | Cloudinary API Key (`Settings -> API Keys`). |
| `CLOUDINARY_API_SECRET` | **Mandatory for Assets** | Empty | Cloudinary API Secret (**server-only**; never expose in frontend). |
| `AUTH_SECRET` | **Mandatory in Prod** | Auto-persisted dev key | Secret (>= 32 chars) used to sign session cookies and 5-minute asset tokens. |
| `ENCRYPTION_KEY` | **Mandatory in Prod** | Auto-persisted dev key | 64-hex-char (32-byte) key for AES-256-GCM credential encryption. |
| `APP_URL` | Recommended | `http://localhost:3000` | Base URL used for origin checks, magic links, and portal invitation links. |
| `PORT` | Optional | `3000` | HTTP port Express listens on. |
| `DATABASE_PATH` | Local SQLite Only | `./data/hub.db` | File path for SQLite when `DATABASE_URL` is not set. |
| `MAX_UPLOAD_MB` | Optional | `15` | Maximum upload size per file in MB (`4` recommended on Vercel Hobby due to 4.5 MB body limit). |
| `LEGACY_UPLOAD_DIR` | Migration Only | `./data/uploads` | Legacy local folder scanned by `npm run migrate:cloudinary`. |
| `FORCE_INSECURE_COOKIE` | Optional | `false` | Set `true` only when testing `NODE_ENV=production` over plain HTTP on `localhost`. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` | Recommended in Prod | Empty | Live Nodemailer SMTP configuration (e.g., `smtp-relay.brevo.com`, port `587`). |

---

## 20. Available Scripts

| Script | Command | Description |
| :--- | :--- | :--- |
| `npm run dev` | `tsx server.ts` | Starts the Express API + Vite dev middleware on port `3000`. |
| `npm run build` | `vite build` | Bundles the production React client into `dist/`. |
| `npm start` | `NODE_ENV=production tsx server.ts` | Serves the production `dist/` bundle and `/api/*` routes. |
| `npm run preview` | `vite preview` | Previews the static `dist/` Vite output without the Express backend. |
| `npm run lint` | `tsc --noEmit` | Runs full TypeScript type checking across client and server code. |
| `npm run typecheck` | `tsc --noEmit` | Alias for strict TypeScript checking. |
| `npm test` | `vitest run` | Executes all automated unit, Cloudinary orchestration, and HTTP E2E test suites. |
| `npm run test:watch` | `vitest` | Runs Vitest in interactive watch mode. |
| `npm run migrate:cloudinary` | `tsx server/services/cloudinary/migration.service.ts` | Migrates legacy local uploads in `./data/uploads` to Cloudinary and deletes local files after DB commit. |
| `npm run clean` | `rm -rf dist` | Removes the compiled frontend `dist/` directory. |
| `npm run clean:data` | `rm -rf data` | Resets local SQLite database, legacy uploads, and local dev keys. |

---

## 21. Testing

Automated verification is implemented with **Vitest** across three suites:

- **`tests/securityAndProgress.test.ts`**: AES-256-GCM encryption/tamper rejection, username masking, SHA-256 token hashing, HMAC expiry/tamper checks, dynamic onboarding completion calculation (`0%` -> `100%`), tenant isolation, file signature/SVG XSS filtering, and batch client hydration.
- **`tests/cloudinaryStorage.test.ts`**: Missing `CLOUDINARY_*` config detection (`CloudinaryConfigError` without leaking secrets), folder & `resource_type` mapping, signed URL generation, atomic asset replacement & DB rollback safety, deletion retry queue, and legacy-to-Cloudinary migration.
- **`tests/e2eWorkflows.test.ts`**: Spins up `createApp()` against an isolated temporary SQLite database to exercise real HTTP workflows end-to-end—magic-link login & replay protection, logout revocation, expired/revoked invitations, client CRUD/search/filtering/archiving, member permissions, draft saving & resumption, `503` missing-Cloudinary guard, full Asset CRUD (`POST`, `GET`, `PATCH`, `PUT`, `DELETE`), section approvals, completed-portal lock (`403`), `/api/health`, and dashboard analytics.

Run checks locally:

```bash
npm test
npm run typecheck
npm run build
```

*(Note: Live network upload/destroy tests against `api.cloudinary.com` require active `CLOUDINARY_*` credentials in `.env`; the automated test suite uses isolated `cloudinary.uploader` spies for offline deterministic CI execution.)*

---

## 22. Future Improvements

- **Direct Client-to-Cloudinary Signed Uploads**: Optionally issue short-lived signed browser upload signatures for files exceeding Vercel's 4.5 MB serverless body limit while keeping server validation.
- **Multiple Onboarding Templates**: Allow agencies to define distinct required-section templates per service line (e.g., *Brand Identity*, *Webflow Build*, *SEO Retainer*).
- **Automated Browser & Lint Tooling**: Add ESLint configuration and Playwright browser tests for multi-viewport visual verification.

---

## 23. License

No open-source license file (`LICENSE`) is currently included in this repository. All rights remain reserved by the repository owner unless a license is explicitly added.
