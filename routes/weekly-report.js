// ─── Weekly Health Report Route ───────────────────────────────
// POST /api/weekly-report/generate?userId=
// GET  /api/weekly-report/latest?userId=

import { Router } from "express";
import { createClient } from "@supabase/supabase-js";
import { buildFullContext, snapshotToText } from "../services/context-builder.js";
import dotenv from "dotenv";
import { WeeklyReportSchema, validateOrThrow } from '../services/ai-validators.js';
dotenv.config();
import { heavyAILimiter } from '../services/ai-limiters.js';
import { fetchWithRetry } from '../services/ai-fetch.js';
import { checkAndIncrementUsage } from '../services/usage-gates.js';

const router = Router();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

const WELLNESS_SYSTEM_PROMPT = `You are a wellness pattern observer for VitalLens, a personal health journaling app. Observe and describe patterns in logged data using plain, supportive language. Never name medical conditions, never use clinical diagnostic language, never provide medical advice. For any pattern persisting more than two weeks, suggest the user discuss it with a healthcare provider. Always frame observations as things the user may want to notice or explore — never as findings or diagnoses.`;

const REPORT_PROMPT = `You are a personal wellness journal summarizer. Generate a warm, observational weekly patterns summary based on the user's logged data. Be specific and data-grounded. Use the user's actual numbers.

Write a weekly patterns summary with these sections:
1. HEADLINE: One sentence summary of the week — what stood out most
2. WINS: 2-3 things that went well this week (with specific numbers from their logs)
3. PATTERNS TO EXPLORE: 2-3 patterns worth paying attention to (with specific numbers, framed as observations not problems)
4. TOP CONNECTION: The single most interesting connection noticed across different areas of their data
5. FOCUS: One specific, achievable lifestyle suggestion for next week
6. SCORE: Overall wellness week score out of 100 (based on logging consistency, trends, data quality)

Keep it concise — each section 1-3 sentences. Use the user's actual logged data, not generic advice. Use language like "your logs suggest", "we noticed", "something worth exploring" — never clinical or diagnostic language. If a pattern has persisted for 14+ days, gently suggest it may be worth mentioning to a healthcare provider.

Respond ONLY with valid JSON, no markdown:
{
  "headline": "one sentence week summary",
  "week_score": 75,
  "wins": ["specific win with numbers", "specific win", "optional third win"],
  "patterns_to_explore": ["specific pattern with numbers framed as observation", "specific pattern", "optional third pattern"],
  "top_connection": "most interesting cross-domain pattern noticed",
  "focus": "one specific actionable lifestyle suggestion for next week",
  "data_completeness": "percentage of domains with sufficient data (0-100)"
}`;

