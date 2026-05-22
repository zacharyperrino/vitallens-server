// ─── AI Rate Limiters ─────────────────────────────────────────
// Tiered rate limits by endpoint cost.
// Import the appropriate limiter in each route file.

import rateLimit from 'express-rate-limit';

// ── Heavy AI endpoints (correlation, predictions, weekly report)
// These are expensive multi-second Claude calls.
// 5 per user per hour.
export const heavyAILimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => req.body?.userId || req.query?.userId || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Analysis limit reached. You can run up to 5 analyses per hour.' },
});

// ── Chat copilot (moderate cost, higher frequency needed)
// 30 messages per user per hour.
export const copilotLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  keyGenerator: (req) => req.body?.userId || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Chat limit reached. You can send up to 30 messages per hour.' },
});

// ── Vision scan endpoints (biomarker, food scanner)
// 20 scans per user per hour.
export const visionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => req.body?.userId || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Scan limit reached. You can run up to 20 scans per hour.' },
});

// ── Light endpoints (nutrition lookup, barcode, OCR)
// 60 per user per hour.
export const lightLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 60,
  keyGenerator: (req) => req.body?.userId || req.query?.userId || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Request limit reached. Please try again later.' },
});