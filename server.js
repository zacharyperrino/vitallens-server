// ─── VitalLens API Server ────────────────────────────────────
import './env.js';
import './instrument.js'; // no-op when preloaded via --import (npm start); fallback for plain `node server.js`
import * as Sentry from '@sentry/node';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { requireAuth } from './middleware/auth.js';

import barcodeRoutes from './routes/barcode.js';
import ocrRoutes from './routes/ocr.js';
import healthScoreRoutes from './routes/health-score.js';
import visionRoutes from './routes/vision.js';
import ingestRoutes from './routes/ingest.js';
import correlationEngineRoutes from './routes/correlation-engine.js';
import parseLabsRoutes from './routes/parse-labs.js';
import foodCorrectionRoutes from './routes/food-correction.js';
import nutritionRoutes from './routes/nutrition.js';
import restaurantRoutes from './routes/restaurant.js';
import biomarkerRoutes from './routes/biomarker.js';
import biomarkerHistoryRoutes from './routes/biomarker-history.js';
import environmentRoutes from './routes/environment.js';
import supplementsRoutes from './routes/supplements.js';
import userGoalsRoutes from './routes/user-goals.js';
import healthProfileRoutes from './routes/health-profile.js';
import mealMemoryRoutes from './routes/meal-memory.js';
import tcmProfileRoutes from './routes/tcm-profile.js';
import healthCopilotRoutes from './routes/health-copilot.js';
import weeklyReportRoutes from './routes/weekly-report.js';
import predictionEngineRoutes from './routes/prediction-engine.js';
import userDataRoutes from './routes/user-data.js';
import billingRoutes from './routes/billing.js';
import pushRoutes from './routes/push.js';
import ouraRoutes from './routes/oura.js';
import ouraPublicRoutes from './routes/oura-public.js';
import hygieneRoutes from './routes/hygiene.js';
import usageRoutes from './routes/usage.js';
import earlyPatternsRoutes from './routes/early-patterns.js';
import cycleRoutes from './routes/cycle.js';
import customCorrelationRoutes from './routes/custom-correlation.js';
import practitionerRoutes from './routes/practitioner.js';
import medicationsRoutes from './routes/medications.js';
import genomicsRoutes from './routes/genomics.js';
import consentsRoutes from './routes/consents.js';
import { startPushReminders } from './services/push-reminders.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Behind Railway/Vercel proxies req.ip must come from X-Forwarded-For, or every
// user shares one rate-limit bucket.
app.set('trust proxy', 1);

// ─── Middleware ──────────────────────────────────────────────
app.use('/api/billing/webhook', express.raw({ type: 'application/json' }));
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000')
    .split(',').map(o => o.trim());
app.use(cors({
    origin: (origin, cb) => {
        // Allow same-origin/no-origin (mobile apps, curl) and allow-listed web origins.
        if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
        return cb(new Error('Not allowed by CORS'));
    },
    credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(helmet());

// ─── Production error sanitizer ──────────────────────────────
// Routes return `{ error: err.message }` on failure, which can leak raw
// internal/DB details. In production, replace the body of any 5xx response
// that carries an `error` field with a generic message. 4xx client errors
// (validation, auth) are left intact — they're safe and useful to the client.
app.use((req, res, next) => {
    const origJson = res.json.bind(res);
    res.json = (body) => {
        if (
            process.env.NODE_ENV === 'production' &&
            res.statusCode >= 500 &&
            body && typeof body === 'object' && 'error' in body
        ) {
            return origJson({ error: 'Internal server error. Please try again.' });
        }
        return origJson(body);
    };
    next();
});

// ─── Rate Limiter ────────────────────────────────────────────
const globalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please try again later.' },
    // Stripe deliveries all arrive from a handful of IPs and share one bucket;
    // a 429 there means a retried-then-dropped payment event. The webhook
    // authenticates itself via signature, so it needs no per-IP throttle.
    // (Mounted at /api, so req.path is relative: '/billing/webhook'.)
    skip: (req) => req.path === '/billing/webhook',
});
app.use('/api', globalLimiter);

// ─── Routes ─────────────────────────────────────────────────

// Public — no auth required
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'vitallens-api', uptime: process.uptime() });
});
// Readiness: proves the database is actually reachable (health above is liveness only).
app.get('/api/ready', async (req, res) => {
  try {
    const { supabase } = await import('./db/supabase.js');
    // Cheapest possible probe: one row, no count (a count scans the table).
    const { error } = await supabase.from('profiles').select('id').limit(1);
    if (error) throw error;
    res.json({ ready: true });
  } catch {
    res.status(503).json({ ready: false, error: 'database unreachable' });
  }
});
app.use('/api', billingRoutes);
app.use('/api', ouraPublicRoutes); // OAuth redirect target — verified via signed state

