// ─── Health Copilot Route v2 ──────────────────────────────────
// Full intelligence: reads all data + executes actions via tools
// POST /api/health-copilot

import { Router } from "express";
import { createClient } from "@supabase/supabase-js";
import { buildFullContext, snapshotToText } from "../services/context-builder.js";
import dotenv from "dotenv";
dotenv.config();
import { copilotLimiter } from '../services/ai-limiters.js';
import { fetchWithRetry } from '../services/ai-fetch.js';
import { sanitizeContextFields, sanitizeUserInput } from '../services/sanitize.js';

const router = Router();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

const WELLNESS_SYSTEM_PROMPT_BASE = `You are VitalLens, a personal wellness journal co-pilot with access to the user's logged lifestyle and wellness data. You help users notice patterns between their lifestyle choices and how they feel — and take actions on their behalf like logging meals, sleep, and exercise.

WELLNESS IDENTITY — always follow these rules:
- You are a wellness pattern observer, not a medical advisor
- Use language like "your logs suggest", "we noticed a pattern", "something to explore", "commonly associated with"
- Never name medical conditions, never diagnose, never use clinical diagnostic language
- Never say "detects", "diagnoses", "screens for", "indicates condition", "LOW/HIGH/CRITICAL"
- For any pattern that has persisted 14+ days, gently suggest the user mention it to a healthcare provider
- If a user asks a medical question, acknowledge it warmly and suggest they speak with a healthcare provider

CRITICAL — always factor in:
- User's stated goals and instructions (if present, these override generic suggestions)
- Preexisting conditions (tailor all suggestions accordingly)
- All medications, supplements, and substances (be aware of interactions, factor into context)
- Dietary restrictions (never suggest foods that conflict with them)

You can READ and ACT. When the user wants to log something, look something up, or run an analysis — USE THE TOOLS. Don't just describe what could be done.

CAPABILITIES:
- Log meals, sleep, and exercise directly to their wellness journal
- Look up nutrition data for any food
- Add supplements to their active stack
- Run pattern analysis to find lifestyle connections
- Generate weekly wellness summaries
- Run trend pattern analysis and intervention ranking
- Summarize today's complete logged data

RESPONSE RULES:
- Be direct and specific — cite actual numbers from their logged data
- When you use a tool and it succeeds, confirm what was logged/done
- Reference known patterns and trends when relevant
- Keep answers concise — 2-4 sentences unless complexity demands more
- Never fabricate data — if something isn't in their records, say so
- Never diagnose — observe, notice patterns, and suggest`;

