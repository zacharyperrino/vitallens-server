// ─── VitalLens Context Builder ────────────────────────────────
// Shared service that aggregates all health data into a
// structured snapshot for Claude correlation + prediction.
// Used by: health-copilot, correlation-engine, weekly-report.

import { Redis } from "@upstash/redis";
import { supabase } from '../db/supabase.js';
import { daysAgo, daysAgoISO, todayISO } from '../utils/dates.js';

// The snapshot cache is optional: without Upstash credentials every AI
// request rebuilds the snapshot from Supabase (slower, still correct).
const redis = (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
    ? new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN })
    : null;

const CACHE_TTL_SECONDS = 300;

function cacheKey(userId, window) {
    return `context:${userId}:${window}`;
}

const WINDOWS = [7, 30];

export async function invalidateContextCache(userId) {
    try {
        // Only two windows exist; delete them directly (KEYS is O(keyspace)).
        if (!redis) return;
        await redis.del(...WINDOWS.map(w => cacheKey(userId, w)));
        console.log(`[ContextCache] Invalidated for ${userId.slice(0, 8)}`);
    } catch (err) {
        console.warn('[ContextCache] Invalidation failed (non-blocking):', err.message);
    }
}

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
        if (ratio < 0.85) gaps.push({ name, actual: Math.round(actual), target: Math.round(targetValue), unit, status: 'below', note: `Below target by ${Math.round((1 - ratio) * 100)}%.` });
        else if (ratio > 1.15) gaps.push({ name, actual: Math.round(actual), target: Math.round(targetValue), unit, status: 'above', note: `Above target by ${Math.round((ratio - 1) * 100)}%.` });
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
            gaps.push({ marker, panel: panel.panel_type, status, value: data.value, unit: data.unit,
                note: status === 'low' ? 'This marker is below the expected range.' : 'This marker is above the expected range.' });
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
    const addMatch = (supplement, reason, currentlyTaking) => results.push({ supplement, reason, currentlyTaking });
    nutritionGaps.forEach(gap => {
        if (gap.name === 'Protein') addMatch('Protein support', 'Protein intake is below target.', profile.protein);
        if (gap.name === 'Fiber') addMatch('Fiber support', 'Fiber intake is below target.', supplementNames.some(name => name.includes('fiber')));
        if (gap.name === 'Calories') addMatch('Caloric support', 'Calories are outside the target range.', false);
    });
    labGaps.forEach(gap => {
        const key = normalizeName(gap.marker);
        if (/(vitamin d|d3)/.test(key)) addMatch('Vitamin D', 'Low vitamin D may benefit from D3 supplementation.', profile.vitaminD);
        else if (/(iron|ferritin)/.test(key)) addMatch('Iron', 'Low iron markers may benefit from iron supplementation.', profile.iron);
        else if (/magnesium/.test(key)) addMatch('Magnesium', 'Low magnesium may support muscle and sleep recovery.', profile.magnesium);
        else if (/(b12|cobalamin)/.test(key)) addMatch('Vitamin B12', 'Low B12 may benefit from supplementation.', supplementNames.some(name => /(b12|cobalamin)/.test(name)));
    });
    return results;
}

function buildInteractionWarnings(supplements) {
    const names = supplements.map(s => normalizeName(s.name));
    const has = term => names.some(name => name.includes(term));
    const warnings = [];
    if (has('iron') && (has('calcium') || has('zinc') || has('magnesium'))) warnings.push({ note: 'Iron absorption may be reduced when taken with calcium, zinc, or magnesium.' });
    if (has('vitamin d') && has('k2')) warnings.push({ note: 'Vitamin D and K2 are a good synergistic pair for calcium metabolism.' });
    if (has('magnesium') && has('zinc')) warnings.push({ note: 'Magnesium and zinc may compete for absorption when taken simultaneously.' });
    if (has('magnesium') && has('melatonin')) warnings.push({ note: 'Magnesium plus melatonin can support sleep quality if taken in the evening.' });
    return warnings;
}

