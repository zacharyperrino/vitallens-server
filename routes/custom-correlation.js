// ─── Custom Correlation Route ─────────────────────────────────
// POST /api/custom-correlation
// Body: { userId, variableA, variableB, days = 30 }
// Pulls two user data series, aligns them by date, and asks Claude
// Sonnet to describe any relationship in plain wellness language.

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

const SYSTEM_PROMPT = `You are a careful wellness pattern observer for VitalLens. You describe possible relationships between two logged lifestyle variables using plain, non-clinical language. You never diagnose, never name medical conditions, and you are honest about small sample sizes and weak or absent relationships.`;

// Text→number transforms for the free-text daily-wellness fields in `habits`.
// The app's habit form (pages/health-input.js) uses fixed select options, so
// map those exactly first, then fall back to numeric / fuzzy matching for any
// free-text or legacy variants.
const CAFFEINE_LEVELS = { none: 0, light: 1, moderate: 2, heavy: 3 };
const MOOD_LEVELS = { bad: 1, low: 2, neutral: 3, good: 4, great: 5 };

function caffeineToNum(v) {
    if (v == null) return NaN;
    const s = String(v).trim().toLowerCase();
    if (s in CAFFEINE_LEVELS) return CAFFEINE_LEVELS[s];
    const n = parseFloat(s);
    if (!Number.isNaN(n)) return n;              // "3", "2 cups"
    if (/(none|no\b|zero)/.test(s)) return 0;
    if (/(light|little)/.test(s)) return 1;
    if (/(mod|medium|some)/.test(s)) return 2;
    if (/(heavy|high|lots|a lot)/.test(s)) return 3;
    return NaN;
}
function moodToNum(v) {
    if (v == null) return NaN;
    const s = String(v).trim().toLowerCase();
    if (s in MOOD_LEVELS) return MOOD_LEVELS[s];
    const n = parseFloat(s);
    if (!Number.isNaN(n)) return n;              // already a 1-5 / 1-10 scale
    if (/(terrible|awful|very ?bad|depressed)/.test(s)) return 1;
    if (/(bad|poor|sad|down|anxious|stressed)/.test(s)) return 2;
    if (/(ok|okay|meh|neutral|fine|average)/.test(s)) return 3;
    if (/(good|happy|content|calm)/.test(s)) return 4;
    if (/(great|excellent|amazing|fantastic|energ)/.test(s)) return 5;
    return NaN;
}

// Which table/column each domain variable maps to, how to collapse multiple
// same-day entries into one daily value, and (where needed) a text→number
// transform or a row filter. Verified against the live schema.
const VARIABLE_MAP = {
    sleep:      { table: 'sleep_log',       value: 'hours',     dateCol: 'date',       agg: 'avg', label: 'sleep (hours)' },
    calories:   { table: 'daily_nutrition', value: 'calories',  dateCol: 'date',       agg: 'avg', label: 'calories' },
    exercise:   { table: 'exercise_log',    value: 'duration',  dateCol: 'logged_at',  agg: 'sum', label: 'exercise (minutes)' },
    water:      { table: 'water_log',       value: 'amount_ml', dateCol: 'logged_at',  agg: 'sum', label: 'water (ml)' },
    skin_score: { table: 'biomarker_scans', value: 'score',     dateCol: 'scanned_at', agg: 'avg', label: 'skin/face wellness score', filterIn: { column: 'scan_type', values: ['skin', 'face'] } },
    caffeine:   { table: 'habits',          value: 'caffeine',  dateCol: 'date',       agg: 'avg', label: 'caffeine (0-3 scale)', transform: caffeineToNum },
    mood:       { table: 'habits',          value: 'mood',      dateCol: 'date',       agg: 'avg', label: 'mood (1-5 scale)',    transform: moodToNum },
    steps:      { table: 'habits',          value: 'steps',     dateCol: 'date',       agg: 'sum', label: 'steps' },
};

function dayKey(ts) { return new Date(ts).toISOString().split('T')[0]; }
function round(n) { return Math.round(n * 10) / 10; }

