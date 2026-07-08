// ─── AI Job Queue ─────────────────────────────────────────────
// BullMQ queues for heavy AI workloads (correlation, weekly report).
// Uses Upstash Redis as the queue backend.
//
// This module NO LONGER starts workers on import. Instead:
//   - setupQueues()  — creates the Queue instances so the API process
//                      can ADD jobs. Call this from server.js.
//   - startWorkers() — creates the Worker instances that PROCESS jobs.
//                      Call this ONLY from the standalone worker.js.

import { Queue, Worker } from 'bullmq';
import { createClient } from '@supabase/supabase-js';
import { buildFullContext, snapshotToText } from './context-builder.js';
import dotenv from 'dotenv';
import { WELLNESS_SYSTEM_PROMPT } from './prompts.js';
dotenv.config();

// ── Redis connection for BullMQ ───────────────────────────────
// BullMQ requires ioredis-compatible connection
const connection = {
    host: process.env.UPSTASH_REDIS_HOST || 'sensible-rooster-132693.upstash.io',
    port: Number(process.env.UPSTASH_REDIS_PORT) || 6379,
    password: process.env.UPSTASH_REDIS_REST_TOKEN,
    tls: {},
};

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

// Module-level singletons — populated by setupQueues() / startWorkers().
let correlationQueue = null;
let weeklyReportQueue = null;
let correlationWorker = null;
let weeklyReportWorker = null;

// ── Queue setup (producers) ───────────────────────────────────
// Safe to call from the API process. Creates the Queue objects so
// jobs can be added, but does NOT process anything. Idempotent.
export function setupQueues() {
    if (!correlationQueue) correlationQueue = new Queue('correlation', { connection });
    if (!weeklyReportQueue) weeklyReportQueue = new Queue('weekly-report', { connection });
    return { correlationQueue, weeklyReportQueue };
}

// ── Job processors ────────────────────────────────────────────

async function processCorrelation(job) {
    const { userId } = job.data;
    console.log(`[Queue] Correlation job started for ${userId.slice(0, 8)}`);

    const snapshot = await buildFullContext(userId, { window: 30 });
    const contextText = snapshotToText(snapshot);

    const CORRELATION_PROMPT = `You are a wellness pattern spotter. Analyze the user's logged lifestyle and wellness data and identify real, data-grounded connections and patterns across different areas of their life.

RULES:
- Only report patterns you can support from the data provided
- Use observational language: "your logs suggest", "we noticed", "something to explore"
- Never name medical conditions or use clinical diagnostic language
- If a pattern has persisted 14+ days, note it may be worth discussing with a healthcare provider

Find connections across: diet, sleep, exercise, environment, supplements, wellness check-ins, and TCM patterns.

Respond ONLY with valid JSON, no markdown:
{
  "correlations": [{ "domain_a": "string", "domain_b": "string", "finding": "string", "strength": "consistent|emerging|early_hint|insufficient_data", "direction": "positive|negative|neutral", "actionable": "string", "data_points": 0 }],
  "top_insight": "string",
  "data_quality": "rich|moderate|sparse",
  "insufficient_domains": ["string"],
  "summary": "string"
}`;

    const res = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 2000,
            system: WELLNESS_SYSTEM_PROMPT,
            messages: [{ role: 'user', content: `${CORRELATION_PROMPT}\n\nUSER DATA:\n${contextText}` }],
        }),
        signal: AbortSignal.timeout(60000),
    });

    if (!res.ok) throw new Error(`Claude API error: ${res.status}`);
    const data = await res.json();
    const raw = data.content?.[0]?.text || '';
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const analysis = JSON.parse(cleaned);

    if (analysis.correlations?.length > 0) {
        await supabase.from('health_correlations').insert(
            analysis.correlations.map(c => ({
                user_id: userId,
                correlation_type: `${c.domain_a}-${c.domain_b}`,
                description: c.finding,
                confidence: c.strength === 'consistent' ? 0.9 : c.strength === 'emerging' ? 0.6 : 0.3,
                data_window_days: 30,
                actionable: c.actionable,
                direction: c.direction,
            }))
        );
    }

    await supabase.from('health_correlations').insert({
        user_id: userId,
        correlation_type: 'summary',
        description: analysis.summary,
        confidence: 1.0,
        data_window_days: 30,
        actionable: analysis.top_insight,
    });

    console.log(`[Queue] Correlation job complete for ${userId.slice(0, 8)} — ${analysis.correlations?.length || 0} patterns`);
    return { success: true, patternCount: analysis.correlations?.length || 0 };
}

async function processWeeklyReport(job) {
    const { userId } = job.data;
    console.log(`[Queue] Weekly report job started for ${userId.slice(0, 8)}`);

    const snapshot = await buildFullContext(userId, { window: 7 });
    const contextText = snapshotToText(snapshot);

    const REPORT_PROMPT = `You are a personal wellness journal summarizer. Generate a warm, observational weekly patterns summary. Use observational language like "your logs suggest", "we noticed". Never use clinical language.

Respond ONLY with valid JSON, no markdown:
{
  "headline": "string",
  "week_score": 75,
  "wins": ["string"],
  "patterns_to_explore": ["string"],
  "top_connection": "string",
  "focus": "string",
  "data_completeness": 80
}`;

    const res = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1500,
            system: WELLNESS_SYSTEM_PROMPT,
            messages: [{ role: 'user', content: `${REPORT_PROMPT}\n\nUSER DATA (last 7 days):\n${contextText}` }],
        }),
        signal: AbortSignal.timeout(60000),
    });

    if (!res.ok) throw new Error(`Claude API error: ${res.status}`);
    const data = await res.json();
    const raw = data.content?.[0]?.text || '';
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const report = JSON.parse(cleaned);

    if (!report.gaps && report.patterns_to_explore) {
        report.gaps = report.patterns_to_explore;
    }

    await supabase.from('weekly_reports').insert({
        user_id: userId,
        headline: report.headline,
        week_score: report.week_score,
        wins: report.wins,
        gaps: report.patterns_to_explore || report.gaps,
        top_correlation: report.top_connection,
        focus: report.focus,
        data_completeness: report.data_completeness,
        report_data: report,
        week_of: new Date().toISOString().split('T')[0],
    });

    console.log(`[Queue] Weekly report job complete for ${userId.slice(0, 8)} — score: ${report.week_score}`);
    return { success: true, weekScore: report.week_score };
}

// ── Worker startup (consumers) ────────────────────────────────
// Call this ONLY from the standalone worker process (worker.js).
export function startWorkers() {
    correlationWorker = new Worker('correlation', processCorrelation, { connection, concurrency: 2 });
    weeklyReportWorker = new Worker('weekly-report', processWeeklyReport, { connection, concurrency: 2 });

    correlationWorker.on('failed', (job, err) => {
        console.error(`[Queue] Correlation job ${job?.id} failed:`, err.message);
    });
    weeklyReportWorker.on('failed', (job, err) => {
        console.error(`[Queue] Weekly report job ${job?.id} failed:`, err.message);
    });

    console.log('[Queue] BullMQ workers started — correlation + weekly report');
    return { correlationWorker, weeklyReportWorker };
}