function buildGapAnalysis(supplements, dailyNutrition, todayNutrition, labResults, profile) {
    const nutritionGaps = buildNutritionGaps(dailyNutrition, todayNutrition, profile);
    const labGaps = analyzeLabGaps(labResults);
    const supplementMatches = buildSupplementRecommendations(supplements, nutritionGaps, labGaps);
    const interactionWarnings = buildInteractionWarnings(supplements);
    const summaryParts = [];
    if (nutritionGaps.length) summaryParts.push(`Nutrition gaps detected in ${nutritionGaps.map(g => g.name).join(', ')}.`);
    if (labGaps.length) summaryParts.push(`Labs flagged ${labGaps.map(g => g.marker).join(', ')}.`);
    if (supplementMatches.length) summaryParts.push(`${supplementMatches.filter(m => m.currentlyTaking).length} current supplement(s) appear to align with identified gaps.`);
    if (interactionWarnings.length) summaryParts.push('Supplement interaction warnings were detected.');
    if (!summaryParts.length) summaryParts.push('No major supplement gaps or interactions were detected from available nutrition and lab data.');
    return { summary: summaryParts.join(' '), nutritionGaps, labGaps, supplementMatches, interactionWarnings };
}

function trendVector(values) {
    if (!values || values.length < 3) return "insufficient_data";
    const half = Math.floor(values.length / 2);
    const firstHalf = values.slice(0, half).reduce((a, b) => a + b, 0) / half;
    const secondHalf = values.slice(half).reduce((a, b) => a + b, 0) / (values.length - half);
    const delta = secondHalf - firstHalf;
    const pct = Math.abs(delta) / (firstHalf || 1);
    if (pct < 0.05) return "stable";
    return delta > 0 ? "improving" : "declining";
}

export async function buildFullContext(userId, options = {}) {
    const { window = 30 } = options;

    const key = cacheKey(userId, window);
    try {
        const cached = redis ? await redis.get(key) : null;
        if (cached) {
            console.log(`[ContextCache] HIT for ${userId.slice(0, 8)} (${window}d window)`);
            return typeof cached === 'string' ? JSON.parse(cached) : cached;
        }
    } catch (err) {
        console.warn('[ContextCache] Redis read failed (non-blocking):', err.message);
    }

    // Single-flight: if another request is already building this snapshot,
    // wait briefly for it instead of firing 15 more queries.
    const lockKey = `${key}:lock`;
    let gotLock = false;
    try {
        gotLock = redis ? (await redis.set(lockKey, '1', { nx: true, ex: 20 })) === 'OK' : false;
        if (!gotLock) {
            for (let i = 0; redis && i < 20; i++) {
                await new Promise(r => setTimeout(r, 250));
                const cached = await redis.get(key);
                if (cached) return typeof cached === 'string' ? JSON.parse(cached) : cached;
            }
        }
    } catch { /* Redis optional — fall through and build */ }

    try {
        return await buildSnapshot(userId, window, key);
    } finally {
        // Release whether the build threw, the cache write failed, or it succeeded.
        if (gotLock && redis) await redis.del(lockKey).catch(() => {});
    }
}

