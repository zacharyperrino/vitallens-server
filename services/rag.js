// ─── Retrieval-Augmented Generation Service ───────────────────
// Vector similarity search over the user's own health_events.
// Embeds a query, calls the match_health_events Postgres RPC, and
// returns the most similar past-event descriptions.

import { createClient } from '@supabase/supabase-js';
import { embed } from './embeddingService.js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Retrieve the user's most relevant past health events by similarity.
 *
 * @param {string} userId     — Supabase auth user id (results are filtered to this user)
 * @param {string} queryText  — the natural-language question to match against
 * @param {number} [count=8]  — max number of events to return
 * @returns {Promise<string[]>} — matched event description strings, most similar first
 */
export async function retrieveRelevantHistory(userId, queryText, count = 8) {
    if (!userId || !queryText || !queryText.trim()) return [];

    // Embed the query with the same model used for stored events (1536-dim).
    const queryEmbedding = await embed(queryText);

    const { data, error } = await supabase.rpc('match_health_events', {
        query_embedding: queryEmbedding,
        match_user_id: userId,
        match_count: count,
    });

    if (error) throw new Error(error.message);

    return (data || [])
        .map(row => row.description)
        .filter(Boolean);
}
