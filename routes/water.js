// ─── Water Intake Route ───────────────────────────────────────
// POST /api/water/log           — log a water intake entry
// GET  /api/water/today?userId= — total ml + entries for today
// GET  /api/water/history?userId=&days=7 — daily totals for last N days
// All routes are guarded by requireSelf — callers may only touch
// their own data.

import { Router } from 'express';
import { requireSelf } from '../middleware/auth.js';
import { supabase } from '../db/supabase.js';

import { sendError } from '../utils/errors.js';

const router = Router();

// Local-midnight ISO string, matching the convention used elsewhere.
function startOfToday() {
    return new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
        .toISOString()
        .split('T')[0];
}

// POST /api/water/log
router.post('/water/log', requireSelf('userId'), async (req, res) => {
    try {
        const { userId, amount_ml, logged_at } = req.body;
        if (amount_ml == null || Number.isNaN(Number(amount_ml))) {
            return res.status(400).json({ error: 'amount_ml is required and must be a number.' });
        }

        const { data, error } = await supabase
            .from('water_log')
            .insert({
                user_id: userId,
                amount_ml: Math.round(Number(amount_ml)),
                logged_at: logged_at || new Date().toISOString(),
            })
            .select()
            .single();

        if (error) throw error;
        console.log(`[Water] Logged ${amount_ml}ml for user ${userId.slice(0, 8)}`);
        res.json({ logged: true, entry: data });
    } catch (err) {
        console.error('[Water] Log failed:', err.message);
        sendError(res, err);
    }
});

// GET /api/water/today?userId=
router.get('/water/today', requireSelf('userId'), async (req, res) => {
    try {
        const { userId } = req.query;
        const today = startOfToday();

        const { data, error } = await supabase
            .from('water_log')
            .select('id, amount_ml, logged_at')
            .eq('user_id', userId)
            .gte('logged_at', today)
            .order('logged_at', { ascending: false });

        if (error) throw error;
        const entries = data || [];
        const total_ml = entries.reduce((sum, e) => sum + (e.amount_ml || 0), 0);
        res.json({ date: today, total_ml, entries });
    } catch (err) {
        console.error('[Water] Today fetch failed:', err.message);
        sendError(res, err);
    }
});

// GET /api/water/history?userId=&days=7
router.get('/water/history', requireSelf('userId'), async (req, res) => {
    try {
        const { userId } = req.query;
        const days = Math.min(Math.max(parseInt(req.query.days, 10) || 7, 1), 365);
        const since = new Date(Date.now() - (days - 1) * 86400000);
        since.setHours(0, 0, 0, 0);
        const sinceIso = since.toISOString();

        const { data, error } = await supabase
            .from('water_log')
            .select('amount_ml, logged_at')
            .eq('user_id', userId)
            .gte('logged_at', sinceIso)
            .order('logged_at', { ascending: true });

        if (error) throw error;

        // Aggregate into per-day totals keyed by YYYY-MM-DD.
        const totals = {};
        for (const entry of data || []) {
            const day = new Date(entry.logged_at).toISOString().split('T')[0];
            totals[day] = (totals[day] || 0) + (entry.amount_ml || 0);
        }
        const history = Object.entries(totals)
            .map(([date, total_ml]) => ({ date, total_ml }))
            .sort((a, b) => a.date.localeCompare(b.date));

        res.json({ days, history });
    } catch (err) {
        console.error('[Water] History fetch failed:', err.message);
        sendError(res, err);
    }
});

export default router;
