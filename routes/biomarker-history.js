// ─── Biomarker History Route ──────────────────────────────────
// POST /api/biomarker-history        — save scan result
// GET  /api/biomarker-history?userId=&type=&limit=
// GET  /api/biomarker-history/latest?userId=&type=

import { Router } from 'express';
import { BiomarkerSchema, validateOrThrow } from '../services/ai-validators.js';

import { supabase } from '../db/supabase.js';

import { sendError } from '../utils/errors.js';

const router = Router();

// ── POST /api/biomarker-history ───────────────────────────────
router.post('/biomarker-history', async (req, res) => {
    try {
       const { userId, scanType, score, riskTier, result } = req.body;
if (!userId || !scanType) return res.status(400).json({ error: 'userId and scanType required.' });

// Plausibility guard on scan score
const rawScore = score || result?.overallScore;
if (rawScore !== undefined && rawScore !== null) {
    if (typeof rawScore !== 'number' || rawScore < 0 || rawScore > 100) {
        console.error(`[BiomarkerHistory] Implausible score rejected: ${rawScore}`);
        return res.status(422).json({ error: 'Scan score out of valid range (0-100).' });
    }
}

// Validate result object if present
if (result) {
    try { validateOrThrow(BiomarkerSchema, result, 'BiomarkerHistory'); }
    catch (e) { console.warn('[BiomarkerHistory] Result validation warning:', e.message); }
}

        const { data, error } = await supabase
            .from('biomarker_scans')
            .insert({
                user_id: userId,
                scan_type: scanType,
                score: score || result?.overallScore || null,
                risk_tier: riskTier || result?.riskTier || null,
                result: result || null,
            })
            .select()
            .single();

        if (error) throw error;
        console.log(`[BiomarkerHistory] Saved ${scanType} scan — score: ${data.score}`);
        res.json({ saved: true, id: data.id });
    } catch (err) {
        console.error('[BiomarkerHistory] Save failed:', err.message);
        sendError(res, err);
    }
});

// ── GET /api/biomarker-history ────────────────────────────────
router.get('/biomarker-history', async (req, res) => {
    try {
        const { userId, type, limit = 20 } = req.query;
        if (!userId) return res.status(400).json({ error: 'userId required.' });

        let query = supabase
            .from('biomarker_scans')
            .select('id, scan_type, score, risk_tier, scanned_at, result')
            .eq('user_id', userId)
            .order('scanned_at', { ascending: false })
            .limit(parseInt(limit));

        if (type) query = query.eq('scan_type', type);

        const { data, error } = await query;
        if (error) throw error;
        res.json({ scans: data || [] });
    } catch (err) {
        console.error('[BiomarkerHistory] Fetch failed:', err.message);
        sendError(res, err);
    }
});

// ── GET /api/biomarker-history/latest ────────────────────────
router.get('/biomarker-history/latest', async (req, res) => {
    try {
        const { userId, type } = req.query;
        if (!userId || !type) return res.status(400).json({ error: 'userId and type required.' });

        const { data, error } = await supabase
            .from('biomarker_scans')
            .select('*')
            .eq('user_id', userId)
            .eq('scan_type', type)
            .order('scanned_at', { ascending: false })
            .limit(2);

        if (error) throw error;
        res.json({
            latest: data?.[0] || null,
            previous: data?.[1] || null,
        });
    } catch (err) {
        console.error('[BiomarkerHistory] Latest fetch failed:', err.message);
        sendError(res, err);
    }
});

export default router;