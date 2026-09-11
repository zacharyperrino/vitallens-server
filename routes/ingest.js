// ─── Event ingestion ──────────────────────────────────────────
// Called by the frontend after every data write. Records the event in
// health_events (the RAG corpus), embeds it asynchronously, and invalidates
// the user's cached context snapshot so the copilot sees fresh data.
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { ingestEvent } from '../services/eventIngestion.js';
import { invalidateContextCache } from '../services/context-builder.js';

const router = Router();

const ingestLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    keyGenerator: (req) => req.user?.id || req.ip,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Ingest rate limit exceeded.' },
});

const VALID_EVENT_TYPES = new Set([
    'meal', 'body_scan', 'hr_reading', 'exercise', 'sleep', 'habit',
    'lab_result', 'product_scan', 'symptom', 'cycle', 'medication', 'water', 'hygiene',
]);

router.post('/ingest', ingestLimiter, async (req, res) => {
    const userId = req.user.id; // never the body — the global guard already 403s a mismatch
    const { eventType, data, sourceId } = req.body || {};
    if (!eventType || !data || typeof data !== 'object') {
        return res.status(400).json({ error: 'eventType and data are required.' });
    }
    if (!VALID_EVENT_TYPES.has(eventType)) {
        return res.status(400).json({ error: `Unknown eventType "${eventType}".` });
    }

    // Respond immediately; the write + embedding happen in the background.
    res.json({ queued: true });

    setImmediate(async () => {
        try {
            await ingestEvent(userId, eventType, data, sourceId || null);
            await invalidateContextCache(userId);
        } catch (err) {
            console.error('[Ingest] Background ingestion failed:', err.message);
        }
    });
});

export default router;
