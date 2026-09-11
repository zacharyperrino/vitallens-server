// ─── Food Correction Route ────────────────────────────────────
// POST /api/food-correction      — save a user correction (upsert with frequency)
// GET  /api/food-corrections     — get corrections weighted by frequency
// POST /api/portion-correction   — save a portion slider correction
// GET  /api/portion-corrections  — get portion corrections for prompt injection

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { supabase } from '../db/supabase.js';

import { sendError } from '../utils/errors.js';

const router = Router();

const correctionLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    message: { error: 'Rate limit exceeded.' },
});

// ── POST /api/food-correction ─────────────────────────────────
// Upserts correction — increments count if same pair exists

router.post('/food-correction', correctionLimiter, async (req, res) => {
    try {
        const { userId, detectedLabel, correctedLabel, detectedGrams, correctedGrams, confidence, mealContext } = req.body;
        if (!userId || !detectedLabel || !correctedLabel) {
            return res.status(400).json({ error: 'userId, detectedLabel, and correctedLabel are required.' });
        }

        const detected = detectedLabel.toLowerCase().trim();
        const corrected = correctedLabel.toLowerCase().trim();

        // Check if this correction pair already exists
        const { data: existing } = await supabase
            .from('food_corrections')
            .select('id, correction_count')
            .eq('user_id', userId)
            .eq('detected_label', detected)
            .eq('corrected_label', corrected)
            .single();

        if (existing) {
            const { error } = await supabase
                .from('food_corrections')
                .update({ correction_count: (existing.correction_count || 1) + 1 })
                .eq('id', existing.id);
            if (error) throw error;
            console.log(`[Correction] ${detected} → ${corrected} (count: ${(existing.correction_count || 1) + 1})`);
        } else {
            const { error } = await supabase
                .from('food_corrections')
                .insert({
                    user_id: userId,
                    detected_label: detected,
                    corrected_label: corrected,
                    detected_grams: detectedGrams || null,
                    corrected_grams: correctedGrams || null,
                    confidence: confidence || null,
                    meal_context: mealContext || null,
                    correction_count: 1,
                });
            if (error) throw error;
            console.log(`[Correction] ${detected} → ${corrected} (new)`);
        }

        res.json({ saved: true });
    } catch (err) {
        console.error('[Correction] Save failed:', err.message);
        sendError(res, err);
    }
});

// ── GET /api/food-corrections ─────────────────────────────────
// Returns corrections sorted by frequency — high count = strong rule

router.get('/food-corrections', async (req, res) => {
    try {
        const { userId, limit = 30 } = req.query;
        if (!userId) return res.status(400).json({ error: 'userId required.' });

        const { data, error } = await supabase
            .from('food_corrections')
            .select('detected_label, corrected_label, corrected_grams, correction_count')
            .eq('user_id', userId)
            .order('correction_count', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(parseInt(limit));

        if (error) throw error;

        // Deduplicate — keep highest count per detected label
        const seen = new Set();
        const deduped = (data || []).filter(c => {
            if (seen.has(c.detected_label)) return false;
            seen.add(c.detected_label);
            return true;
        });

        res.json({ corrections: deduped });
    } catch (err) {
        console.error('[Correction] Fetch failed:', err.message);
        sendError(res, err);
    }
});

// ── POST /api/portion-correction ─────────────────────────────
// Upserts portion correction with running average

router.post('/portion-correction', correctionLimiter, async (req, res) => {
    try {
        const { userId, foodLabel, originalGrams, correctedGrams } = req.body;
        if (!userId || !foodLabel || !correctedGrams) {
            return res.status(400).json({ error: 'userId, foodLabel, correctedGrams required.' });
        }

        const label = foodLabel.toLowerCase().trim();

        const { data: existing } = await supabase
            .from('portion_corrections')
            .select('id, correction_count, avg_corrected_grams')
            .eq('user_id', userId)
            .eq('food_label', label)
            .single();

        if (existing) {
            const newCount = (existing.correction_count || 1) + 1;
            const newAvg = Math.round(
                ((existing.avg_corrected_grams || correctedGrams) * (newCount - 1) + correctedGrams) / newCount
            );
            const { error } = await supabase
                .from('portion_corrections')
                .update({
                    correction_count: newCount,
                    avg_corrected_grams: newAvg,
                    corrected_grams: correctedGrams,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', existing.id);
            if (error) throw error;
            console.log(`[PortionCorrection] ${label}: avg now ${newAvg}g (count: ${newCount})`);
        } else {
            const { error } = await supabase
                .from('portion_corrections')
                .insert({
                    user_id: userId,
                    food_label: label,
                    original_grams: originalGrams || null,
                    corrected_grams: correctedGrams,
                    correction_count: 1,
                    avg_corrected_grams: correctedGrams,
                });
            if (error) throw error;
            console.log(`[PortionCorrection] ${label}: ${correctedGrams}g (new)`);
        }

        res.json({ saved: true });
    } catch (err) {
        console.error('[PortionCorrection] Save failed:', err.message);
        sendError(res, err);
    }
});

// ── GET /api/portion-corrections ─────────────────────────────

router.get('/portion-corrections', async (req, res) => {
    try {
        const { userId } = req.query;
        if (!userId) return res.status(400).json({ error: 'userId required.' });

        const { data, error } = await supabase
            .from('portion_corrections')
            .select('food_label, avg_corrected_grams, correction_count')
            .eq('user_id', userId)
            .gte('correction_count', 2)
            .order('correction_count', { ascending: false })
            .limit(20);

        if (error) throw error;
        res.json({ portions: data || [] });
    } catch (err) {
        console.error('[PortionCorrection] Fetch failed:', err.message);
        sendError(res, err);
    }
});

export default router;