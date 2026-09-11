// ─── Meal Memory Route ────────────────────────────────────────
// GET  /api/meal-memory?userId=&hash=   — check if meal exists
// POST /api/meal-memory                 — upsert meal memory

import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { sendError } from '../utils/errors.js';

const router = Router();
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY  // bypasses RLS
);

// ── GET /api/meal-memory ──────────────────────────────────────
router.get('/meal-memory', async (req, res) => {
    try {
        const { userId, hash } = req.query;
        if (!userId || !hash) return res.status(400).json({ error: 'userId and hash required.' });

        const { data, error } = await supabase
            .from('meal_memory')
            .select('*')
            .eq('user_id', userId)
            .eq('meal_hash', hash)
            .single();

        if (error && error.code !== 'PGRST116') throw error;
        res.json({ memory: data || null });
    } catch (err) {
        console.error('[MealMemory] Fetch failed:', err.message);
        sendError(res, err);
    }
});

// ── POST /api/meal-memory ─────────────────────────────────────
router.post('/meal-memory', async (req, res) => {
    try {
        const { userId, hash, mealName, foods, calories } = req.body;
        if (!userId || !hash || !mealName) {
            return res.status(400).json({ error: 'userId, hash, and mealName required.' });
        }

        const { data: existing, error: fetchErr } = await supabase
            .from('meal_memory')
            .select('id, scan_count, avg_calories')
            .eq('user_id', userId)
            .eq('meal_hash', hash)
            .single();

        if (fetchErr && fetchErr.code !== 'PGRST116') throw fetchErr;

        if (existing) {
            const newCount = existing.scan_count + 1;
            const newAvg = Math.round((existing.avg_calories * existing.scan_count + calories) / newCount);
            const { error } = await supabase
                .from('meal_memory')
                .update({
                    scan_count: newCount,
                    avg_calories: newAvg,
                    meal_name: mealName,
                    foods: foods,
                    last_scanned_at: new Date().toISOString(),
                })
                .eq('id', existing.id);
            if (error) throw error;
            console.log(`[MealMemory] Updated: ${mealName} (count: ${newCount}, avg: ${newAvg} cal)`);
        } else {
            const { error } = await supabase
                .from('meal_memory')
                .insert({
                    user_id: userId,
                    meal_hash: hash,
                    meal_name: mealName,
                    foods: foods,
                    avg_calories: calories,
                    scan_count: 1,
                });
            if (error) throw error;
            console.log(`[MealMemory] New: ${mealName} (${calories} cal)`);
        }

        res.json({ saved: true });
    } catch (err) {
        console.error('[MealMemory] Save failed:', err.message);
        sendError(res, err);
    }
});

// ── GET /api/meal-memory/list ─────────────────────────────────
router.get('/meal-memory/list', async (req, res) => {
    try {
        const { userId } = req.query;
        if (!userId) return res.status(400).json({ error: 'userId required.' });

        const { data, error } = await supabase
            .from('meal_memory')
            .select('*')
            .eq('user_id', userId)
            .order('scan_count', { ascending: false })
            .limit(20);

        if (error) throw error;
        res.json({ memories: data || [] });
    } catch (err) {
        console.error('[MealMemory] List failed:', err.message);
        sendError(res, err);
    }
});

// ── DELETE /api/meal-memory/:id ───────────────────────────────
router.delete('/meal-memory/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { userId } = req.query;
        if (!userId || !id) return res.status(400).json({ error: 'userId and id required.' });

        const { error } = await supabase
            .from('meal_memory')
            .delete()
            .eq('id', id)
            .eq('user_id', userId);

        if (error) throw error;
        console.log(`[MealMemory] Deleted: ${id}`);
        res.json({ deleted: true });
    } catch (err) {
        console.error('[MealMemory] Delete failed:', err.message);
        sendError(res, err);
    }
});

// ── GET /api/daily-nutrition ──────────────────────────────────
router.get('/daily-nutrition', async (req, res) => {
    try {
        const { userId, date } = req.query;
        if (!userId || !date) return res.status(400).json({ error: 'userId and date required.' });

        const { data, error } = await supabase
            .from('daily_nutrition')
            .select('*')
            .eq('user_id', userId)
            .eq('date', date)
            .single();

        if (error && error.code !== 'PGRST116') throw error;
        res.json({ data: data || null });
    } catch (err) {
        console.error('[DailyNutrition] Fetch failed:', err.message);
        sendError(res, err);
    }
});

export default router;