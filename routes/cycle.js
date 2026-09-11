// ─── Menstrual Cycle Tracking Route ───────────────────────────
// POST /api/cycle/log      — log a cycle event
// GET  /api/cycle/current  — current cycle day + predicted next period
// GET  /api/cycle/history  — past cycles with lengths
// All routes guarded by requireSelf. Cycle events also feed into
// health_events (via eventIngestion) for correlation analysis.

import { Router } from 'express';
import { requireSelf } from '../middleware/auth.js';
import { ingest } from '../services/eventIngestion.js';
import { supabase } from '../db/supabase.js';

import { sendError } from '../utils/errors.js';
import { MS_PER_DAY, isoDate, todayISO } from '../utils/dates.js';

const router = Router();

const EVENT_TYPES = ['period_start', 'period_end', 'symptom', 'ovulation'];

// POST /api/cycle/log
router.post('/cycle/log', requireSelf('userId'), async (req, res) => {
    try {
        const { userId, event_type, symptom, flow, date } = req.body;
        if (!EVENT_TYPES.includes(event_type)) {
            return res.status(400).json({ error: `event_type must be one of: ${EVENT_TYPES.join(', ')}.` });
        }
        const eventDate = date || todayISO();

        const { data, error } = await supabase
            .from('cycle_log')
            .insert({
                user_id: userId,
                event_type,
                symptom: symptom || null,
                flow: flow || null,
                logged_at: new Date().toISOString(),
                date: eventDate,
            })
            .select()
            .single();

        if (error) throw error;

        // Feed into health_events for correlation (non-blocking).
        try {
            await ingest.cycle(userId, { event_type, symptom, flow, date: eventDate }, data.id);
        } catch (e) {
            console.warn('[Cycle] Ingest failed:', e.message);
        }

        res.json({ logged: true, entry: data });
    } catch (err) {
        console.error('[Cycle] Log failed:', err.message);
        sendError(res, err);
    }
});

// GET /api/cycle/current
router.get('/cycle/current', requireSelf('userId'), async (req, res) => {
    try {
        const { userId } = req.query;
        const starts = await periodStartDates(userId);

        if (starts.length === 0) {
            return res.json({
                cycleDay: null,
                lastPeriodStart: null,
                averageCycleLength: null,
                predictedNextPeriod: null,
                message: 'No period_start logged yet.',
            });
        }

        const lastStart = starts[starts.length - 1];
        const cycleDay = Math.floor((Date.now() - new Date(lastStart).getTime()) / MS_PER_DAY) + 1;

        const lengths = cycleLengths(starts);
        const averageCycleLength = lengths.length
            ? Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length)
            : 28; // sensible default before two periods are logged

        const predictedNextPeriod = isoDate(new Date(lastStart).getTime() + averageCycleLength * MS_PER_DAY);

        res.json({
            cycleDay,
            lastPeriodStart: lastStart,
            averageCycleLength,
            predictedNextPeriod,
            cyclesTracked: lengths.length,
        });
    } catch (err) {
        console.error('[Cycle] Current failed:', err.message);
        sendError(res, err);
    }
});

// GET /api/cycle/history
router.get('/cycle/history', requireSelf('userId'), async (req, res) => {
    try {
        const { userId } = req.query;
        const [starts, events] = await Promise.all([periodStartDates(userId), recentEvents(userId)]);

        const cycles = [];
        for (let i = 1; i < starts.length; i++) {
            const lengthDays = Math.round((new Date(starts[i]).getTime() - new Date(starts[i - 1]).getTime()) / MS_PER_DAY);
            cycles.push({ start: starts[i - 1], nextStart: starts[i], lengthDays });
        }

        const avg = cycles.length ? Math.round(cycles.reduce((a, c) => a + c.lengthDays, 0) / cycles.length) : null;
        // `events` is the raw log (newest first) the Cycle tab renders; `cycles` is the derived view.
        res.json({ cycles, events, averageCycleLength: avg, periodsLogged: starts.length });
    } catch (err) {
        console.error('[Cycle] History failed:', err.message);
        sendError(res, err);
    }
});

// ── Helpers ───────────────────────────────────────────────────
async function periodStartDates(userId) {
    const { data, error } = await supabase
        .from('cycle_log')
        .select('date')
        .eq('user_id', userId)
        .eq('event_type', 'period_start')
        .order('date', { ascending: true });
    if (error) throw error;
    return (data || []).map(r => r.date).filter(Boolean);
}

async function recentEvents(userId, limit = 60) {
    const { data, error } = await supabase
        .from('cycle_log')
        .select('id, event_type, symptom, flow, date')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .order('logged_at', { ascending: false })
        .limit(limit);
    if (error) throw error;
    return data || [];
}

function cycleLengths(starts) {
    const lengths = [];
    for (let i = 1; i < starts.length; i++) {
        const gap = Math.round((new Date(starts[i]).getTime() - new Date(starts[i - 1]).getTime()) / MS_PER_DAY);
        if (gap > 0) lengths.push(gap);
    }
    return lengths;
}

export default router;
