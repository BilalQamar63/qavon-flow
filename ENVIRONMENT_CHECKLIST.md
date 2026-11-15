# QavonFlow — Environment & Infrastructure Readiness Checklist

Use this checklist before local testing, staging previews, or production launches on **Vercel + Neon + Brevo + Cloudinary** for **QavonFlow** (by **Qavon Digital**).

---

## 1. Secret & Key Generation
- [ ] Generated a unique 64-hex-character `AUTH_SECRET` (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
- [ ] Generated a unique 64-hex-character `ENCRYPTION_KEY` (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
- [ ] Confirmed `AUTH_SECRET` and `ENCRYPTION_KEY` are **different** cryptographic values.
- [ ] Backed up `ENCRYPTION_KEY` securely in a password manager / secret vault (losing it makes encrypted Credential Vault entries unrecoverable).

## 2. Neon PostgreSQL Setup
- [ ] Provisioned a free Neon PostgreSQL project at [neon.tech](https://neon.tech).
- [ ] Copied both `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` (direct) into Vercel Environment Variables (or local `.env` if testing PG locally).
- [ ] Confirmed `GET /api/health` returns `200 {"ok":true,"database":"postgresql"}`.

## 3. Brevo Free SMTP Setup
- [ ] Created a free Brevo account and verified your sender email address under **Senders, Domains & IPs -> Senders**.
- [ ] Generated an SMTP key under **SMTP & API -> SMTP**.
- [ ] Set `SMTP_HOST=smtp-relay.brevo.com`, `SMTP_PORT=587`, `SMTP_USER`, `SMTP_PASS`, and `EMAIL_FROM` in Vercel Environment Variables.
- [ ] Confirmed **SMTP Mail Transport = `Configured`** in app Settings and received a test magic-link email.

## 4. Cloudinary Setup Verification
- [ ] Created or signed into a Cloudinary account at [cloudinary.com](https://cloudinary.com).
- [ ] Retrieved `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` from Cloudinary Dashboard.
- [ ] Verified **strictly server-side placement**: none of the `CLOUDINARY_*` keys use `VITE_` or `NEXT_PUBLIC_` prefixes.
- [ ] Verified **Settings -> Security -> Restricted media types**: keep `Authenticated` delivery enabled so private client files require signed URLs.
- [ ] Opened **Settings** inside the app UI and verified **File Storage Driver = `cloudinary`** and **Cloudinary Credentials = `Configured`**.

## 5. Production / Vercel Deployment Verification
- [ ] Set `NODE_ENV="production"` and `FORCE_INSECURE_COOKIE="false"`.
- [ ] Set `APP_URL` to exact HTTPS Vercel deployment domain (no trailing slash), e.g., `https://qavonflow.vercel.app`.
- [ ] Tested build & verification suite cleanly before pushing:
  - [ ] `npm run typecheck` passes with 0 errors
  - [ ] `npm test` passes
  - [ ] `npm run build` succeeds cleanly
  - [ ] Deployed to Vercel and confirmed `/api/health`, login magic-link delivery via Brevo, and Neon persistence across cold starts.
