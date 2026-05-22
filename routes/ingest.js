import { Router } from 'express';
import rateLimit from 'express-rate-limit';

const router = Router();

const ingestLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    message: { error: 'Ingest rate limit exceeded.' },
});

const VALID_EVENT_TYPES = new Set([
    'meal', 'body_scan', 'hr_reading', 'exercise',
    'sleep', 'habit', 'lab_result', 'product_scan',
    'stool_scan', 'symptom',
]);

router.post('/ingest', ingestLimiter, async (req, res) => {
    res.json({ queued: true });

    setImmediate(async () => {
        try {
            const { userId, eventType, data, sourceId } = req.body;
            if (!userId || !eventType || !data) return;
            if (!VALID_EVENT_TYPES.has(eventType)) return;
            console.log(`[Ingest] ${eventType} for user ${userId.slice(0, 8)}...`);
        } catch (err) {
            console.error('[Ingest] Background ingestion failed:', err.message);
        }
    });
});

export default router;
