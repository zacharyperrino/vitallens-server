// ─── Correlation Engine Route ─────────────────────────────────
// POST /api/correlate/run   — run full correlation analysis
// GET  /api/correlate/latest?userId=  — get latest correlations

import { Router } from "express";
import { createClient } from "@supabase/supabase-js";
import { buildFullContext, snapshotToText } from "../services/context-builder.js";
import dotenv from "dotenv";
import { CorrelationSchema, validateOrThrow } from '../services/ai-validators.js';
dotenv.config();
import { heavyAILimiter } from '../services/ai-limiters.js';
import { fetchWithRetry } from '../services/ai-fetch.js';

const router = Router();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

const WELLNESS_SYSTEM_PROMPT = `You are a wellness pattern observer for VitalLens, a personal health journaling app. Observe and describe patterns in logged data using plain, supportive language. Never name medical conditions, never use clinical diagnostic language, never provide medical advice. For any pattern persisting more than two weeks, suggest the user discuss it with a healthcare provider. Always frame observations as things the user may want to notice or explore — never as findings or diagnoses.`;

const CORRELATION_PROMPT = `You are a wellness pattern spotter. Analyze the user's logged lifestyle and wellness data and identify real, data-grounded connections and patterns across different areas of their life.

RULES:
- Only report patterns you can support from the data provided
- If data is insufficient for a pattern, say so explicitly
- Be specific — cite actual numbers and dates from the logs
- Do not make up patterns
- Distinguish between consistent patterns (3+ data points) and early hints (1-2 points)
- Focus on actionable, meaningful connections across lifestyle domains
- Use observational language: "your logs suggest", "we noticed", "something to explore"
- Never name medical conditions or use clinical diagnostic language
- If a pattern has persisted 14+ days, note that it may be worth discussing with a healthcare provider

Find connections across these dimensions:
1. DIET → WELLNESS CHECK-INS: Does nutrition quality connect with skin or body check-in scores?
2. SLEEP → ENERGY/PERFORMANCE: Does sleep quality connect with exercise performance or wellness scores?
3. ENVIRONMENT → WELLNESS: Does AQI or environmental quality connect with how the user feels?
4. SUPPLEMENTS → LOGGED GAPS: Are supplement patterns addressing logged nutritional gaps?
5. EXERCISE → RECOVERY: Does training volume connect with sleep quality?
6. NUTRITION CONSISTENCY → OUTCOMES: Does logging consistency connect with better wellness scores?
7. TCM PATTERNS: Do traditional wellness patterns align with logged lifestyle data?

Respond ONLY with valid JSON, no markdown:
{
  "correlations": [
    {
      "domain_a": "first domain (diet/sleep/exercise/environment/supplements/wellness_checkins)",
      "domain_b": "second domain",
      "finding": "specific pattern observation with numbers — use 'your logs suggest' language",
      "strength": "consistent|emerging|early_hint|insufficient_data",
      "direction": "positive|negative|neutral",
      "actionable": "specific lifestyle change the user could explore",
      "data_points": 0
    }
  ],
  "top_insight": "single most interesting cross-domain pattern noticed — plain language",
  "data_quality": "rich|moderate|sparse",
  "insufficient_domains": ["domains with not enough logged data"],
  "summary": "2-3 sentence plain-language narrative of overall wellness patterns noticed"
}`;

// ── POST /api/correlate/run ───────────────────────────────────
router.post("/correlate/run", heavyAILimiter, async (req, res) => {
    try {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) return res.status(500).json({ error: "Anthropic API key not configured." });

        const { userId } = req.body;
        if (!userId) return res.status(400).json({ error: "userId required." });

        console.log(`[CorrelationEngine] Running analysis for ${userId.slice(0, 8)}`);

        const snapshot = await buildFullContext(userId, { window: 30 });
        const contextText = snapshotToText(snapshot);

        const claudeRes = await fetchWithRetry(ANTHROPIC_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        system: WELLNESS_SYSTEM_PROMPT,
        messages: [{ role: "user", content: `${CORRELATION_PROMPT}\n\nUSER DATA:\n${contextText}` }],
    }),
    signal: AbortSignal.timeout(30000),
}, { routeName: 'CorrelationEngine' });

        if (!claudeRes.ok) throw new Error(`Claude API error: ${claudeRes.status}`);
        const claudeData = await claudeRes.json();
        const raw = claudeData.content?.[0]?.text || "";
        const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

        let analysis;
try { analysis = JSON.parse(cleaned); }
catch { return res.status(422).json({ error: "Failed to parse correlation response." }); }

try { analysis = validateOrThrow(CorrelationSchema, analysis, 'CorrelationEngine'); }
catch (e) { return res.status(422).json({ error: e.message }); }

        // Store correlations in Supabase
        if (analysis.correlations?.length > 0) {
            await supabase.from("health_correlations").insert(
                analysis.correlations.map(c => ({
                    user_id: userId,
                    correlation_type: `${c.domain_a}-${c.domain_b}`,
                    description: c.finding,
                    confidence: c.strength === "consistent" ? 0.9 : c.strength === "emerging" ? 0.6 : 0.3,
                    data_window_days: 30,
                    actionable: c.actionable,
                    direction: c.direction,
                }))
            );
        }

        // Store summary
        await supabase.from("health_correlations").insert({
            user_id: userId,
            correlation_type: "summary",
            description: analysis.summary,
            confidence: 1.0,
            data_window_days: 30,
            actionable: analysis.top_insight,
        });

        // ── Secondary language safety check via Haiku ─────────────────
try {
    const safetyCheck = await fetchWithRetry(ANTHROPIC_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 200,
            messages: [{
                role: "user",
                content: `Review this wellness app output for any clinical diagnostic language, condition names, or medical advice. Reply with only "PASS" if it is safe, or "FLAG: [reason]" if it contains clinical language.\n\nOutput to review:\n${JSON.stringify(analysis.correlations?.slice(0, 3))}\n\nSummary: ${analysis.summary}`
            }]
        }),
        signal: AbortSignal.timeout(10000),
    }, { routeName: 'CorrelationSafetyCheck' });

    if (safetyCheck.ok) {
        const safetyData = await safetyCheck.json();
        const safetyResult = safetyData.content?.[0]?.text || '';
        if (safetyResult.startsWith('FLAG')) {
            console.warn(`[CorrelationEngine] Safety check flagged output: ${safetyResult}`);
        } else {
            console.log(`[CorrelationEngine] Safety check passed`);
        }
    }
} catch (err) {
    console.warn('[CorrelationEngine] Safety check failed (non-blocking):', err.message);
}

console.log(`[CorrelationEngine] Found ${analysis.correlations?.length || 0} patterns`);
res.json({ analysis, snapshot: { dataQuality: analysis.data_quality, insufficientDomains: analysis.insufficient_domains } });

    } catch (err) {
        console.error("[CorrelationEngine] Failed:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// ── GET /api/correlate/latest ─────────────────────────────────
router.get("/correlate/latest", async (req, res) => {
    try {
        const { userId, limit = 10 } = req.query;
        if (!userId) return res.status(400).json({ error: "userId required." });

        const { data, error } = await supabase
            .from("health_correlations")
            .select("*")
            .eq("user_id", userId)
            .order("generated_at", { ascending: false })
            .limit(parseInt(limit));

        if (error) throw error;
        res.json({ correlations: data || [] });
    } catch (err) {
        console.error("[CorrelationEngine] Fetch failed:", err.message);
        res.status(500).json({ error: err.message });
    }
});

export default router;