async function buildSnapshot(userId, window, key) {
    console.log(`[ContextCache] MISS for ${userId.slice(0, 8)} — building from Supabase`);

    // "Today" is the user's calendar day when profiles.timezone is set,
    // server-local otherwise (the convention the `date` columns use).
    let tz = 'local';
    try {
        const { data } = await supabase.from("profiles").select("timezone").eq("id", userId).maybeSingle();
        if (data?.timezone) tz = data.timezone;
    } catch { /* fall back to server-local */ }

    const today = todayISO(tz);
    const sevenDaysAgo = daysAgo(7).toISOString();
    const windowStart = daysAgo(window).toISOString();
    const ninetyStart = daysAgo(90).toISOString();

    const [
        profileRes, supplementsRes, labResultsRes, tcmProfileRes,
        todayNutritionRes, biomarkerScansRes, environmentRes,
        recentNutritionRes, recentMealsRes, recentSleepRes, recentExerciseRes,
        olderNutritionRes, olderSleepRes, olderExerciseRes, hygieneRes,
    ] = await Promise.allSettled([
        supabase.from("health_profile").select("*").eq("user_id", userId).single(),
        supabase.from("supplement_logs").select("name, dose, frequency").eq("user_id", userId).eq("active", true),
        supabase.from("lab_results").select("panel_type, markers, collected_at").eq("user_id", userId).order("collected_at", { ascending: false }).limit(5),
        supabase.from("tcm_profile").select("*").eq("user_id", userId).single(),
        supabase.from("daily_nutrition").select("*").eq("user_id", userId).eq("date", today).single(),
        supabase.from("biomarker_scans").select("scan_type, score, risk_tier, scanned_at").eq("user_id", userId).gte("scanned_at", ninetyStart).order("scanned_at", { ascending: true }),
        supabase.from("environment_logs").select("location, aqi, aqi_category, pm2_5, uv_index, water_risk, logged_at").eq("user_id", userId).order("logged_at", { ascending: false }).limit(7),
        // Tier 1 — last 7 days full detail
        supabase.from("daily_nutrition").select("date, calories, protein, carbs, fat, fiber").eq("user_id", userId).gte("date", daysAgoISO(7, tz)).order("date", { ascending: true }),
        supabase.from("meals").select("name, calories, protein, carbs, fat, fiber, logged_at").eq("user_id", userId).gte("logged_at", sevenDaysAgo).order("logged_at", { ascending: false }).limit(20),
        supabase.from("sleep_log").select("hours, quality, bedtime, sleep_latency_min, wakeups, date").eq("user_id", userId).gte("date", daysAgoISO(7, tz)).order("date", { ascending: true }),
        supabase.from("exercise_log").select("type, name, duration, intensity, rpe, logged_at").eq("user_id", userId).gte("logged_at", sevenDaysAgo).order("logged_at", { ascending: false }),
        // Tier 2 — days 8-30, aggregated
        supabase.from("daily_nutrition").select("date, calories, protein, carbs, fat, fiber").eq("user_id", userId).gte("date", daysAgoISO(window, tz)).lt("date", daysAgoISO(7, tz)).order("date", { ascending: true }),
        supabase.from("sleep_log").select("hours, quality, date").eq("user_id", userId).gte("date", daysAgoISO(window, tz)).lt("date", daysAgoISO(7, tz)).order("date", { ascending: true }),
        supabase.from("exercise_log").select("type, duration, logged_at").eq("user_id", userId).gte("logged_at", windowStart).lt("logged_at", sevenDaysAgo),
        supabase.from("hygiene_scans").select("product_name, brand, safety_score, concerns, scanned_at").eq("user_id", userId).gte("scanned_at", sevenDaysAgo).order("scanned_at", { ascending: false }).limit(10),
    ]);

    const profile = profileRes.status === "fulfilled" ? profileRes.value.data : null;
    const supplements = supplementsRes.status === "fulfilled" ? supplementsRes.value.data || [] : [];
    const labResults = labResultsRes.status === "fulfilled" ? labResultsRes.value.data || [] : [];
    const tcmProfile = tcmProfileRes.status === "fulfilled" ? tcmProfileRes.value.data : null;
    const todayNutrition = todayNutritionRes.status === "fulfilled" ? todayNutritionRes.value.data : null;
    const biomarkerScans = biomarkerScansRes.status === "fulfilled" ? biomarkerScansRes.value.data || [] : [];
    const envData = environmentRes.status === "fulfilled" ? environmentRes.value.data || [] : [];

    const recentNutrition = recentNutritionRes.status === "fulfilled" ? recentNutritionRes.value.data || [] : [];
    const meals = recentMealsRes.status === "fulfilled" ? recentMealsRes.value.data || [] : [];
    const recentSleep = recentSleepRes.status === "fulfilled" ? recentSleepRes.value.data || [] : [];
    const recentExercise = recentExerciseRes.status === "fulfilled" ? recentExerciseRes.value.data || [] : [];

    const olderNutrition = olderNutritionRes.status === "fulfilled" ? olderNutritionRes.value.data || [] : [];
    const olderSleep = olderSleepRes.status === "fulfilled" ? olderSleepRes.value.data || [] : [];
    const olderExercise = olderExerciseRes.status === "fulfilled" ? olderExerciseRes.value.data || [] : [];
    const hygiene = hygieneRes.status === "fulfilled" ? hygieneRes.value.data || [] : [];

    const dailyNutrition = [...olderNutrition, ...recentNutrition];
    const sleepData = [...olderSleep, ...recentSleep];

    const olderNutritionSummary = olderNutrition.length > 0 ? {
        avgCalories: Math.round(olderNutrition.reduce((s, d) => s + (d.calories || 0), 0) / olderNutrition.length),
        avgProtein: Math.round(olderNutrition.reduce((s, d) => s + (d.protein || 0), 0) / olderNutrition.length),
        avgFiber: Math.round(olderNutrition.reduce((s, d) => s + (d.fiber || 0), 0) / olderNutrition.length),
        daysLogged: olderNutrition.length,
    } : null;

    const olderSleepSummary = olderSleep.length > 0 ? {
        avgHours: (olderSleep.reduce((s, e) => s + (e.hours || 0), 0) / olderSleep.length).toFixed(1),
        nightsLogged: olderSleep.length,
    } : null;

    const olderExerciseSummary = olderExercise.length > 0 ? {
        totalSessions: olderExercise.length,
        totalMinutes: olderExercise.reduce((s, e) => s + (parseInt(e.duration) || 0), 0),
    } : null;

    const daysLogged = recentNutrition.length;
    const avgCalories = daysLogged > 0 ? Math.round(recentNutrition.reduce((s, d) => s + d.calories, 0) / daysLogged) : 0;
    const avgProtein = daysLogged > 0 ? Math.round(recentNutrition.reduce((s, d) => s + d.protein, 0) / daysLogged) : 0;
    const avgFiber = daysLogged > 0 ? Math.round(recentNutrition.reduce((s, d) => s + d.fiber, 0) / daysLogged) : 0;
    const calorieTarget = profile?.target_calories || 2000;
    const proteinTarget = profile?.target_protein || 120;

    const sleepNights = recentSleep.length;
    const avgSleepHours = sleepNights > 0 ? (recentSleep.reduce((s, e) => s + (e.hours || 0), 0) / sleepNights).toFixed(1) : null;
    const avgSleepLatency = recentSleep.filter(e => e.sleep_latency_min).length > 0
        ? Math.round(recentSleep.filter(e => e.sleep_latency_min).reduce((s, e) => s + e.sleep_latency_min, 0) / recentSleep.filter(e => e.sleep_latency_min).length) : null;
    const bedtimes = recentSleep.filter(e => e.bedtime).map(e => { const [h, m] = e.bedtime.split(":").map(Number); return h * 60 + m; });
    const bedtimeConsistency = bedtimes.length >= 3 ? (() => {
        const avg = bedtimes.reduce((a, b) => a + b, 0) / bedtimes.length;
        const stdDev = Math.sqrt(bedtimes.reduce((s, t) => s + Math.pow(t - avg, 2), 0) / bedtimes.length);
        return stdDev <= 20 ? "consistent" : stdDev <= 45 ? "moderate" : "inconsistent";
    })() : "insufficient_data";

    const exerciseSessions = recentExercise.length;
    const totalExerciseMins = recentExercise.reduce((s, e) => s + (parseInt(e.duration) || 0), 0);
    const liftSessions = recentExercise.filter(e => e.type === "Weight Training").length;

    const scanTypes = [...new Set(biomarkerScans.map(s => s.scan_type))];
    const scanSummary = scanTypes.map(type => {
        const typScans = biomarkerScans.filter(s => s.scan_type === type);
        const scores = typScans.map(s => s.score).filter(Boolean);
        const latest = typScans[typScans.length - 1];
        return { type, latestScore: latest?.score, latestRisk: latest?.risk_tier, totalDelta: scores.length >= 2 ? scores[scores.length - 1] - scores[0] : null, trend: trendVector(scores), scanCount: typScans.length };
    });

    const latestEnv = envData[0] || null;
    const avgAQI = envData.filter(e => e.aqi).length > 0 ? Math.round(envData.filter(e => e.aqi).reduce((s, e) => s + e.aqi, 0) / envData.filter(e => e.aqi).length) : null;
    const highAQIDays = envData.filter(e => e.aqi > 100).length;

    const flaggedMarkers = [];
    labResults.forEach(panel => {
        Object.entries(panel.markers || {}).forEach(([name, data]) => {
            if (["low", "high", "critical"].includes(data.status)) {
                flaggedMarkers.push({ name, value: data.value, unit: data.unit, status: data.status, panel: panel.panel_type });
            }
        });
    });

    const snapshot = {
        generatedAt: new Date().toISOString(),
        window,
        userId,
        profile: profile ? { age: profile.age, sex: profile.sex, weight_kg: profile.weight_kg, goal: profile.goal, targets: { calories: profile.target_calories, protein: profile.target_protein, carbs: profile.target_carbs, fat: profile.target_fat, fiber: profile.target_fiber }, bmr: profile.bmr, tdee: profile.tdee } : null,
        today: todayNutrition ? { calories: Math.round(todayNutrition.calories), protein: Math.round(todayNutrition.protein), carbs: Math.round(todayNutrition.carbs), fat: Math.round(todayNutrition.fat), fiber: Math.round(todayNutrition.fiber), calPct: calorieTarget ? Math.round((todayNutrition.calories / calorieTarget) * 100) : null } : null,
        nutrition: { daysLogged, avgCalories, avgProtein, avgFiber, avgCalPct: calorieTarget ? Math.round((avgCalories / calorieTarget) * 100) : null, avgProtPct: proteinTarget ? Math.round((avgProtein / proteinTarget) * 100) : null, calorieTrend: trendVector(dailyNutrition.map(d => d.calories)), proteinTrend: trendVector(dailyNutrition.map(d => d.protein)), recentMeals: meals.slice(0, 10).map(m => ({ name: m.name, calories: Math.round(m.calories), protein: Math.round(m.protein), date: m.logged_at })) },
        sleep: { nightsLogged: sleepNights, avgHours: avgSleepHours, avgLatencyMin: avgSleepLatency, bedtimeConsistency, trend: trendVector(sleepData.map(e => e.hours || 0)), recentLog: recentSleep.slice(-7) },
        exercise: { totalSessions: exerciseSessions, totalMinutes: totalExerciseMins, liftSessions, cardioSessions: exerciseSessions - liftSessions, recentSessions: recentExercise.slice(0, 7) },
        biomarkers: { totalScans: biomarkerScans.length, byType: scanSummary },
        supplements: {
            active: supplements.map(s => ({ name: s.name, dose: s.dose, frequency: s.frequency })),
            gapAnalysis: buildGapAnalysis(supplements, dailyNutrition, todayNutrition, labResults, profile),
        },
        environment: { latestLocation: latestEnv?.location, latestAQI: latestEnv?.aqi, latestAQICategory: latestEnv?.aqi_category, avgAQI, highAQIDays, waterRisk: latestEnv?.water_risk },
        labs: { panelsCount: labResults.length, flaggedMarkers, mostRecentPanel: labResults[0]?.panel_type || null },
        hygiene,
        tcm: tcmProfile ? { constitution: tcmProfile.constitution, totalFoodsAnalyzed: tcmProfile.total_foods_analyzed } : null,
        olderPeriodSummary: {
            nutrition: olderNutritionSummary,
            sleep: olderSleepSummary,
            exercise: olderExerciseSummary,
        },
    };

    try {
        if (redis) await redis.set(key, JSON.stringify(snapshot), { ex: CACHE_TTL_SECONDS });
        console.log(`[ContextCache] SET for ${userId.slice(0, 8)} (${window}d, TTL ${CACHE_TTL_SECONDS}s)`);
    } catch (err) {
        console.warn('[ContextCache] Redis write failed (non-blocking):', err.message);
    }

    return snapshot;
}

