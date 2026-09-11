// ─── Event Ingestion Service ──────────────────────────────────
// Called after every successful data write (meal, scan, exercise, etc.)
// Inserts a row into health_events and queues the embedding.
//
// Design: embedding is done asynchronously so it never blocks
// the user-facing response. If it fails, the event row still
// exists with embedding = null and will be picked up by a
// background job (see the /api/embed-pending route).

import { supabase } from '../db/supabase.js';
import { embed, buildDescription } from './embeddingService.js';

// ── Core ingestion function ───────────────────────────────────

/**
 * Record a health event and trigger embedding asynchronously.
 *
 * @param {string} userId     — Supabase auth user ID
 * @param {string} eventType  — 'meal' | 'body_scan' | 'exercise' | etc.
 * @param {object} data       — the full data object (meal row, scan row, etc.)
 * @param {string} [sourceId] — UUID of the source row (optional)
 * @param {Date}   [eventAt]  — timestamp of the event (defaults to now)
 * @returns {string} — the health_event ID
 */
export async function ingestEvent(userId, eventType, data, sourceId = null, eventAt = new Date()) {
    const description = buildDescription(eventType, data);

    // ── Insert the event row first (without embedding) ────────
    const { data: eventRow, error: insertError } = await supabase
        .from('health_events')
        .insert({
            user_id: userId,
            event_type: eventType,
            source_id: sourceId || null,
            description,
            metadata: sanitizeMetadata(data),
            event_at: eventAt.toISOString(),
            embedding: null, // filled in async below
        })
        .select('id')
        .single();

    if (insertError) {
        console.error('[Ingest] Failed to insert health event:', insertError.message);
        throw insertError;
    }

    const eventId = eventRow.id;
    console.log(`[Ingest] Event inserted: ${eventType} ${eventId}`);

    // ── Embed asynchronously (don't await — don't block caller) ──
    embedEventAsync(eventId, description, userId);

    return eventId;
}

/**
 * Embed a single health_event row by ID.
 * Called async from ingestEvent, and also by the /api/embed-pending route.
 */
export async function embedEvent(eventId, description, userId = null) {
    try {
        const vector = await embed(description, { userId, route: 'embed-event' });

        const { error } = await supabase
            .from('health_events')
            .update({ embedding: JSON.stringify(vector) })
            .eq('id', eventId);

        if (error) {
            console.error(`[Embed] Failed to save embedding for ${eventId}:`, error.message);
        } else {
            console.log(`[Embed] Embedded event ${eventId}`);
        }
    } catch (err) {
        console.error(`[Embed] Embedding failed for ${eventId}:`, err.message);
        // Event row stays with embedding = null; picked up by embed-pending job
    }
}

function embedEventAsync(eventId, description, userId) {
    // Fire and forget — errors are logged but don't propagate
    Promise.resolve().then(() => embedEvent(eventId, description, userId)).catch(() => { });
}

// ── Metadata sanitizer ────────────────────────────────────────
// Strip large/irrelevant fields before storing in health_events.metadata

function sanitizeMetadata(data) {
    if (!data || typeof data !== 'object') return {};

    // Fields to always exclude from metadata
    const exclude = ['embedding', 'raw_response', 'image_url', 'image_data', 'base64'];
    const result = {};

    for (const [key, val] of Object.entries(data)) {
        if (exclude.includes(key)) continue;
        if (typeof val === 'string' && val.length > 2000) continue; // skip huge strings
        result[key] = val;
    }

    return result;
}

// ── Convenience wrappers ──────────────────────────────────────
// Match the naming convention in db.js so callers are readable.

export const ingest = {
    meal: (userId, data, sourceId) => ingestEvent(userId, 'meal', data, sourceId, new Date(data.logged_at || Date.now())),
    bodyScan: (userId, data, sourceId) => ingestEvent(userId, 'body_scan', data, sourceId, new Date(data.scanned_at || Date.now())),
    hrReading: (userId, data, sourceId) => ingestEvent(userId, 'hr_reading', data, sourceId, new Date(data.recorded_at || Date.now())),
    exercise: (userId, data, sourceId) => ingestEvent(userId, 'exercise', data, sourceId, new Date(data.date || Date.now())),
    sleep: (userId, data, sourceId) => ingestEvent(userId, 'sleep', data, sourceId, new Date(data.date || Date.now())),
    habit: (userId, data, sourceId) => ingestEvent(userId, 'habit', data, sourceId, new Date(data.date || Date.now())),
    labResult: (userId, data, sourceId) => ingestEvent(userId, 'lab_result', data, sourceId, new Date(data.collected_at || Date.now())),
    productScan: (userId, data, sourceId) => ingestEvent(userId, 'product_scan', data, sourceId, new Date(data.scanned_at || Date.now())),
    symptom: (userId, data) => ingestEvent(userId, 'symptom', data, null, new Date()),
    cycle: (userId, data, sourceId) => ingestEvent(userId, 'cycle', data, sourceId, new Date(data.date || Date.now())),
    medication: (userId, data, sourceId) => ingestEvent(userId, 'medication', data, sourceId, new Date(data.started_at || Date.now())),
};