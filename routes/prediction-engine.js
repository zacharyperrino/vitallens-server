// ─── Prediction Engine Route ──────────────────────────────────
// POST /api/predictions/run     — run full trend pattern analysis
// GET  /api/predictions/latest  — get stored trend patterns

import { Router } from "express";
import { buildFullContext, snapshotToText } from "../services/context-builder.js";
import { PredictionSchema, validateOrThrow } from '../services/ai-validators.js';
import { heavyAILimiter } from '../services/ai-limiters.js';
import { fetchWithRetry } from '../services/ai-fetch.js';
import { checkAndIncrementUsage } from '../services/usage-gates.js';
import { trackCost } from '../services/cost-tracker.js';

import { WELLNESS_SYSTEM_PROMPT } from '../services/prompts.js';
import { supabase } from '../db/supabase.js';

import { sendError } from '../utils/errors.js';

const router = Router();
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

const PREDICTION_PROMPT = `You are a wellness trend analyst. Based on the user's logged lifestyle and wellness data, identify where their patterns are heading and what changes would have the most impact.

RULES:
- Only surface trends supported by the data. If data is insufficient, say so with low confidence.
- Never fabricate trends. If a metric has fewer than 5 data points, flag it as low confidence.
- Be specific with numbers and timeframes.
- Use observational language: "your logs suggest", "based on your recent patterns", "something to explore"
- Never predict specific clinical lab values or name medical conditions
- Rank interventions by expected impact for THIS specific user's data — not generic advice
- For any pattern persisting 14+ days, suggest discussing with a healthcare provider

Generate two types of analysis:

1. TREND PATTERNS: Where are key wellness metrics heading if current patterns continue?
   - Project 7-14 days forward based on observed direction
   - Flag if a trend is worth watching or looks promising
   - State confidence based on data volume
   - Use language like "based on your recent patterns" not "predicts"

2. INTERVENTION RANKING: What lifestyle changes would have the highest impact for this specific user?
   - Rank by expected wellness improvement
   - Base rank on observed gaps and patterns
   - Be specific — not "eat better" but "adding 30g protein at breakfast would close your protein gap"

Respond ONLY with valid JSON, no markdown:
{
  "trend_extrapolations": [
    {
      "metric": "metric name",
      "current_value": "current value with unit",
      "direction": "improving|declining|stable",
      "projected_7d": "where this pattern may lead in 7 days",
      "projected_14d": "where this pattern may lead in 14 days",
      "confidence": "high|moderate|low",
      "confidence_reason": "why this confidence level",
      "worth_watching": "note if this pattern is worth keeping an eye on, null if not",
      "positive": "note if this pattern looks promising, null if not"
    }
  ],
  "intervention_ranking": [
    {
      "rank": 1,
      "intervention": "specific actionable lifestyle change",
      "expected_impact": "what may improve and roughly how much",
      "effort": "low|medium|high",
      "timeframe": "when to expect to notice a difference",
      "based_on": "which logged data points support this ranking"
    }
  ],
  "overall_trajectory": "improving|declining|stable|mixed",
  "trajectory_summary": "2 sentence plain-language summary of where wellness patterns are heading",
  "data_sufficiency": "rich|moderate|sparse",
  "minimum_data_needed": "what additional logging would improve pattern accuracy"
}`;

// ── POST /api/predictions/run ─────────────────────────────────
router.post("/predictions/run", heavyAILimiter, async (req, res) => {
    try {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) return res.status(500).json({ error: "Anthropic API key not configured." });

        const { userId } = req.body;
if (!userId) return res.status(400).json({ error: "userId required." });

// ── Usage gate ────────────────────────────────────────────
const gate = await checkAndIncrementUsage(userId, 'prediction_run');
if (!gate.allowed) return res.status(429).json({ error: gate.message, upgradeRequired: true });

console.log(`[PredictionEngine] Running for ${userId.slice(0, 8)}`);

        const snapshot = await buildFullContext(userId, { window: 30 });
        const contextText = snapshotToText(snapshot);

        const claudeRes = await fetchWithRetry(ANTHROPIC_API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
            body: JSON.stringify({
                model: "claude-haiku-4-5-20251001",
                max_tokens: 2500,
                system: WELLNESS_SYSTEM_PROMPT,
                messages: [{ role: "user", content: `${PREDICTION_PROMPT}\n\nUSER DATA:\n${contextText}` }],
            }),
            timeoutMs: 35000,
        }, { routeName: 'PredictionEngine' });

        if (!claudeRes.ok) throw new Error(`Claude API error: ${claudeRes.status}`);
        const claudeData = await claudeRes.json();

        await trackCost({ userId, route: 'prediction-engine', model: 'claude-haiku-4-5-20251001', inputTokens: claudeData.usage?.input_tokens || 0, outputTokens: claudeData.usage?.output_tokens || 0 });

        const raw = claudeData.content?.[0]?.text || "";
        const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

        let predictions;
        try { predictions = JSON.parse(cleaned); }
        catch { return res.status(422).json({ error: "Failed to parse trend patterns." }); }

        try { predictions = validateOrThrow(PredictionSchema, predictions, 'PredictionEngine'); }
catch (e) { return res.status(422).json({ error: e.message }); }

        // Store in Supabase
        const { data: saved, error } = await supabase
            .from("health_predictions")
            .insert({
                user_id: userId,
                overall_trajectory: predictions.overall_trajectory,
                trajectory_summary: predictions.trajectory_summary,
                data_sufficiency: predictions.data_sufficiency,
                trend_extrapolations: predictions.trend_extrapolations,
                lab_predictions: [],
                intervention_ranking: predictions.intervention_ranking,
                minimum_data_needed: predictions.minimum_data_needed,
                generated_at: new Date().toISOString(),
            })
            .select()
            .single();

        if (error) console.warn("[PredictionEngine] Save failed:", error.message);

        // Surface worth-watching patterns as health_insights
        const watchItems = (predictions.trend_extrapolations || []).filter(t => t.worth_watching);
        if (watchItems.length > 0) {
            await supabase.from("health_insights").insert(
                watchItems.map(a => ({
                    user_id: userId,
                    insight_type: "trend_pattern",
                    title: `${a.metric} pattern worth watching`,
                    body: a.worth_watching,
                    confidence: a.confidence === "high" ? 0.9 : a.confidence === "moderate" ? 0.6 : 0.3,
                    priority: "medium",
                    data_sources: ["trend_patterns"],
                }))
            );
        }

        console.log(`[PredictionEngine] Generated — trajectory: ${predictions.overall_trajectory}, ${predictions.intervention_ranking?.length || 0} interventions ranked`);
        res.json({ predictions, id: saved?.id });

    } catch (err) {
        console.error("[PredictionEngine] Failed:", err.message);
        sendError(res, err);
    }
});

// ── GET /api/predictions/latest ───────────────────────────────
router.get("/predictions/latest", async (req, res) => {
    try {
        const { userId } = req.query;
        if (!userId) return res.status(400).json({ error: "userId required." });

        const { data, error } = await supabase
            .from("health_predictions")
            .select("*")
            .eq("user_id", userId)
            .order("generated_at", { ascending: false })
            .limit(1)
            .single();

        if (error && error.code !== "PGRST116") throw error;
        res.json({ prediction: data || null });
    } catch (err) {
        console.error("[PredictionEngine] Fetch failed:", err.message);
        sendError(res, err);
    }
});

export default router;