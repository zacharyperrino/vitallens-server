// Food-scan accuracy eval.
// For each case in evals/meals/<name>/ (photo.jpg + expected.json), runs the
// real /api/vision-scan + /api/nutrition/search pipeline and reports:
// item recall (missed/extra), grams MAE on matched items, calorie MAE.
// Requires the API server running. Usage: npm run eval:food

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env.test'), override: true });

const API = process.env.EVAL_API_BASE || 'http://localhost:3001';
const MEALS_DIR = join(__dirname, 'meals');

const norm = s => (s || '').toLowerCase().replace(/[_-]/g, ' ')
    .replace(/\b(grilled|fried|steamed|baked|raw|roasted|sauteed|boiled|pan|seared|cooked|fresh)\b/g, '')
    .split(/\s+/).filter(Boolean);

function isMatch(a, b) {
    const ta = new Set(norm(a)), tb = new Set(norm(b));
    if (!ta.size || !tb.size) return false;
    const overlap = [...ta].filter(t => tb.has(t)).length;
    return overlap / Math.min(ta.size, tb.size) >= 0.5;
}

async function caloriesFor(label, grams, token) {
    const res = await fetch(`${API}/api/nutrition/search?query=${encodeURIComponent(label)}&grams=${grams}`,
        { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) return (await res.json()).calories || 0;
    return Math.round(grams * 1.5); // same generic fallback as the client
}

async function runCase(dir, token) {
    const expected = JSON.parse(readFileSync(join(dir, 'expected.json'), 'utf-8'));
    const photo = ['photo.jpg', 'photo.jpeg', 'photo.png'].map(f => join(dir, f)).find(existsSync);
    if (!photo) throw new Error('no photo.jpg/jpeg/png');

    const form = new FormData();
    form.append('image', new Blob([readFileSync(photo)], { type: 'image/jpeg' }), 'photo.jpg');
    const res = await fetch(`${API}/api/vision-scan`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form,
    });
    if (!res.ok) throw new Error(`vision-scan ${res.status}: ${(await res.text()).slice(0, 120)}`);
    const { detections = [] } = await res.json();

    const matched = [], missed = [];
    const unclaimed = [...detections];
    for (const exp of expected.items) {
        const i = unclaimed.findIndex(d => isMatch(d.label, exp.label));
        if (i === -1) { missed.push(exp.label); continue; }
        matched.push({ exp, det: unclaimed.splice(i, 1)[0] });
    }
    const extra = unclaimed.map(d => d.label);

    const gramsErrs = matched.map(m => Math.abs(m.det.estimated_grams - m.exp.grams));
    let totalCal = 0;
    for (const d of detections) totalCal += await caloriesFor(d.label, d.estimated_grams, token);

    return {
        matched: matched.length, missed, extra,
        gramsMAE: gramsErrs.length ? Math.round(gramsErrs.reduce((a, b) => a + b) / gramsErrs.length) : null,
        pipelineCal: totalCal, expectedCal: expected.total_calories,
        calErr: Math.abs(totalCal - expected.total_calories),
    };
}

const cases = existsSync(MEALS_DIR)
    ? readdirSync(MEALS_DIR, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => join(MEALS_DIR, d.name))
    : [];
if (!cases.length) {
    console.log(`No eval cases found. Add cases under server/evals/meals/ — see evals/meals/README.md`);
    process.exit(0);
}

const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const { data, error } = await anon.auth.signInWithPassword({
    email: process.env.TEST_USER_A_EMAIL, password: process.env.TEST_USER_A_PASSWORD,
});
if (error) { console.error('Sign-in failed:', error.message); process.exit(1); }
const token = data.session.access_token;

const results = [];
for (const dir of cases) {
    const name = dir.split('/').pop();
    try {
        const r = await runCase(dir, token);
        results.push(r);
        console.log(`\n── ${name} ──`);
        console.log(`  items: ${r.matched} matched | missed: ${r.missed.join(', ') || 'none'} | extra: ${r.extra.join(', ') || 'none'}`);
        console.log(`  grams MAE (matched): ${r.gramsMAE ?? 'n/a'}g`);
        console.log(`  calories: pipeline ${r.pipelineCal} vs expected ${r.expectedCal} (err ${r.calErr})`);
    } catch (e) {
        console.error(`\n── ${name} ── FAILED: ${e.message}`);
    }
}

if (results.length) {
    const mean = arr => Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
    console.log(`\n═══ AGGREGATE (${results.length} cases) ═══`);
    console.log(`  calorie MAE: ${mean(results.map(r => r.calErr))} kcal`);
    console.log(`  calorie MAPE: ${mean(results.map(r => (r.calErr / r.expectedCal) * 100))}%`);
    console.log(`  missed items/case: ${(results.reduce((a, r) => a + r.missed.length, 0) / results.length).toFixed(1)}`);
    console.log(`  extra items/case: ${(results.reduce((a, r) => a + r.extra.length, 0) / results.length).toFixed(1)}`);
}
