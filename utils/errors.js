// ─── Route error helper ───────────────────────────────────────
// One place for "the handler caught an error": report it to Sentry, log it,
// respond. The production sanitizer in server.js still generifies 5xx bodies.
import * as Sentry from '@sentry/node';

export function sendError(res, err, status = 500) {
  try { Sentry.captureException(err); } catch { /* never let telemetry break a response */ }
  console.error(`[ERROR ${status}] ${err?.message || err}`);
  res.status(status).json({ error: err?.message || 'Internal server error' });
}
