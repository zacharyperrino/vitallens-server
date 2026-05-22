// ─── TCM Profile Route ────────────────────────────────────────
// POST /api/tcm-profile/update   — update profile from meal analysis
// GET  /api/tcm-profile?userId=  — get constitution profile

import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const router = Router();
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── Constitution classifier ───────────────────────────────────
function deriveConstitution(profile) {
    const thermal = {
        hot: profile.hot_count + profile.warm_count * 0.5,
        cold: profile.cold_count + profile.cool_count * 0.5,
        neutral: profile.neutral_count,
    };
    const moisture = {
        damp: profile.damp_count,
        dry: profile.dry_count,
        balanced: profile.moist_count + profile.neutral_count * 0.5,
    };
    const total = profile.total_foods_analyzed || 1;

    // Dominant thermal tendency
    let thermalType = 'Balanced';
    const hotRatio = thermal.hot / total;
    const coldRatio = thermal.cold / total;
    if (hotRatio > 0.5) thermalType = 'Heat Excess';
    else if (hotRatio > 0.35) thermalType = 'Warm Tendency';
    else if (coldRatio > 0.5) thermalType = 'Cold Deficiency';
    else if (coldRatio > 0.35) thermalType = 'Cool Tendency';

    // Dominant moisture tendency
    let moistureType = 'Balanced';
    if (profile.damp_count / total > 0.35) moistureType = 'Damp Accumulation';
    else if (profile.dry_count / total > 0.35) moistureType = 'Dryness Tendency';

    // Dominant flavor (organ affinity)
    const flavors = {
        sweet: profile.sweet_count,
        sour: profile.sour_count,
        bitter: profile.bitter_count,
        pungent: profile.pungent_count,
        salty: profile.salty_count,
    };
    const dominantFlavor = Object.entries(flavors).sort((a, b) => b[1] - a[1])[0];
    const organMap = { sweet: 'Spleen/Stomach', sour: 'Liver/Gallbladder', bitter: 'Heart/Small Intestine', pungent: 'Lung/Large Intestine', salty: 'Kidney/Bladder' };

    return {
        thermalType,
        moistureType,
        dominantOrganSystem: organMap[dominantFlavor[0]] || 'Balanced',
        dominantFlavor: dominantFlavor[0],
        summary: `${thermalType} · ${moistureType} · ${dominantFlavor[0]} flavor dominant (${organMap[dominantFlavor[0]]})`,
    };
}

// ── POST /api/tcm-profile/update ─────────────────────────────
router.post('/tcm-profile/update', async (req, res) => {
    try {
        const { userId, foods } = req.body;
        if (!userId || !foods?.length) return res.status(400).json({ error: 'userId and foods required.' });

        // Get existing profile
        const { data: existing } = await supabase
            .from('tcm_profile')
            .select('*')
            .eq('user_id', userId)
            .single();

        // Count thermal/moisture/flavor from this meal's foods
        const counts = {
            hot: 0, warm: 0, neutral: 0, cool: 0, cold: 0,
            damp: 0, dry: 0, moist: 0,
            sweet: 0, sour: 0, bitter: 0, pungent: 0, salty: 0,
        };

        foods.forEach(food => {
            if (food.thermal && counts[food.thermal] !== undefined) counts[food.thermal]++;
            if (food.moisture && counts[food.moisture] !== undefined) counts[food.moisture]++;
            if (food.flavor && counts[food.flavor] !== undefined) counts[food.flavor]++;
        });

        // Merge with existing
        const updated = {
            user_id: userId,
            hot_count: (existing?.hot_count || 0) + counts.hot,
            warm_count: (existing?.warm_count || 0) + counts.warm,
            neutral_count: (existing?.neutral_count || 0) + counts.neutral,
            cool_count: (existing?.cool_count || 0) + counts.cool,
            cold_count: (existing?.cold_count || 0) + counts.cold,
            damp_count: (existing?.damp_count || 0) + counts.damp,
            dry_count: (existing?.dry_count || 0) + counts.dry,
            moist_count: (existing?.moist_count || 0) + counts.moist,
            sweet_count: (existing?.sweet_count || 0) + counts.sweet,
            sour_count: (existing?.sour_count || 0) + counts.sour,
            bitter_count: (existing?.bitter_count || 0) + counts.bitter,
            pungent_count: (existing?.pungent_count || 0) + counts.pungent,
            salty_count: (existing?.salty_count || 0) + counts.salty,
            total_foods_analyzed: (existing?.total_foods_analyzed || 0) + foods.length,
            updated_at: new Date().toISOString(),
        };

        // Derive constitution
        const constitution = deriveConstitution(updated);
        updated.constitution = constitution.summary;

        const { error } = await supabase
            .from('tcm_profile')
            .upsert(updated, { onConflict: 'user_id' });

        if (error) throw error;
        console.log(`[TCMProfile] Updated for ${userId.slice(0, 8)}: ${constitution.summary}`);
        res.json({ saved: true, constitution });

    } catch (err) {
        console.error('[TCMProfile] Update failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ── GET /api/tcm-profile ──────────────────────────────────────
router.get('/tcm-profile', async (req, res) => {
    try {
        const { userId } = req.query;
        if (!userId) return res.status(400).json({ error: 'userId required.' });

        const { data, error } = await supabase
            .from('tcm_profile')
            .select('*')
            .eq('user_id', userId)
            .single();

        if (error && error.code !== 'PGRST116') throw error;

        if (!data) return res.json({ profile: null });

        const constitution = deriveConstitution(data);
        res.json({ profile: { ...data, ...constitution } });
    } catch (err) {
        console.error('[TCMProfile] Fetch failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

export default router;