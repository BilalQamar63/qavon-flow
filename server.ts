import 'dotenv/config';
import cookieParser from 'cookie-parser';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import path from 'node:path';
import { resolveSafeAppOrigin, serverConfig } from './server/config.ts';
import { getDb } from './server/db/database.ts';
import { assetsRouter } from './server/routes/assets.ts';
import { authRouter } from './server/routes/auth.ts';
import { clientsRouter } from './server/routes/clients.ts';
import { dashboardRouter } from './server/routes/dashboard.ts';
import { invitationsRouter } from './server/routes/invitations.ts';
import { notificationsRouter } from './server/routes/notifications.ts';
import { onboardingRouter } from './server/routes/onboarding.ts';
import { settingsRouter } from './server/routes/settings.ts';
import { recordSecurityLog } from './server/services/audit.ts';

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
let cachedAppPromise: Promise<Express> | null = null;

export async function createApp(): Promise<Express> {
  // Initialize database (Neon PostgreSQL when DATABASE_URL is set, else SQLite) & seed initial workspace if empty
  await getDb();

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(cookieParser());
  app.use(express.json({ limit: '2mb' }));

  // Global security headers
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    if (serverConfig.isProduction && !req.path.startsWith('/api/')) {
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:; frame-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'",
      );
    }
    next();
  });

  // Strict /api response hardening & defense-in-depth Origin validation for mutations
  app.use('/api', (req, res, next) => {
    if (!req.path.endsWith('/download')) {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    }

    if (STATE_CHANGING_METHODS.has(req.method)) {
      const originHeader = req.get('origin');
      if (originHeader) {
        const requestHost = req.get('x-forwarded-host') || req.get('host');
        const safeOrigin = resolveSafeAppOrigin(originHeader, requestHost);
        let matches = false;
        try {
          const parsedOrigin = new URL(originHeader);
          matches =
            parsedOrigin.origin === safeOrigin ||
            Boolean(requestHost && parsedOrigin.host === requestHost);
        } catch {
          matches = false;
        }
        if (!matches) {
          recordSecurityLog('csrf_origin_blocked', {
            method: req.method,
            path: req.originalUrl,
            origin: originHeader,
          });
          res.status(403).json({ error: 'Cross-origin state-changing request rejected' });
          return;
        }
      }
    }

    next();
  });

  // Health check (verifies live Neon Postgres / SQLite connectivity)
  app.get('/api/health', async (_req, res) => {
    try {
      const db = await getDb();
      await db.get('SELECT 1');
      res.json({ ok: true, database: db.driver });
    } catch {
      res.status(503).json({ ok: false, error: 'Database unavailable' });
    }
  });

  // API Routes
  app.use('/api/auth', authRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/clients', clientsRouter);
  app.use('/api/invitations', invitationsRouter);
  app.use('/api/onboarding', onboardingRouter);
  app.use('/api/assets', assetsRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/notifications', notificationsRouter);

  // Multer & API error handler (never leak internal error details on 5xx)
  app.use('/api', (err: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ error: 'Uploaded file exceeds the 15 MB limit' });
      return;
    }
    if (err && typeof err === 'object' && 'type' in err && (err as { type?: string }).type === 'entity.parse.failed') {
      res.status(400).json({ error: 'Malformed JSON request body' });
      return;
    }
    recordSecurityLog('api_unhandled_error', {
      method: req.method,
      path: req.originalUrl,
      errorName: err instanceof Error ? err.name : 'UnknownError',
    });
    res.status(500).json({ error: 'Internal server error' });
  });

  if (serverConfig.isProduction && !serverConfig.isVercel) {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else if (!serverConfig.isVercel && !serverConfig.isProduction && serverConfig.nodeEnv !== 'test') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  return app;
}

export function getApp(): Promise<Express> {
  if (!cachedAppPromise) {
    cachedAppPromise = createApp().catch((err) => {
      cachedAppPromise = null;
      throw err;
    });
  }
  return cachedAppPromise;
}

if (!serverConfig.isVercel && serverConfig.nodeEnv !== 'test') {
  getApp().then((app) => {
    app.listen(serverConfig.port, '0.0.0.0', () => {
      console.log(`QavonFlow (by Qavon Digital) listening on http://0.0.0.0:${serverConfig.port}`);
    });
  });
}
