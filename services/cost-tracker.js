// server/services/cost-tracker.js
// ─────────────────────────────────────────────────────────────
// Tracks AI API costs per user per call.
// Writes to api_cost_log table in Supabase.
// Query the table to see your real per-user burn rate.
//
// Pricing (update if models change):
//   GPT-4o:           $2.50 / 1M input,  $10.00 / 1M output
//   GPT-4o vision:    $2.50 / 1M input + ~$1.70 per high-detail image
//   Claude Sonnet 4:  $3.00 / 1M input,  $15.00 / 1M output
//   Claude Haiku 4.5: $0.80 / 1M input,   $4.00 / 1M output
// ─────────────────────────────────────────────────────────────

import { supabase } from '../db/supabase.js';

const PRICING = {
  'gpt-4o': {
    input_per_1m:  2.50,
    output_per_1m: 10.00,
    // Vision input is billed as ordinary prompt tokens (already in usage.prompt_tokens);
    // no separate flat fee, or scans are over-reported by ~10%.
  },
  'claude-sonnet-4-20250514': {
    input_per_1m:  3.00,
    output_per_1m: 15.00,
  },
  'claude-haiku-4-5-20251001': {
    input_per_1m:  0.80,
    output_per_1m:  4.00,
  },
  'text-embedding-3-small': {
    input_per_1m:  0.02,
    output_per_1m: 0,
  },
};

/**
 * Calculate cost in USD for a given model and token counts.
 * @param {string} model
 * @param {number} inputTokens
 * @param {number} outputTokens
 * @param {boolean} hasImage - true if a high-detail image was included
 */
export function calculateCost(model, inputTokens, outputTokens, hasImage = false) {
  const pricing = PRICING[model];
  if (!pricing) return 0;

  const inputCost  = (inputTokens  / 1_000_000) * pricing.input_per_1m;
  const outputCost = (outputTokens / 1_000_000) * pricing.output_per_1m;
  const imageCost  = hasImage && pricing.image_high_detail ? pricing.image_high_detail : 0;

  return inputCost + outputCost + imageCost;
}

/**
 * Log a single AI call to the database.
 * Call this immediately after every OpenAI or Anthropic API response.
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {string} params.route        - e.g. 'vision-scan', 'health-copilot', 'parse-labs'
 * @param {string} params.model        - exact model string
 * @param {number} params.inputTokens
 * @param {number} params.outputTokens
 * @param {boolean} [params.hasImage]
 * @param {object} [params.meta]       - any extra info (tool iterations, etc.)
 */
export async function trackCost({
  userId,
  route,
  model,
  inputTokens,
  outputTokens,
  hasImage = false,
  meta = {},
}) {
  const costUsd = calculateCost(model, inputTokens, outputTokens, hasImage);

  const { error } = await supabase.from('api_cost_log').insert({
    user_id:        userId,
    route,
    model,
    input_tokens:   inputTokens,
    output_tokens:  outputTokens,
    has_image:      hasImage,
    cost_usd:       costUsd,
    meta,
    logged_at:      new Date().toISOString(),
  });

  if (error) {
    // Never throw — cost tracking must never break the actual feature
    console.error('[CostTracker] Failed to log cost:', error.message);
  }

  console.log(`[CostTracker] ${route} | ${model} | in:${inputTokens} out:${outputTokens} | $${costUsd.toFixed(5)}`);
  return costUsd;
}