// ── Tool definitions ──────────────────────────────────────────
const TOOLS = [
    {
        name: "log_meal",
        description: "Log a meal or food to the user's food diary and update daily nutrition totals. Use when user describes eating something or wants to log food.",
        input_schema: {
            type: "object",
            properties: {
                name: { type: "string", description: "Meal or food name" },
                calories: { type: "number", description: "Total calories" },
                protein: { type: "number", description: "Protein in grams" },
                carbs: { type: "number", description: "Carbs in grams" },
                fat: { type: "number", description: "Fat in grams" },
                fiber: { type: "number", description: "Fiber in grams" },
                grams: { type: "number", description: "Portion size in grams" },
            },
            required: ["name", "calories"],
        },
    },
    {
        name: "log_sleep",
        description: "Log a sleep entry. Use when user mentions how long or well they slept.",
        input_schema: {
            type: "object",
            properties: {
                hours: { type: "number", description: "Hours slept" },
                quality: { type: "string", enum: ["Poor", "Fair", "Good", "Excellent"], description: "Sleep quality" },
                bedtime: { type: "string", description: "Bedtime in HH:MM format" },
                wake_time: { type: "string", description: "Wake time in HH:MM format" },
                wakeups: { type: "number", description: "Number of times woken up" },
                notes: { type: "string", description: "Any notes about sleep" },
            },
            required: ["hours"],
        },
    },
    {
        name: "log_exercise",
        description: "Log an exercise session. Use when user mentions a workout, run, lift, or physical activity.",
        input_schema: {
            type: "object",
            properties: {
                type: { type: "string", description: "Exercise type e.g. Weight Training, Running, Cycling" },
                name: { type: "string", description: "Specific movement or activity name" },
                duration: { type: "number", description: "Duration in minutes" },
                rpe: { type: "number", description: "RPE 1-10" },
                sets: { type: "string", description: "Sets/reps/weight as JSON string e.g. [{weight:100,reps:5}]" },
                muscle_groups: { type: "string", description: "Comma-separated muscle groups" },
                calories: { type: "number", description: "Calories burned" },
                notes: { type: "string", description: "Any notes" },
            },
            required: ["type"],
        },
    },
    {
        name: "add_supplement",
        description: "Add a supplement to the user's active stack. Use when user says they want to add or start taking a supplement.",
        input_schema: {
            type: "object",
            properties: {
                name: { type: "string", description: "Supplement name" },
                dose: { type: "string", description: "Dose e.g. 500mg, 2000 IU" },
                frequency: { type: "string", enum: ["daily", "twice_daily", "3x_daily", "weekly", "as_needed", "with_meals", "before_bed", "morning"], description: "How often to take it" },
                notes: { type: "string", description: "Any notes about timing or reason" },
            },
            required: ["name"],
        },
    },
    {
        name: "lookup_nutrition",
        description: "Look up nutrition data for a food from USDA database. Use when user asks about calories, macros, or nutrition of a specific food.",
        input_schema: {
            type: "object",
            properties: {
                food: { type: "string", description: "Food name to look up" },
                grams: { type: "number", description: "Portion size in grams (default 100)" },
            },
            required: ["food"],
        },
    },
    {
        name: "run_correlation_analysis",
        description: "Run a fresh pattern analysis on the user's wellness data to find cross-domain lifestyle connections. Use when user asks about patterns, connections, or correlations in their data.",
        input_schema: {
            type: "object",
            properties: {
                reason: { type: "string", description: "Why the user wants this analysis" },
            },
            required: [],
        },
    },
    {
        name: "generate_weekly_report",
        description: "Generate a weekly wellness summary highlighting patterns, wins, and a focus area. Use when user asks for a summary, report, or weekly review.",
        input_schema: {
            type: "object",
            properties: {
                reason: { type: "string" },
            },
            required: [],
        },
    },
    {
        name: "run_predictions",
        description: "Run trend pattern analysis and lifestyle intervention ranking based on the user's logged data. Use when user asks where their wellness trends are heading or what to focus on.",
        input_schema: {
            type: "object",
            properties: {
                reason: { type: "string" },
            },
            required: [],
        },
    },
    {
        name: "get_todays_summary",
        description: "Get a complete summary of today's nutrition, activity, and wellness data. Use when user asks what they've done today or their daily status.",
        input_schema: {
            type: "object",
            properties: {},
            required: [],
        },
    },
];

