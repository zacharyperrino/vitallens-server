// ─── Early Patterns Route ─────────────────────────────────────
// GET /api/early-patterns?userId=
// Surfaces ONE low-confidence, clearly-labeled early observation
// after just 3 days of data, so new users get value before the full
// correlation engine has enough history. Uses Claude Haiku.

import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { requireSelf } from '../middleware/auth.js';
import { fetchWithRetry } from '../services/ai-fetch.js';
import { trackCost } from '../services/cost-tracker.js';
import dotenv from 'dotenv';
dotenv.config();

const router = Router();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001';

const EARLY_PATTERN_SYSTEM = `You are a gentle wellness journaling assistant for VitalLens. You surface a single, tentative early observation from very limited data. You are NOT diagnosing and NOT claiming a validated pattern. Use warm, non-clinical wellness language. Never name medical conditions. Never make medical claims.`;

function dayKey(ts) {
    return new Date(ts).toISOString().split('T')[0];
}

router.get('/early-patterns', requireSelf('userId'), async (req, res) => {
    try {
        if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'Anthropic API key not configured.' });
        const { userId } = req.query;

        const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);
        sevenDaysAgo.setHours(0, 0, 0, 0);
        const sinceIso = sevenDaysAgo.toISOString();
        const sinceDate = sinceIso.split('T')[0];

        const [mealsRes, sleepRes, exerciseRes, nutritionRes] = await Promise.all([
            supabase.from('meals').select('name, calories, logged_at').eq('user_id', userId).gte('logged_at', sinceIso),
            supabase.from('sleep_log').select('hours, quality, date').eq('user_id', userId).gte('date', sinceDate),
            supabase.from('exercise_log').select('type, duration, logged_at').eq('user_id', userId).gte('logged_at', sinceIso),
            supabase.from('daily_nutrition').select('calories, protein, carbs, fat, date').eq('user_id', userId).gte('date', sinceDate),
        ]);

        const meals = mealsRes.data || [];
        const sleep = sleepRes.data || [];
        const exercise = exerciseRes.data || [];
        const nutrition = nutritionRes.data || [];

        // Count distinct days that have ANY data across the four sources.
        const days = new Set();
        meals.forEach(m => days.add(dayKey(m.logged_at)));
        sleep.forEach(s => s.date && days.add(s.date));
        exercise.forEach(e => days.add(dayKey(e.logged_at)));
        nutrition.forEach(n => n.date && days.add(n.date));
        const dataPoints = days.size;

        if (dataPoints < 3) {
            return res.json({ ready: false, message: 'Keep logging — patterns appear after 3 days' });
        }

        const summary = [
            `Distinct days with data: ${dataPoints}`,
            `Meals: ` + (meals.map(m => `${dayKey(m.logged_at)} ${m.name}${m.calories ? ` (${Math.round(m.calories)}cal)` : ''}`).join('; ') || 'none'),
            `Daily nutrition totals: ` + (nutrition.map(n => `${n.date}: ${Math.round(n.calories || 0)}cal`).join('; ') || 'none'),
            `Sleep: ` + (sleep.map(s => `${s.date}: ${s.hours}h ${s.quality || ''}`.trim()).join('; ') || 'none'),
            `Exercise: ` + (exercise.map(e => `${dayKey(e.logged_at)}: ${e.type} ${e.duration || '?'}min`).join('; ') || 'none'),
        ].join('\n');

        const prompt = `Here is a new user's wellness log covering ${dataPoints} days:

${summary}

Find ONE simple, tentative early observation connecting two of these areas (for example: "On the 2 days you logged 3+ coffees, your sleep was shorter").

Requirements:
- Base it only on what is visible in this small dataset.
- Label it EXPLICITLY as an early observation, not a validated pattern (e.g. begin with "Early observation:" and note it is based on only a few days).
- Use gentle wellness language — no medical claims, no conditions, no diagnosis.
- If nothing stands out, offer an encouraging note about continuing to log.
- Respond with 1-2 sentences of plain text only. No JSON, no preamble.`;

        const response = await fetchWithRetry(ANTHROPIC_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
            body: JSON.stringify({
                model: MODEL,
                max_tokens: 300,
                system: EARLY_PATTERN_SYSTEM,
                messages: [{ role: 'user', content: prompt }],
            }),
            signal: AbortSignal.timeout(20000),
        }, { routeName: 'EarlyPatterns' });

        if (!response.ok) throw new Error(`Claude API error: ${response.status}`);
        const data = await response.json();

        await trackCost({
            userId,
            route: 'early-patterns',
            model: MODEL,
            inputTokens: data.usage?.input_tokens || 0,
            outputTokens: data.usage?.output_tokens || 0,
            meta: { dataPoints },
        });

        const insight = data.content?.filter(b => b.type === 'text').map(b => b.text).join('').trim()
            || 'Keep logging — more observations appear as your history grows.';

        res.json({ ready: true, insight, confidence: 'low', dataPoints });
    } catch (err) {
        console.error('[EarlyPatterns] Failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

export default router;
