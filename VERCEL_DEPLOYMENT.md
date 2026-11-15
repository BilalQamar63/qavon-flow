# QavonFlow — Vercel + Neon + Brevo + Cloudinary Deployment Guide

QavonFlow (by **Qavon Digital**) is fully configured to deploy on **Vercel's free Hobby tier** with:
- **Database**: **Neon PostgreSQL** (`DATABASE_URL` + `DATABASE_URL_UNPOOLED`) with automatic schema creation, concurrency advisory locks, and automatic demo workspace seeding on first boot. (Falls back automatically to SQLite locally when `DATABASE_URL` is unset.)
- **Outbound Email**: **Brevo SMTP** via live **Nodemailer** transport (`SMTP_HOST=smtp-relay.brevo.com`, `SMTP_PORT=587`) — works completely free with any verified Gmail/personal email address without needing to buy a custom domain.
- **File Storage**: **Cloudinary** (`type: 'authenticated'`) with signed inline previews and downloads.
- **Vercel Serverless Routing**: `vercel.json` serves the Vite SPA (`dist/`) from Vercel's global CDN and routes `/api/*` requests to `api/index.ts` -> cached Express app (`getApp()` in `server.ts`).

> **Vercel Hobby File Upload Note**: Vercel Serverless Functions enforce a **4.5 MB request body limit** per HTTP invocation. Keep uploaded brand logos, images, and PDFs under ~4 MB when uploading through `/api/assets/upload` on Vercel Hobby.

---

## 1. Environment Variables to Paste into Vercel

Open your **Vercel Project -> Settings -> Environment Variables** and add these variables for **Production** (and **Preview** if desired). Never prefix any secret with `VITE_` or `NEXT_PUBLIC_`.

| Variable Name | Value / Where to Copy From | Notes |
| :--- | :--- | :--- |
| `DATABASE_URL` | **Neon Dashboard -> Connect -> Pooled connection string** | Uses Neon pooler for serverless runtime queries |
| `DATABASE_URL_UNPOOLED` | **Neon Dashboard -> Connect -> Direct connection string** | Used cleanly for startup DDL / `pg_advisory_lock` |
| `AUTH_SECRET` | Generate locally (`64` hex chars) | Signs `hub_session` cookies & download tokens |
| `ENCRYPTION_KEY` | Generate locally (`64` hex chars, different from `AUTH_SECRET`) | AES-256-GCM key for Credential Vault (never rotate casually) |
| `CLOUDINARY_CLOUD_NAME` | **Cloudinary Console -> Dashboard** | Server-side media storage |
| `CLOUDINARY_API_KEY` | **Cloudinary Console -> API Keys** | Server-side media storage |
| `CLOUDINARY_API_SECRET` | **Cloudinary Console -> API Keys (Reveal)** | Server-side secret only |
| `SMTP_HOST` | `smtp-relay.brevo.com` | From Brevo -> SMTP & API -> SMTP |
| `SMTP_PORT` | `587` | Standard STARTTLS port |
| `SMTP_USER` | Your **Brevo SMTP Login** (e.g. `xxxxxxx@smtp-brevo.com`) | From Brevo -> SMTP & API -> SMTP |
| `SMTP_PASS` | Your generated **Brevo SMTP Key** (`xsmtpsib-...`) | Created under Brevo -> SMTP Keys |
| `EMAIL_FROM` | `QavonFlow <your-verified-sender@gmail.com>` | Must match a verified sender in Brevo -> Senders |
| `APP_URL` | Your exact Vercel URL, e.g. `https://qavonflow.vercel.app` | No trailing slash! Must match browser origin |
| `NODE_ENV` | `production` | Enables strict CSP and Secure HTTPS cookies |
| `FORCE_INSECURE_COOKIE` | `false` | Always `false` over HTTPS |
| `MAX_UPLOAD_MB` | `4` (recommended on Vercel Hobby) or `15` | Matches Vercel 4.5 MB serverless body cap cleanly |

### Generate `AUTH_SECRET` and `ENCRYPTION_KEY` Locally
Run in your terminal (each command produces a separate 64-character hex secret):
```bash
node -e "console.log('AUTH_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('hex'))"
```

---

## 2. Step-by-Step Free Vercel Deployment

1. **Push your repository to GitHub / GitLab / Bitbucket**.
2. Go to [vercel.com](https://vercel.com) -> **Add New -> Project** and import your repository.
3. Keep the defaults detected from `vercel.json`:
   - **Framework Preset**: `Vite` (or `Other` — `vercel.json` overrides build & routing)
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. Open **Environment Variables**, paste every variable from the table above (skip `APP_URL` until step 6 if you don't know the final `.vercel.app` domain yet), and click **Deploy**.
5. Once the first deploy finishes, copy your assigned URL (e.g. `https://your-project.vercel.app`).
6. Go to **Project Settings -> Environment Variables**, add/update `APP_URL=https://your-project.vercel.app` (no trailing slash), and click **Deployments -> Redeploy** so the serverless function picks up the updated environment.

---

## 3. Post-Deploy Verification & Troubleshooting

1. **Health Endpoint** (verifies live Neon PostgreSQL connection):
   ```bash
   curl -i https://your-project.vercel.app/api/health
   # Expected: HTTP 200 {"ok":true,"database":"postgresql"}
   ```
2. **Infrastructure Status in UI**:
   - Sign in as Agency Admin (`alex@studioamber.co` for demo workspace, or register a new agency) -> navigate to **Settings** -> inspect **Security & Infrastructure Status**:
     - `Credential Encryption`: `AES-256-GCM`
     - `Explicit ENCRYPTION_KEY Env`: `Configured`
     - `SMTP Mail Transport`: `Configured`
     - `Database Engine`: `postgresql (Neon)`
     - `File Storage Driver`: `cloudinary`
     - `Cloudinary Credentials`: `Configured`
3. **End-to-End Email & Asset Check**:
   - Request a magic link on the login screen -> confirm it arrives in the recipient's inbox via Brevo.
   - Upload a test PNG/PDF (< 4 MB) -> verify `201`, inline preview, attachment download, metadata edit (`PATCH`), replacement (`PUT`), and deletion (`DELETE`).

### Common Errors & Fixes
| Symptom | Root Cause | Fix |
| :--- | :--- | :--- |
| `503 {"ok":false,"error":"Database unavailable"}` | Invalid or unreachable `DATABASE_URL` | Copy fresh pooled & unpooled URLs from Neon Console and redeploy |
| `403 Cross-origin state-changing request rejected` | `APP_URL` mismatch with browser domain | Set `APP_URL` to exact `https://...` origin (no trailing slash) and redeploy |
| Magic link arrives or fails to send | Brevo sender not verified or wrong SMTP login/key | Verify sender address under Brevo -> Senders & Domains, use SMTP Login (`@smtp-brevo.com`) as `SMTP_USER` and SMTP Key as `SMTP_PASS` |
| `413` on file upload on Vercel | Exceeded Vercel Hobby 4.5 MB serverless body limit | Upload files under 4 MB or compress PDF/images |
| `503 Cloudinary storage is not configured` | Missing one or more `CLOUDINARY_*` env vars | Add all 3 `CLOUDINARY_*` variables and redeploy |
| Session drops on page reload | Missing `AUTH_SECRET` across serverless containers | Set explicit 64-hex `AUTH_SECRET` in Vercel Environment Variables |
