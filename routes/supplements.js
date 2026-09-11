// ─── Supplement Logs Route ────────────────────────────────────
// GET    /api/supplements?userId=         — list active supplements
// POST   /api/supplements                 — add supplement
// DELETE /api/supplements/:id?userId=     — remove supplement
// PATCH  /api/supplements/:id             — update (dose, frequency, active)

import { Router } from 'express';
import { supabase } from '../db/supabase.js';

import { sendError } from '../utils/errors.js';
import { daysAgoISO, todayISO } from '../utils/dates.js';

const router = Router();

function normalizeName(value) {
    return (value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function buildNutritionGaps(dailyNutrition, todayNutrition, profile) {
    const target = {
        calories: profile?.target_calories || 2100,
        protein: profile?.target_protein || 120,
        fiber: profile?.target_fiber || 30,
        carbs: profile?.target_carbs || 250,
        fat: profile?.target_fat || 80,
    };
    const source = todayNutrition || (dailyNutrition.length > 0 ? {
        calories: dailyNutrition.reduce((sum, day) => sum + (day.calories || 0), 0) / dailyNutrition.length,
        protein: dailyNutrition.reduce((sum, day) => sum + (day.protein || 0), 0) / dailyNutrition.length,
        carbs: dailyNutrition.reduce((sum, day) => sum + (day.carbs || 0), 0) / dailyNutrition.length,
        fat: dailyNutrition.reduce((sum, day) => sum + (day.fat || 0), 0) / dailyNutrition.length,
        fiber: dailyNutrition.reduce((sum, day) => sum + (day.fiber || 0), 0) / dailyNutrition.length,
    } : null);

    if (!source) return [];

    const gaps = [];
    function addGap(name, actual, targetValue, unit) {
        if (typeof actual !== 'number' || typeof targetValue !== 'number' || targetValue <= 0) return;
        const ratio = actual / targetValue;
        if (ratio < 0.85) {
            gaps.push({ name, actual: Math.round(actual), target: Math.round(targetValue), unit, status: 'below', note: `Below target by ${Math.round((1 - ratio) * 100)}%.` });
        } else if (ratio > 1.15) {
            gaps.push({ name, actual: Math.round(actual), target: Math.round(targetValue), unit, status: 'above', note: `Above target by ${Math.round((ratio - 1) * 100)}%.` });
        }
    }

    addGap('Calories', source.calories, target.calories, 'kcal');
    addGap('Protein', source.protein, target.protein, 'g');
    addGap('Fiber', source.fiber, target.fiber, 'g');
    addGap('Carbs', source.carbs, target.carbs, 'g');
    addGap('Fat', source.fat, target.fat, 'g');
    return gaps;
}

function analyzeLabGaps(labResults) {
    const gaps = [];
    labResults.forEach(panel => {
        const markers = panel.markers || {};
        Object.entries(markers).forEach(([marker, data]) => {
            if (!data || !data.status) return;
            const status = String(data.status).toLowerCase();
            if (status !== 'low' && status !== 'high') return;
            gaps.push({
                marker,
                panel: panel.panel_type,
                status,
                value: data.value,
                unit: data.unit,
                note: status === 'low'
                    ? 'This marker is below the expected range and may indicate a supplement gap or dietary insufficiency.'
                    : 'This marker is above the expected range and may indicate a need to adjust supplementation or dietary intake.',
            });
        });
    });
    return gaps;
}

function buildSupplementRecommendations(supplements, nutritionGaps, labGaps) {
    const supplementNames = supplements.map(s => normalizeName(s.name));
    const profile = {
        iron: supplementNames.some(name => name.includes('iron')),
        vitaminD: supplementNames.some(name => /(vitamin d|d3)/.test(name)),
        vitaminK2: supplementNames.some(name => /(vitamin k|k2)/.test(name)),
        magnesium: supplementNames.some(name => name.includes('magnesium')),
        protein: supplementNames.some(name => name.includes('protein')),
        omega3: supplementNames.some(name => /(omega|fish oil|epa|dha)/.test(name)),
        zinc: supplementNames.some(name => name.includes('zinc')),
    };

    const results = [];
    const addMatch = (supplement, reason, match) => {
        results.push({ supplement, reason, currentlyTaking: match });
    };

    nutritionGaps.forEach(gap => {
        if (gap.name === 'Protein') {
            addMatch('Protein support', 'Protein intake is below target.', profile.protein);
        }
        if (gap.name === 'Fiber') {
            addMatch('Fiber support', 'Fiber intake is below target.', supplementNames.some(name => name.includes('fiber')));
        }
        if (gap.name === 'Calories') {
            addMatch('Caloric support', 'Calories are outside the target range.', false);
        }
    });

    labGaps.forEach(gap => {
        const key = normalizeName(gap.marker);
        if (/vitamin d|d3/.test(key)) {
            addMatch('Vitamin D', 'Low vitamin D may benefit from D3 supplementation, ideally with K2.', profile.vitaminD);
        } else if (/(iron|ferritin)/.test(key)) {
            addMatch('Iron', 'Low iron markers may benefit from iron supplementation with vitamin C.', profile.iron);
        } else if (/magnesium/.test(key)) {
            addMatch('Magnesium', 'Low magnesium may support muscle and sleep recovery.', profile.magnesium);
        } else if (/b12|cobalamin/.test(key)) {
            addMatch('Vitamin B12', 'Low B12 may benefit from supplementation or dietary changes.', supplementNames.some(name => /(b12|cobalamin)/.test(name)));
        } else if (/homocysteine/.test(key)) {
            addMatch('B-complex', 'Elevated homocysteine can be addressed with B6/B9/B12 support.', supplementNames.some(name => /(b-complex|b complex|folate|folic|b12|b6)/.test(name)));
        }
    });

    return results;
}

function buildInteractionWarnings(supplements) {
    const names = supplements.map(s => normalizeName(s.name));
    const warnings = [];
    const has = term => names.some(name => name.includes(term));

    if (has('iron') && (has('calcium') || has('zinc') || has('magnesium'))) {
        warnings.push({ note: 'Iron absorption may be reduced when taken with calcium, zinc, or magnesium. Take iron separately from these minerals.' });
    }
    if (has('vitamin d') && has('k2')) {
        warnings.push({ note: 'Vitamin D and K2 are a good synergistic pair for calcium metabolism and bone support.' });
    }
    if (has('magnesium') && has('zinc')) {
        warnings.push({ note: 'Magnesium and zinc may compete for absorption when taken simultaneously; consider spacing them apart.' });
    }
    if (has('magnesium') && has('melatonin')) {
        warnings.push({ note: 'Magnesium plus melatonin can support sleep quality if taken in the evening.' });
    }
    return warnings;
}

function buildGapAnalysis(supplements, dailyNutrition, todayNutrition, labResults, profile) {
    const nutritionGaps = buildNutritionGaps(dailyNutrition, todayNutrition, profile);
    const labGaps = analyzeLabGaps(labResults);
    const supplementMatches = buildSupplementRecommendations(supplements, nutritionGaps, labGaps);
    const interactionWarnings = buildInteractionWarnings(supplements);
    const summaryParts = [];

    if (nutritionGaps.length) {
        summaryParts.push(`Nutrition gaps detected in ${nutritionGaps.map(g => g.name).join(', ')}.`);
    }
    if (labGaps.length) {
        summaryParts.push(`Labs flagged ${labGaps.map(g => g.marker).join(', ')}.`);
    }
    if (supplementMatches.length) {
        summaryParts.push(`${supplementMatches.filter(m => m.currentlyTaking).length} current supplement(s) appear to align with identified gaps.`);
    }
    if (interactionWarnings.length) {
        summaryParts.push('Supplement interaction warnings were detected.');
    }
    if (!summaryParts.length) {
        summaryParts.push('No major supplement gaps or interactions were detected from available nutrition and lab data.');
    }

    return {
        summary: summaryParts.join(' '),
        nutritionGaps,
        labGaps,
        supplementMatches,
        interactionWarnings,
    };
}

// ── GET /api/supplements ──────────────────────────────────────
router.get('/supplements', async (req, res) => {
    try {
        const { userId } = req.query;
        if (!userId) return res.status(400).json({ error: 'userId required.' });

        const [supplementsRes, profileRes, dailyNutritionRes, todayNutritionRes, labResultsRes] = await Promise.allSettled([
            supabase.from('supplement_logs').select('*').eq('user_id', userId).eq('active', true).order('started_at', { ascending: false }),
            supabase.from('health_profile').select('*').eq('user_id', userId).single(),
            supabase.from('daily_nutrition').select('*').eq('user_id', userId).gte('date', daysAgoISO(7)).order('date', { ascending: true }),
            supabase.from('daily_nutrition').select('*').eq('user_id', userId).eq('date', todayISO()).single(),
            supabase.from('lab_results').select('panel_type, markers, collected_at').eq('user_id', userId).order('collected_at', { ascending: false }).limit(5),
        ]);

        const supplements = supplementsRes.status === 'fulfilled' ? supplementsRes.value.data || [] : [];
        const profile = profileRes.status === 'fulfilled' ? profileRes.value.data : null;
        const dailyNutrition = dailyNutritionRes.status === 'fulfilled' ? dailyNutritionRes.value.data || [] : [];
        const todayNutrition = todayNutritionRes.status === 'fulfilled' ? todayNutritionRes.value.data : null;
        const labResults = labResultsRes.status === 'fulfilled' ? labResultsRes.value.data || [] : [];

        const gapAnalysis = buildGapAnalysis(supplements, dailyNutrition, todayNutrition, labResults, profile);
        res.json({ supplements, gapAnalysis });
    } catch (err) {
        console.error('[Supplements] Fetch failed:', err.message);
        sendError(res, err);
    }
});

// ── POST /api/supplements ─────────────────────────────────────
router.post('/supplements', async (req, res) => {
    try {
        const { userId, name, dose, frequency, notes } = req.body;
        if (!userId || !name) return res.status(400).json({ error: 'userId and name required.' });

        const { data, error } = await supabase
            .from('supplement_logs')
            .insert({ user_id: userId, name, dose, frequency, notes, active: true })
            .select()
            .single();

        if (error) throw error;
        console.log(`[Supplements] Added: ${name} for ${userId.slice(0, 8)}`);
        res.json({ saved: true, supplement: data });
    } catch (err) {
        console.error('[Supplements] Save failed:', err.message);
        sendError(res, err);
    }
});

// ── DELETE /api/supplements/:id ───────────────────────────────
router.delete('/supplements/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { userId } = req.query;
        if (!userId) return res.status(400).json({ error: 'userId required.' });

        const { error } = await supabase
            .from('supplement_logs')
            .update({ active: false })
            .eq('id', id)
            .eq('user_id', userId);

        if (error) throw error;
        console.log(`[Supplements] Removed: ${id}`);
        res.json({ deleted: true });
    } catch (err) {
        console.error('[Supplements] Delete failed:', err.message);
        sendError(res, err);
    }
});

export default router;