// ── POST /api/weekly-report/generate ─────────────────────────
router.post("/weekly-report/generate", heavyAILimiter, async (req, res) => {
    try {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) return res.status(500).json({ error: "Anthropic API key not configured." });

        const { userId } = req.body;
if (!userId) return res.status(400).json({ error: "userId required." });

// ── Usage gate ────────────────────────────────────────────
const gate = await checkAndIncrementUsage(userId, 'weekly_report');
if (!gate.allowed) return res.status(429).json({ error: gate.message, upgradeRequired: true });

console.log(`[WeeklyReport] Generating for ${userId.slice(0, 8)}`);

        const snapshot = await buildFullContext(userId, { window: 7 });
        const contextText = snapshotToText(snapshot);

        const claudeRes = await fetchWithRetry(ANTHROPIC_API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
            body: JSON.stringify({
                model: "claude-sonnet-4-20250514",
                max_tokens: 1500,
                system: WELLNESS_SYSTEM_PROMPT,
                messages: [{ role: "user", content: `${REPORT_PROMPT}\n\nUSER DATA (last 7 days):\n${contextText}` }],
            }),
            signal: AbortSignal.timeout(30000),
        }, { routeName: 'WeeklyReport' });

        if (!claudeRes.ok) throw new Error(`Claude API error: ${claudeRes.status}`);
        const claudeData = await claudeRes.json();
        const raw = claudeData.content?.[0]?.text || "";
        const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

        let report;
        try { report = JSON.parse(cleaned); }
        catch { return res.status(422).json({ error: "Failed to parse report." }); }

try { report = validateOrThrow(WeeklyReportSchema, report, 'WeeklyReport'); }
catch (e) { return res.status(422).json({ error: e.message }); }

        // Normalize gaps field for backwards compatibility
        if (!report.gaps && report.patterns_to_explore) {
            report.gaps = report.patterns_to_explore;
        }

        // Store in Supabase
        const { data: saved, error } = await supabase
            .from("weekly_reports")
            .insert({
                user_id: userId,
                headline: report.headline,
                week_score: report.week_score,
                wins: report.wins,
                gaps: report.patterns_to_explore || report.gaps,
                top_correlation: report.top_connection || report.top_correlation,
                focus: report.focus,
                data_completeness: report.data_completeness,
                report_data: report,
                week_of: new Date().toISOString().split("T")[0],
            })
            .select()
            .single();

        if (error) console.warn("[WeeklyReport] Save failed:", error.message);

        console.log(`[WeeklyReport] Generated — score: ${report.week_score}`);
        res.json({ report, id: saved?.id });

    } catch (err) {
        console.error("[WeeklyReport] Failed:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// ── GET /api/weekly-report/latest ────────────────────────────
router.get("/weekly-report/latest", async (req, res) => {
    try {
        const { userId } = req.query;
        if (!userId) return res.status(400).json({ error: "userId required." });

        const { data, error } = await supabase
            .from("weekly_reports")
            .select("*")
            .eq("user_id", userId)
            .order("week_of", { ascending: false })
            .limit(4);

        if (error) throw error;
        res.json({ reports: data || [] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── GET /api/weekly-report/narrative?userId= ──────────────────
// Generates a longitudinal wellness narrative from the last 12 weeks
router.get("/weekly-report/narrative", heavyAILimiter, async (req, res) => {
    try {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        const { userId } = req.query;
if (!userId) return res.status(400).json({ error: "userId required." });

// ── Usage gate ────────────────────────────────────────────
const narrativeGate = await checkAndIncrementUsage(userId, 'narrative');
if (!narrativeGate.allowed) return res.status(429).json({ error: narrativeGate.message, upgradeRequired: true });

// Pull last 12 weekly reports

        // Pull last 12 weekly reports
        const { data: reports, error } = await supabase
            .from("weekly_reports")
            .select("week_of, week_score, headline, wins, gaps, top_correlation, focus, data_completeness")
            .eq("user_id", userId)
            .order("week_of", { ascending: false })
            .limit(12);

        if (error) throw error;
        if (!reports || reports.length < 2) {
            return res.json({ narrative: null, message: "Log at least 2 weeks of data to see your wellness story." });
        }

        // Check if we have a cached narrative from the last 7 days
        const { data: cached } = await supabase
            .from("weekly_reports")
            .select("narrative, narrative_generated_at")
            .eq("user_id", userId)
            .order("week_of", { ascending: false })
            .limit(1)
            .single();

        if (cached?.narrative && cached?.narrative_generated_at) {
            const age = Date.now() - new Date(cached.narrative_generated_at).getTime();
            if (age < 7 * 24 * 60 * 60 * 1000) {
                return res.json({ narrative: cached.narrative, cached: true });
            }
        }

        const reportsText = reports.reverse().map((r, i) => 
            `Week ${i + 1} (${r.week_of}): Score ${r.week_score}/100 — ${r.headline}`
        ).join('\n');

        const firstScore = reports[0]?.week_score || 0;
        const lastScore = reports[reports.length - 1]?.week_score || 0;
        const avgScore = Math.round(reports.reduce((s, r) => s + (r.week_score || 0), 0) / reports.length);
        const trend = lastScore > firstScore + 5 ? 'improving' : lastScore < firstScore - 5 ? 'declining' : 'stable';

        const NARRATIVE_PROMPT = `You are a warm, observational wellness journal narrator. Based on the user's last ${reports.length} weeks of logged wellness data, write a short "your wellness story so far" narrative. 

Use supportive, non-clinical language. Frame everything as observations from their logs, not medical assessments. Never name conditions or diagnoses.

Weekly data:
${reportsText}

Overall trend: ${trend} (started at ${firstScore}, now at ${lastScore}, avg ${avgScore})

Write a narrative with:
1. STORY: 2-3 sentences describing their overall wellness journey — what patterns have emerged over time
2. STRONGEST_TREND: The single most consistent pattern across all weeks
3. BIGGEST_SHIFT: The most notable change between early and recent weeks
4. NEXT_CHAPTER: One encouraging observation about where their patterns seem to be heading

Respond ONLY with valid JSON, no markdown:
{
  "story": "2-3 sentence narrative of their wellness journey",
  "strongest_trend": "most consistent pattern observed",
  "biggest_shift": "most notable change over time",
  "next_chapter": "encouraging observation about trajectory",
  "weeks_analyzed": ${reports.length},
  "avg_score": ${avgScore},
  "trend": "${trend}"
}`;

        const claudeRes = await fetchWithRetry(ANTHROPIC_API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
            body: JSON.stringify({
                model: "claude-sonnet-4-20250514",
                max_tokens: 1000,
                system: WELLNESS_SYSTEM_PROMPT,
                messages: [{ role: "user", content: NARRATIVE_PROMPT }],
            }),
        });

        if (!claudeRes.ok) throw new Error(`Claude API error: ${claudeRes.status}`);
        const claudeData = await claudeRes.json();
        const raw = claudeData.content?.[0]?.text || '';
        const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const narrative = JSON.parse(cleaned);

        // Cache the narrative on the most recent report
        await supabase
            .from("weekly_reports")
            .update({ narrative, narrative_generated_at: new Date().toISOString() })
            .eq("user_id", userId)
            .order("week_of", { ascending: false })
            .limit(1);

        console.log(`[WeeklyReport] Narrative generated for ${userId.slice(0, 8)} — ${reports.length} weeks analyzed`);
        res.json({ narrative, cached: false });

    } catch (err) {
        console.error('[WeeklyReport] Narrative failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

export default router;