// Protected — requireAuth applies to every route below this line
app.use('/api', requireAuth);

// ─── Ownership guard ─────────────────────────────────────────
// One seal for every authenticated route, current and future: if a
// request names a userId anywhere, it must be the caller's own.
app.use('/api', (req, res, next) => {
    const claimed = req.query?.userId || req.body?.userId || req.query?.user_id || req.body?.user_id;
    if (claimed && claimed !== req.user.id) {
        return res.status(403).json({ error: 'Forbidden.' });
    }
    next();
});

app.use('/api', barcodeRoutes);
app.use('/api', ocrRoutes);
app.use('/api', healthScoreRoutes);
app.use('/api', visionRoutes);
app.use('/api', ingestRoutes);
app.use('/api', correlationEngineRoutes);
app.use('/api', parseLabsRoutes);
app.use('/api', foodCorrectionRoutes);
app.use('/api', nutritionRoutes);
app.use('/api', restaurantRoutes);
app.use('/api', biomarkerRoutes);
app.use('/api', biomarkerHistoryRoutes);
app.use('/api', environmentRoutes);
app.use('/api', supplementsRoutes);
app.use('/api', userGoalsRoutes);
app.use('/api', healthProfileRoutes);
app.use('/api', mealMemoryRoutes);
app.use('/api', tcmProfileRoutes);
app.use('/api', healthCopilotRoutes);
app.use('/api', weeklyReportRoutes);
app.use('/api', predictionEngineRoutes);
app.use('/api', userDataRoutes);
app.use('/api', pushRoutes);
app.use('/api', ouraRoutes);
app.use('/api', hygieneRoutes);
app.use('/api', usageRoutes);
app.use('/api', earlyPatternsRoutes);
app.use('/api', cycleRoutes);
app.use('/api', customCorrelationRoutes);
app.use('/api', medicationsRoutes);
app.use('/api', consentsRoutes);

// ─── FROZEN (not mounted) ────────────────────────────────────
// Genomics and the practitioner portal carry heavy regulatory/consent
// obligations (genetic-privacy law, third-party health-data sharing) and
// have no shipped frontend. They stay unmounted until counsel signs off and
// a proper consent flow exists. Do not remount without that review.
if (process.env.ENABLE_EXPERIMENTAL_ROUTES === 'true') {
    app.use('/api', practitionerRoutes);
    app.use('/api', genomicsRoutes);
    console.warn('[Server] Experimental routes ENABLED (practitioner sharing, genomics)');
}


// ─── Error Handler ──────────────────────────────────────────
// Sentry must be registered BEFORE the responding handler: Express runs
// error middleware in order, and the handler below ends the response
// without calling next(err), so anything after it never sees the error.
Sentry.setupExpressErrorHandler(app);

app.use((err, req, res, _next) => {
    console.error(`[ERROR] ${err.message}`, err.stack);
    res.status(err.status || 500).json({
        error: err.message || 'Internal server error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
});

// ─── Start ──────────────────────────────────────────────────
export default app;

if (process.env.NODE_ENV !== 'test') {
  const server = app.listen(PORT, () => {
    console.log(`🔬 VitalLens API running on http://localhost:${PORT}`);
  });

  // Evening web-push reminders (no-op without VAPID keys; unref'd interval).
  startPushReminders();

  // Graceful shutdown: stop accepting, let in-flight AI calls finish. AI
  // fetches retry for up to 45s and copilot tool loops run longer, so allow
  // 60s — the platform (Railway) may still cut the process off sooner.
  const shutdown = (signal) => {
    console.log(`[Server] ${signal} received — draining connections`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 60_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Crash safety. Node's default for an unhandled rejection is to exit the
  // process — one bad async route must not take the whole API down: report
  // it and keep serving. A genuine uncaught exception leaves state unknown:
  // report, flush Sentry, then exit so the platform restarts us.
  process.on('unhandledRejection', (reason) => {
    console.error('[Server] Unhandled rejection:', reason);
    Sentry.captureException(reason);
  });
  process.on('uncaughtException', (err) => {
    console.error('[Server] Uncaught exception:', err);
    Sentry.captureException(err);
    Sentry.flush(2000).finally(() => process.exit(1));
  });
}
