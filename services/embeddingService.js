// ─── Embedding Service ────────────────────────────────────────
// Converts health events into text descriptions, then embeds
// them using OpenAI text-embedding-3-small.
// Called by the event ingestion service after every data write.

import dotenv from 'dotenv';
dotenv.config();

const OPENAI_EMBED_URL = 'https://api.openai.com/v1/embeddings';
const EMBED_MODEL = 'text-embedding-3-small'; // 1536 dims, cheap & accurate

// ── Core embedding call ───────────────────────────────────────

/**
 * Get an embedding vector for a text string.
 * @param {string} text
 * @returns {number[]} — 1536-dimensional vector
 */
export async function embed(text) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY not set');

    const res = await fetch(OPENAI_EMBED_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: EMBED_MODEL,
            input: text.slice(0, 8000), // model max is ~8k tokens
        }),
        signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `Embedding API error: ${res.status}`);
    }

    const data = await res.json();
    return data.data[0].embedding;
}

// ── Description builders ──────────────────────────────────────
// These build the human-readable text that gets embedded.
// The richer and more specific the description, the better
// the similarity search will work across your health history.

export function buildMealDescription(meal) {
    const foods = Array.isArray(meal.foods)
        ? meal.foods.map(f => `${f.name} (${f.grams || '?'}g)`).join(', ')
        : meal.name || 'meal';

    const parts = [
        `Meal logged: ${foods}.`,
        meal.calories && `Calories: ${Math.round(meal.calories)}kcal.`,
        meal.protein && `Protein: ${Math.round(meal.protein)}g.`,
        meal.carbs && `Carbs: ${Math.round(meal.carbs)}g.`,
        meal.fat && `Fat: ${Math.round(meal.fat)}g.`,
        meal.fiber && `Fiber: ${Math.round(meal.fiber)}g.`,
        meal.healthRating && `Health rating: ${meal.healthRating}/100.`,
        meal.meal_context && `Meal context: ${meal.meal_context}.`,
    ].filter(Boolean);

    return parts.join(' ');
}

export function buildBodyScanDescription(scan) {
    const parts = [
        `Body scan (${scan.scan_type || scan.type}).`,
        scan.overall_score != null && `Overall score: ${scan.overall_score}/100.`,
        scan.hr && `Heart rate: ${scan.hr} bpm.`,
        scan.hrv && `HRV: ${scan.hrv}ms.`,
        scan.risk_tier && `Risk tier: ${scan.risk_tier}.`,
        scan.confidence != null && `Confidence: ${Math.round(scan.confidence * 100)}%.`,
    ].filter(Boolean);

    // Include results object if present
    if (scan.results && typeof scan.results === 'object') {
        const resultParts = Object.entries(scan.results)
            .slice(0, 5) // limit verbosity
            .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
        if (resultParts.length) parts.push('Results: ' + resultParts.join(', ') + '.');
    }

    return parts.join(' ');
}

export function buildHrDescription(reading) {
    return [
        `Heart rate reading: ${reading.hr} bpm.`,
        reading.hrv && `HRV: ${reading.hrv}ms.`,
        reading.quality && `Signal quality: ${reading.quality}.`,
        reading.confidence != null && `Confidence: ${Math.round(reading.confidence * 100)}%.`,
    ].filter(Boolean).join(' ');
}

export function buildExerciseDescription(entry) {
    return [
        `Exercise: ${entry.name || entry.type || 'workout'}.`,
        entry.duration && `Duration: ${entry.duration} minutes.`,
        entry.intensity && `Intensity: ${entry.intensity}.`,
        entry.calories && `Calories burned: ${entry.calories}kcal.`,
        entry.distance && `Distance: ${entry.distance}km.`,
        entry.heart_rate && `Avg heart rate: ${entry.heart_rate} bpm.`,
        entry.source && entry.source !== 'manual' && `Source: ${entry.source}.`,
    ].filter(Boolean).join(' ');
}

