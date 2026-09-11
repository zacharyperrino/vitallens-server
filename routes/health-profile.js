// ─── Health Profile Route ─────────────────────────────────────
// GET  /api/health-profile?userId=   — fetch profile + targets
// POST /api/health-profile           — save profile + targets

import { Router } from 'express';
import { supabase } from '../db/supabase.js';

import { sendError } from '../utils/errors.js';

const router = Router();

router.get('/health-profile', async (req, res) => {
    try {
        const { userId } = req.query;
        if (!userId) return res.status(400).json({ error: 'userId required.' });

        const { data, error } = await supabase
            .from('health_profile')
            .select('*')
            .eq('user_id', userId)
            .single();

        if (error && error.code !== 'PGRST116') throw error;
        res.json({ profile: data || null });
    } catch (err) {
        console.error('[HealthProfile] Fetch failed:', err.message);
        sendError(res, err);
    }
});

router.post('/health-profile', async (req, res) => {
    try {
        const { userId, ...profile } = req.body;
        if (!userId) return res.status(400).json({ error: 'userId required.' });

        const { error } = await supabase
            .from('health_profile')
            .upsert({ user_id: userId, ...profile, updated_at: new Date().toISOString() },
                { onConflict: 'user_id' });

        if (error) throw error;
        console.log(`[HealthProfile] Saved for user ${userId.slice(0, 8)}`);
        res.json({ saved: true });
    } catch (err) {
        console.error('[HealthProfile] Save failed:', err.message);
        sendError(res, err);
    }
});

// POST /api/health-profile/calculate-targets
// Computes BMR (Mifflin-St Jeor), TDEE, and macro targets, then persists the
// baseline body stats + computed targets to health_profile (the snake_case
// columns the rest of the app reads: target_calories, bmr, tdee, etc.).
const ACTIVITY_MULTIPLIERS = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    active: 1.725,
    very_active: 1.9,
};

router.post('/health-profile/calculate-targets', async (req, res) => {
    try {
        const { userId, weight_kg, height_cm, age, sex, activity_level } = req.body;

        if (!userId) return res.status(400).json({ error: 'userId required.' });
        if (weight_kg == null || height_cm == null || age == null || !sex || !activity_level) {
            return res.status(400).json({ error: 'weight_kg, height_cm, age, sex, and activity_level are required.' });
        }
        const multiplier = ACTIVITY_MULTIPLIERS[activity_level];
        if (!multiplier) {
            return res.status(400).json({ error: `Invalid activity_level. Must be one of: ${Object.keys(ACTIVITY_MULTIPLIERS).join(', ')}.` });
        }

        // Mifflin-St Jeor BMR
        const base = (10 * weight_kg) + (6.25 * height_cm) - (5 * age);
        const bmr = sex.toLowerCase() === 'male' ? base + 5 : base - 161;
        const tdee = bmr * multiplier;

        const calories = Math.round(tdee / 50) * 50;
        const targets = {
            calories,
            protein_g: Math.round(weight_kg * 2.2),
            carbs_g: Math.round((calories * 0.4) / 4),
            fat_g: Math.round((calories * 0.3) / 9),
            fiber_g: 28,
        };

        const { error } = await supabase
            .from('health_profile')
            .upsert({
                user_id: userId,
                sex,
                age,
                height_cm,
                weight_kg,
                activity_level,
                bmr: Math.round(bmr),
                tdee: Math.round(tdee),
                target_calories: targets.calories,
                target_protein: targets.protein_g,
                target_carbs: targets.carbs_g,
                target_fat: targets.fat_g,
                target_fiber: targets.fiber_g,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'user_id' });

        if (error) throw error;
        console.log(`[HealthProfile] Targets calculated for user ${userId.slice(0, 8)} — ${targets.calories} cal`);

        res.json({
            bmr: Math.round(bmr),
            tdee: Math.round(tdee),
            targets,
        });
    } catch (err) {
        console.error('[HealthProfile] Target calc failed:', err.message);
        sendError(res, err);
    }
});

export default router;