// Returns a { 'YYYY-MM-DD': number } map, {} on query error, or null
// when the variable name is unknown (not in VARIABLE_MAP).
async function pullSeries(variable, userId, sinceIso) {
    const map = VARIABLE_MAP[variable];
    if (!map) return null;

    const dateFilter = map.dateCol === 'date' ? sinceIso.split('T')[0] : sinceIso;
    const selectCols = map.filterIn
        ? `${map.value}, ${map.dateCol}, ${map.filterIn.column}`
        : `${map.value}, ${map.dateCol}`;

    let query = supabase
        .from(map.table)
        .select(selectCols)
        .eq('user_id', userId)
        .gte(map.dateCol, dateFilter);
    if (map.filterIn) query = query.in(map.filterIn.column, map.filterIn.values);

    const { data, error } = await query;
    if (error) {
        console.warn(`[CustomCorr] pull ${variable} failed:`, error.message);
        return {};
    }

    const buckets = {};
    for (const row of data || []) {
        const day = dayKey(row[map.dateCol]);
        const val = map.transform ? map.transform(row[map.value]) : Number(row[map.value]);
        if (Number.isNaN(val)) continue;
        (buckets[day] ||= []).push(val);
    }
    const series = {};
    for (const [day, vals] of Object.entries(buckets)) {
        series[day] = map.agg === 'sum'
            ? vals.reduce((a, b) => a + b, 0)
            : vals.reduce((a, b) => a + b, 0) / vals.length;
    }
    return series;
}

router.post('/custom-correlation', requireSelf('userId'), async (req, res) => {
    try {
        if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'Anthropic API key not configured.' });
        const { userId, variableA, variableB, days = 30 } = req.body;
        if (!variableA || !variableB) return res.status(400).json({ error: 'variableA and variableB are required.' });

        const windowDays = Math.min(Math.max(parseInt(days, 10) || 30, 7), 180);
        const since = new Date(Date.now() - windowDays * 86400000);
        since.setHours(0, 0, 0, 0);
        const sinceIso = since.toISOString();

        const [seriesA, seriesB] = await Promise.all([
            pullSeries(variableA, userId, sinceIso),
            pullSeries(variableB, userId, sinceIso),
        ]);

        // null means an unknown variable name (not in VARIABLE_MAP).
        if (seriesA === null || seriesB === null) {
            const unknown = [seriesA === null ? variableA : null, seriesB === null ? variableB : null].filter(Boolean);
            return res.status(400).json({
                error: `Unknown variable: ${unknown.join(', ')}. Supported: ${Object.keys(VARIABLE_MAP).join(', ')}.`,
            });
        }

        // Align by shared dates.
        const sharedDays = Object.keys(seriesA).filter(d => d in seriesB).sort();
        const aligned = sharedDays.map(d => ({ date: d, a: round(seriesA[d]), b: round(seriesB[d]) }));
        const dataPoints = aligned.length;

        if (dataPoints < 2) {
            return res.json({
                relationship: `There ${dataPoints === 1 ? 'is' : 'are'} only ${dataPoints} day(s) where both ${variableA} and ${variableB} were logged — not enough overlapping data to compare yet. Keep logging both.`,
                dataPoints,
                confidence: 'low',
            });
        }

        const mapA = VARIABLE_MAP[variableA], mapB = VARIABLE_MAP[variableB];
        const tableText = aligned.map(r => `${r.date}: ${mapA.label}=${r.a}, ${mapB.label}=${r.b}`).join('\n');

        const prompt = `A user wants to understand how two of their logged wellness variables relate over the last ${windowDays} days.

Variable A: ${variableA} (${mapA.label})
Variable B: ${variableB} (${mapB.label})

Aligned daily data (${dataPoints} overlapping days):
${tableText}

Describe any relationship you notice between these two variables in plain, supportive wellness language.
- State the sample size (${dataPoints} days) plainly.
- If there is not enough data or no clear relationship, say so explicitly — do not invent a pattern.
- No medical claims, no diagnosis, no conditions.
- Respond with 2-4 sentences of plain text only.`;

        const response = await fetchWithRetry(ANTHROPIC_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
            body: JSON.stringify({
                model: MODEL,
                max_tokens: 500,
                system: SYSTEM_PROMPT,
                messages: [{ role: 'user', content: prompt }],
            }),
            signal: AbortSignal.timeout(35000),
        }, { routeName: 'CustomCorrelation' });

        if (!response.ok) throw new Error(`Claude API error: ${response.status}`);
        const data = await response.json();

        await trackCost({
            userId,
            route: 'custom-correlation',
            model: MODEL,
            inputTokens: data.usage?.input_tokens || 0,
            outputTokens: data.usage?.output_tokens || 0,
            meta: { variableA, variableB, dataPoints },
        });

        const relationship = data.content?.filter(b => b.type === 'text').map(b => b.text).join('').trim()
            || 'No clear relationship could be determined from the available data.';

        // Confidence is a function of overlapping sample size only — the
        // model is asked to describe, not to assert statistical strength.
        const confidence = dataPoints >= 20 ? 'high' : dataPoints >= 8 ? 'moderate' : 'low';

        res.json({ relationship, dataPoints, confidence });
    } catch (err) {
        console.error('[CustomCorrelation] Failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

export default router;