export function snapshotToText(s) {
    let t = "HEALTH SNAPSHOT (" + s.window + " days, " + s.generatedAt.split("T")[0] + ")\n\n";
    if (s.profile) t += "PROFILE: " + s.profile.age + "yo " + s.profile.sex + ", " + s.profile.weight_kg + "kg, goal: " + (s.profile.goal || "").replace(/_/g, " ") + "\nTARGETS: " + s.profile.targets.calories + "cal / " + s.profile.targets.protein + "g protein / " + s.profile.targets.fiber + "g fiber\n\n";
    if (s.today) t += "TODAY: " + s.today.calories + "cal (" + s.today.calPct + "% target) / " + s.today.protein + "g protein / " + s.today.carbs + "g carbs\n\n";
    const n = s.nutrition;
    t += "NUTRITION — LAST 7 DAYS (" + n.daysLogged + " days): avg " + n.avgCalories + "cal (" + n.avgCalPct + "% target, " + n.calorieTrend + "), avg " + n.avgProtein + "g protein (" + n.avgProtPct + "%, " + n.proteinTrend + "), avg " + n.avgFiber + "g fiber\n\n";
    if (s.olderPeriodSummary) {
        const op = s.olderPeriodSummary;
        if (op.nutrition) t += "PRIOR PERIOD SUMMARY (days 8-30): avg " + op.nutrition.avgCalories + "cal, avg " + op.nutrition.avgProtein + "g protein (" + op.nutrition.daysLogged + " days logged)\n";
        if (op.sleep) t += "PRIOR SLEEP (days 8-30): avg " + op.sleep.avgHours + "h (" + op.sleep.nightsLogged + " nights)\n";
        if (op.exercise) t += "PRIOR EXERCISE (days 8-30): " + op.exercise.totalSessions + " sessions, " + op.exercise.totalMinutes + " min total\n";
        t += "\n";
    }
    const sl = s.sleep;
    if (sl.nightsLogged > 0) t += "SLEEP — LAST 7 DAYS (" + sl.nightsLogged + " nights): avg " + sl.avgHours + "h (" + sl.trend + "), latency " + (sl.avgLatencyMin || "?") + "min, bedtime " + sl.bedtimeConsistency + "\n\n";
    const ex = s.exercise;
    if (ex.totalSessions > 0) t += "EXERCISE — LAST 7 DAYS: " + ex.totalSessions + " sessions (" + ex.liftSessions + " resistance, " + ex.cardioSessions + " cardio), " + ex.totalMinutes + " min total\n\n";
    if (s.supplements.active.length > 0) t += "SUPPLEMENTS: " + s.supplements.active.map(x => x.name + (x.dose ? " " + x.dose : "")).join(", ") + "\n\n";
    if (s.supplements.gapAnalysis) {
        t += "SUPPLEMENT GAP ANALYSIS: " + s.supplements.gapAnalysis.summary + "\n";
        if (s.supplements.gapAnalysis.nutritionGaps.length > 0) t += "Nutrition gaps: " + s.supplements.gapAnalysis.nutritionGaps.map(g => `${g.name} ${g.status} (${g.actual}${g.unit}/${g.target}${g.unit})`).join("; ") + "\n";
        if (s.supplements.gapAnalysis.labGaps.length > 0) t += "Lab flags: " + s.supplements.gapAnalysis.labGaps.map(g => `${g.marker} ${g.status}`).join("; ") + "\n";
        if (s.supplements.gapAnalysis.interactionWarnings.length > 0) t += "Supplement warnings: " + s.supplements.gapAnalysis.interactionWarnings.map(w => w.note).join("; ") + "\n";
        t += "\n";
    }
    s.biomarkers.byType.forEach(sc => { t += "SCAN " + sc.type.toUpperCase() + ": score " + sc.latestScore + " (" + sc.latestRisk + " risk), trend " + sc.trend + (sc.totalDelta !== null ? ", total delta " + (sc.totalDelta > 0 ? "+" : "") + sc.totalDelta : "") + "\n"; });
    if (s.biomarkers.byType.length > 0) t += "\n";
    if (s.labs.flaggedMarkers.length > 0) t += "LAB FLAGS: " + s.labs.flaggedMarkers.map(m => m.name + " " + m.value + " " + (m.unit || "") + " (" + m.status + ")").join(", ") + "\n\n";
    if (s.environment.latestAQI) t += "ENVIRONMENT: AQI " + s.environment.latestAQI + " (" + s.environment.latestAQICategory + "), avg " + (s.environment.avgAQI || "?") + ", " + s.environment.highAQIDays + " high-AQI days\n\n";
    if (s.hygiene?.length > 0) t += "HYGIENE SCANS (last 7 days): " + s.hygiene.map(h => `${h.product_name} (score: ${h.safety_score})`).join(", ") + "\n\n";
    if (s.tcm) t += "TCM CONSTITUTION (" + s.tcm.totalFoodsAnalyzed + " foods): " + s.tcm.constitution + "\n\n";
    return t;
}