// ── Tool executor ─────────────────────────────────────────────
async function executeTool(toolName, toolInput, userId) {
    console.log(`[CopilotTool] Executing: ${toolName}`);

    switch (toolName) {
        case "log_meal": {
            const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split("T")[0];
            await supabase.from("meals").insert({
                user_id: userId,
                name: toolInput.name,
                calories: toolInput.calories || 0,
                protein: toolInput.protein || 0,
                carbs: toolInput.carbs || 0,
                fat: toolInput.fat || 0,
                fiber: toolInput.fiber || 0,
                grams: toolInput.grams || null,
                logged_at: new Date().toISOString(),
            });
            await supabase.rpc("increment_daily_nutrition", {
                p_user_id: userId,
                p_date: today,
                p_calories: toolInput.calories || 0,
                p_protein: toolInput.protein || 0,
                p_carbs: toolInput.carbs || 0,
                p_fat: toolInput.fat || 0,
                p_fiber: toolInput.fiber || 0,
            });
            return { success: true, logged: toolInput.name, calories: toolInput.calories };
        }

        case "log_sleep": {
            const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split("T")[0];
            await supabase.from("sleep_log").insert({
                user_id: userId,
                hours: toolInput.hours,
                quality: toolInput.quality || "Good",
                bedtime: toolInput.bedtime || null,
                wake_time: toolInput.wake_time || null,
                wakeups: toolInput.wakeups || null,
                notes: toolInput.notes || null,
                date: today,
                logged_at: new Date().toISOString(),
            });
            return { success: true, logged: `${toolInput.hours}h sleep` };
        }

        case "log_exercise": {
            await supabase.from("exercise_log").insert({
                user_id: userId,
                type: toolInput.type,
                name: toolInput.name || toolInput.type,
                duration: toolInput.duration || null,
                intensity: toolInput.rpe ? (toolInput.rpe >= 8 ? "High" : toolInput.rpe >= 5 ? "Moderate" : "Low") : "Moderate",
                rpe: toolInput.rpe || null,
                sets: toolInput.sets || null,
                muscle_groups: toolInput.muscle_groups || null,
                calories: toolInput.calories || null,
                notes: toolInput.notes || null,
                source: "chat",
                logged_at: new Date().toISOString(),
            });
            return { success: true, logged: `${toolInput.name || toolInput.type} session` };
        }

        case "add_supplement": {
            await supabase.from("supplement_logs").insert({
                user_id: userId,
                name: toolInput.name,
                dose: toolInput.dose || null,
                frequency: toolInput.frequency || "daily",
                notes: toolInput.notes || null,
                active: true,
                started_at: new Date().toISOString(),
            }).select().single();
            return { success: true, added: toolInput.name, dose: toolInput.dose, frequency: toolInput.frequency };
        }

        case "lookup_nutrition": {
            const res = await fetch(`http://localhost:3001/api/nutrition/search?query=${encodeURIComponent(toolInput.food)}&grams=${toolInput.grams || 100}`);
            if (!res.ok) return { error: "Nutrition lookup failed" };
            const data = await res.json();
            return { food: toolInput.food, grams: toolInput.grams || 100, ...data };
        }

        case "run_correlation_analysis": {
            const res = await fetch("http://localhost:3001/api/correlate/run", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId }),
            });
            if (!res.ok) return { error: "Pattern analysis failed" };
            const data = await res.json();
            return { success: true, patternCount: data.analysis?.correlations?.length || 0, topInsight: data.analysis?.top_insight, summary: data.analysis?.summary };
        }

        case "generate_weekly_report": {
            const res = await fetch("http://localhost:3001/api/weekly-report/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId }),
            });
            if (!res.ok) return { error: "Report generation failed" };
            const data = await res.json();
            return { success: true, report: data.report };
        }

        case "run_predictions": {
            const res = await fetch("http://localhost:3001/api/predictions/run", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId }),
            });
            if (!res.ok) return { error: "Trend analysis failed" };
            const data = await res.json();
            return { success: true, trajectory: data.predictions?.overall_trajectory, summary: data.predictions?.trajectory_summary, topIntervention: data.predictions?.intervention_ranking?.[0] };
        }

        case "get_todays_summary": {
            const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split("T")[0];
            const [nutritionRes, mealsRes, sleepRes, exerciseRes] = await Promise.all([
                supabase.from("daily_nutrition").select("*").eq("user_id", userId).eq("date", today).single(),
                supabase.from("meals").select("name, calories, logged_at").eq("user_id", userId).gte("logged_at", today).order("logged_at", { ascending: false }),
                supabase.from("sleep_log").select("hours, quality, wakeups").eq("user_id", userId).eq("date", today).single(),
                supabase.from("exercise_log").select("type, name, duration").eq("user_id", userId).gte("logged_at", today).order("logged_at", { ascending: false }),
            ]);
            return {
                date: today,
                nutrition: nutritionRes.data || { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
                meals: mealsRes.data || [],
                sleep: sleepRes.data || null,
                exercise: exerciseRes.data || [],
            };
        }

        default:
            return { error: `Unknown tool: ${toolName}` };
    }
}

