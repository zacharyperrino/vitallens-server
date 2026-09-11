// ─── AI Rate Limiters ─────────────────────────────────────────
// Keyed on the AUTHENTICATED user id (never a client-supplied field), with
// the IP as a fallback for the rare pre-auth path.
import rateLimit from 'express-rate-limit';

const byUser = (req) => req.user?.id || req.ip;
const opts = { standardHeaders: true, legacyHeaders: false, keyGenerator: byUser };

// Heavy multi-second Claude calls (correlation, predictions, weekly report).
export const heavyAILimiter = rateLimit({ ...opts, windowMs: 60 * 60 * 1000, max: 5,
  message: { error: 'Analysis limit reached. You can run up to 5 analyses per hour.' } });

// Chat copilot.
export const copilotLimiter = rateLimit({ ...opts, windowMs: 60 * 60 * 1000, max: 30,
  message: { error: 'Chat limit reached. You can send up to 30 messages per hour.' } });

// Vision scans (food, wellness check-ins).
export const visionLimiter = rateLimit({ ...opts, windowMs: 60 * 60 * 1000, max: 20,
  message: { error: 'Scan limit reached. You can run up to 20 scans per hour.' } });

// Light lookups (nutrition, barcode, OCR).
export const lightLimiter = rateLimit({ ...opts, windowMs: 60 * 60 * 1000, max: 60,
  message: { error: 'Request limit reached. Please try again later.' } });