export function buildSleepDescription(entry) {
    return [
        `Sleep logged.`,
        entry.hours && `Duration: ${entry.hours} hours.`,
        entry.quality && `Quality: ${entry.quality}.`,
        entry.bedtime && `Bedtime: ${entry.bedtime}.`,
        entry.wake_time && `Wake time: ${entry.wake_time}.`,
        entry.notes && `Notes: ${entry.notes}.`,
    ].filter(Boolean).join(' ');
}

export function buildHabitDescription(entry) {
    const parts = [`Daily habits logged.`];
    if (entry.water_glasses) parts.push(`Water: ${entry.water_glasses} glasses.`);
    if (entry.smoking) parts.push('Smoking: yes.');
    if (entry.alcohol && entry.alcohol !== 'none') parts.push(`Alcohol: ${entry.alcohol}.`);
    if (entry.caffeine) parts.push(`Caffeine: ${entry.caffeine}.`);
    if (entry.steps) parts.push(`Steps: ${entry.steps}.`);
    if (entry.stress_level != null) parts.push(`Stress level: ${entry.stress_level}/10.`);
    if (entry.mood) parts.push(`Mood: ${entry.mood}.`);
    if (entry.notes) parts.push(`Notes: ${entry.notes}.`);
    return parts.join(' ');
}

export function buildLabDescription(result) {
    const parts = [`Lab results: ${result.panel_type || 'panel'}.`];
    if (result.lab_name) parts.push(`Lab: ${result.lab_name}.`);
    if (result.markers && typeof result.markers === 'object') {
        const markerParts = Object.entries(result.markers)
            .slice(0, 10)
            .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
        if (markerParts.length) parts.push('Markers: ' + markerParts.join(', ') + '.');
    }
    if (result.notes) parts.push(`Notes: ${result.notes}.`);
    return parts.join(' ');
}

export function buildProductScanDescription(scan) {
    return [
        `Product scanned: ${scan.name || 'unknown product'}${scan.brand ? ` by ${scan.brand}` : ''}.`,
        scan.health_score != null && `Health score: ${scan.health_score}/100 (${scan.rating || ''}).`,
        scan.scan_type && `Scan type: ${scan.scan_type}.`,
    ].filter(Boolean).join(' ');
}

export function buildSymptomDescription(symptom) {
    return [
        `Symptom reported: ${symptom.name || symptom.description}.`,
        symptom.severity && `Severity: ${symptom.severity}/10.`,
        symptom.location && `Location: ${symptom.location}.`,
        symptom.notes && `Notes: ${symptom.notes}.`,
    ].filter(Boolean).join(' ');
}

export function buildCycleDescription(entry) {
    return [
        `Cycle event: ${entry.event_type}.`,
        entry.flow && `Flow: ${entry.flow}.`,
        entry.symptom && `Symptom: ${entry.symptom}.`,
        entry.date && `Date: ${entry.date}.`,
    ].filter(Boolean).join(' ');
}

export function buildMedicationDescription(entry) {
    // Name and timing ONLY — never any clinical interpretation.
    return [
        `Medication logged: ${entry.name}.`,
        entry.started_at && `Started: ${new Date(entry.started_at).toISOString().split('T')[0]}.`,
    ].filter(Boolean).join(' ');
}

// ── Dispatch ──────────────────────────────────────────────────

/**
 * Build a description string for any event type.
 * Used by the ingestion service.
 */
export function buildDescription(eventType, data) {
    switch (eventType) {
        case 'meal': return buildMealDescription(data);
        case 'body_scan': return buildBodyScanDescription(data);
        case 'hr_reading': return buildHrDescription(data);
        case 'exercise': return buildExerciseDescription(data);
        case 'sleep': return buildSleepDescription(data);
        case 'habit': return buildHabitDescription(data);
        case 'lab_result': return buildLabDescription(data);
        case 'product_scan': return buildProductScanDescription(data);
        case 'symptom': return buildSymptomDescription(data);
        case 'cycle': return buildCycleDescription(data);
        case 'medication': return buildMedicationDescription(data);
        default: return JSON.stringify(data).slice(0, 500);
    }
}