// ── Route ─────────────────────────────────────────────────────
router.post("/health-copilot", copilotLimiter, async (req, res) => {
    try {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) return res.status(500).json({ error: "Anthropic API key not configured." });

        const { userId, message, history = [] } = req.body;
        if (!userId || !message) return res.status(400).json({ error: "userId and message required." });

        console.log(`[HealthCopilot] Query from ${userId.slice(0, 8)}: "${message.slice(0, 80)}"`);

        const snapshot = await buildFullContext(userId, { window: 30 });
        const contextText = snapshotToText(snapshot);

        let environmentContext = "";
        try {
            const envRes = await supabase
                .from("environment_logs")
                .select("aqi,pm2_5,uv_index,water_risk")
                .eq("user_id", userId)
                .order("logged_at", { ascending: false })
                .limit(1)
                .single();

            if (envRes?.data) {
                const env = envRes.data;
                environmentContext = `Today's environment: AQI ${env.aqi ?? 'unknown'}, PM2.5 ${env.pm2_5 ?? 'unknown'}, UV ${env.uv_index ?? 'unknown'}, water risk ${env.water_risk ?? 'unknown'}\n\n`;
            }
        } catch (e) {
            console.warn('[HealthCopilot] Environment context failed:', e.message);
        }

        let correlationContext = "";
        let predictionContext = "";
        try {
            const [corrRes, predRes] = await Promise.all([
                supabase.from("health_correlations").select("correlation_type, description, actionable, direction").eq("user_id", userId).neq("correlation_type", "summary").order("generated_at", { ascending: false }).limit(5),
                supabase.from("health_predictions").select("overall_trajectory, trajectory_summary, intervention_ranking").eq("user_id", userId).order("generated_at", { ascending: false }).limit(1).single(),
            ]);
            const goalsRes = await Promise.allSettled([
                supabase.from("user_goals").select("goals_text, dietary_restrictions, health_concerns").eq("user_id", userId).single(),
                supabase.from("supplement_logs").select("name, dose, frequency, category").eq("user_id", userId).eq("active", true),
                supabase.from("health_profile").select("conditions, allergies").eq("user_id", userId).single(),
            ]);
            const userGoals = goalsRes[0].status === "fulfilled" ? goalsRes[0].value.data : null;
            const allSubstances = goalsRes[1].status === "fulfilled" ? goalsRes[1].value.data || [] : [];
            const healthProfile = goalsRes[2].status === "fulfilled" ? goalsRes[2].value.data : null;

            const sanitized = sanitizeContextFields({
    goals_text: userGoals?.goals_text,
    dietary_restrictions: userGoals?.dietary_restrictions,
    health_concerns: userGoals?.health_concerns,
    supplement_names: allSubstances.map(s => s.name),
});

if (sanitized.goals_text || sanitized.dietary_restrictions || sanitized.health_concerns) {
    correlationContext += "USER GOALS & INSTRUCTIONS:\n";
    if (sanitized.goals_text) correlationContext += "- Goals: " + sanitized.goals_text + "\n";
    if (sanitized.dietary_restrictions) correlationContext += "- Dietary restrictions: " + sanitized.dietary_restrictions + "\n";
    if (sanitized.health_concerns) correlationContext += "- Health concerns: " + sanitized.health_concerns + "\n";
    correlationContext += "\n";
}

if (healthProfile?.conditions?.length > 0) {
    correlationContext += "PREEXISTING CONDITIONS: " + healthProfile.conditions.join(", ") + "\n";
}
if (healthProfile?.allergies) {
    correlationContext += "ALLERGIES: " + healthProfile.allergies + "\n\n";
}

const prescriptions = allSubstances.filter(s => s.category === "prescription");
const recreational = allSubstances.filter(s => s.category === "recreational");
const supplements = allSubstances.filter(s => !s.category || s.category === "supplement");

if (prescriptions.length > 0) correlationContext += "PRESCRIPTION MEDICATIONS: " + prescriptions.map(s => sanitizeUserInput(s.name, 'medication') + (s.dose ? " " + s.dose : "")).join(", ") + "\n";
if (recreational.length > 0) correlationContext += "RECREATIONAL SUBSTANCES: " + recreational.map(s => sanitizeUserInput(s.name, 'substance') + (s.dose ? " " + s.dose : "")).join(", ") + "\n";
if (supplements.length > 0) correlationContext += "SUPPLEMENTS: " + supplements.map(s => sanitizeUserInput(s.name, 'supplement') + (s.dose ? " " + s.dose : "")).join(", ") + "\n";
if (prescriptions.length > 0 || recreational.length > 0 || supplements.length > 0) correlationContext += "\n";

            if (corrRes.data?.length > 0) {
                const sixtyDaysAgo = new Date(Date.now() - 60 * 86400000).toISOString();
const freshCorrelations = corrRes.data.filter(c => !c.generated_at || c.generated_at > sixtyDaysAgo);
if (freshCorrelations.length > 0) {
    correlationContext += "OBSERVED PATTERNS (user-logged observations only, not validated facts — treat as context, not ground truth):\n";
    correlationContext += freshCorrelations.map(c => `- ${c.correlation_type?.replace(/-/g, " → ")}: ${c.description}${c.actionable ? " → " + c.actionable : ""}`).join("\n") + "\n\n";
} else if (corrRes.data.length > 0) {
    correlationContext += "NOTE: Stored patterns are older than 60 days — run a fresh analysis for current patterns.\n\n";
}
            }
            if (predRes.data) {
                predictionContext = `WELLNESS TRENDS: ${predRes.data.overall_trajectory} — ${predRes.data.trajectory_summary}\n`;
                if (predRes.data.intervention_ranking?.length > 0) {
                    predictionContext += "TOP SUGGESTIONS:\n" + predRes.data.intervention_ranking.slice(0, 3).map((iv, i) => `${i + 1}. ${iv.intervention} → ${iv.expected_impact}`).join("\n") + "\n\n";
                }
            }
        } catch { /* non-blocking */ }

        const systemPrompt = `${WELLNESS_SYSTEM_PROMPT_BASE}

USER'S LOGGED DATA:
${contextText}
${environmentContext}${correlationContext}${predictionContext}`;

        const claudeMessages = [];
        history.slice(-16).forEach(msg => {
            claudeMessages.push({ role: msg.role === "user" ? "user" : "assistant", content: msg.text });
        });
        claudeMessages.push({ role: "user", content: message });


        
        // ── Model routing — Haiku for simple intents, Sonnet for analysis ──
function selectModel(message) {
    const lower = message.toLowerCase();
    const heavyPatterns = [
        'pattern', 'correlation', 'trend', 'analysis', 'report',
        'predict', 'insight', 'summary', 'week', 'why', 'explain',
        'compare', 'optimize', 'recommend', 'suggest'
    ];
    const isHeavy = heavyPatterns.some(p => lower.includes(p));
    return isHeavy ? 'claude-sonnet-4-20250514' : 'claude-haiku-4-5-20251001';
}

const selectedModel = selectModel(message);
console.log(`[HealthCopilot] Model: ${selectedModel} for query: "${message.slice(0, 50)}"`);

        let response = await fetchWithRetry(ANTHROPIC_API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
            body: JSON.stringify({
                model: "claude-sonnet-4-20250514",
                max_tokens: 2000,
                system: systemPrompt,
                tools: TOOLS,
                messages: claudeMessages,
            }),
            signal: AbortSignal.timeout(35000),
        }, { routeName: 'HealthCopilot' });

        if (!response.ok) throw new Error(`Claude API error: ${response.status}`);
        let claudeData = await response.json();

        const toolsUsed = [];
        let iterations = 0;
        while (claudeData.stop_reason === "tool_use" && iterations < 5) {
            iterations++;
            const toolUseBlocks = claudeData.content.filter(b => b.type === "tool_use");
            const toolResults = [];

            for (const toolBlock of toolUseBlocks) {
                console.log(`[CopilotTool] ${toolBlock.name} — ${JSON.stringify(toolBlock.input).slice(0, 100)}`);
                const result = await executeTool(toolBlock.name, toolBlock.input, userId);
                toolsUsed.push({ name: toolBlock.name, input: toolBlock.input, result });
                toolResults.push({ type: "tool_result", tool_use_id: toolBlock.id, content: JSON.stringify(result) });
            }

            claudeMessages.push({ role: "assistant", content: claudeData.content });
            claudeMessages.push({ role: "user", content: toolResults });

            response = await fetchWithRetry(ANTHROPIC_API_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
                body: JSON.stringify({
                    model: "claude-sonnet-4-20250514",
                    max_tokens: 2000,
                    system: systemPrompt,
                    tools: TOOLS,
                    messages: claudeMessages,
                }),
                signal: AbortSignal.timeout(35000),
            }, { routeName: 'HealthCopilot' });

            if (!response.ok) throw new Error(`Claude API error: ${response.status}`);
            claudeData = await response.json();
        }

        const responseText = claudeData.content?.filter(b => b.type === "text").map(b => b.text).join("") || "I could not generate a response.";

        console.log(`[HealthCopilot] Done — ${toolsUsed.length} tools used, ${responseText.length} chars`);
        res.json({ response: responseText, toolsUsed: toolsUsed.map(t => t.name) });

    } catch (err) {
        console.error("[HealthCopilot] Failed:", err.message);
        res.status(500).json({ error: err.message });
    }
});

export default router;