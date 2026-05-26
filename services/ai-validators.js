import { z } from 'zod';

const WellnessScore = z.number().min(0).max(100);
const Confidence = z.enum(['low', 'moderate', 'high']).optional();
const Direction = z.enum(['positive', 'negative', 'neutral']).optional();
const Trajectory = z.enum(['improving', 'declining', 'stable', 'mixed']);
const DataSufficiency = z.enum(['rich', 'moderate', 'sparse']);

const CorrelationItem = z.object({
  domain_a: z.string().max(100),
  domain_b: z.string().max(100),
  finding: z.string().max(1000),
  strength: z.enum(['consistent', 'emerging', 'early_hint', 'insufficient_data', 'strong', 'moderate', 'weak']).optional(),
  direction: Direction,
  actionable: z.string().max(500).optional(),
  data_points: z.number().min(0).max(10000).optional(),
});

export const CorrelationSchema = z.object({
  correlations: z.array(CorrelationItem).max(20),
  top_insight: z.string().max(500),
  data_quality: DataSufficiency,
  insufficient_domains: z.array(z.string()).optional(),
  summary: z.string().max(1000),
});

const TrendItem = z.object({
  metric: z.string().max(100),
  current_value: z.string().max(200),
  direction: Trajectory,
  projected_7d: z.string().max(200),
  projected_14d: z.string().max(200).optional(),
  confidence: Confidence,
  confidence_reason: z.string().max(500).optional(),
  worth_watching: z.string().max(500).nullable().optional(),
  alert: z.string().max(500).nullable().optional(),
  positive: z.string().max(500).nullable().optional(),
});

const InterventionItem = z.object({
  rank: z.number().min(1).max(20),
  intervention: z.string().max(500),
  expected_impact: z.string().max(500),
  effort: z.enum(['low', 'medium', 'high']),
  timeframe: z.string().max(200),
  based_on: z.string().max(500).optional(),
});

export const PredictionSchema = z.object({
  trend_extrapolations: z.array(TrendItem).max(20),
  intervention_ranking: z.array(InterventionItem).max(20),
  overall_trajectory: Trajectory,
  trajectory_summary: z.string().max(1000),
  data_sufficiency: DataSufficiency,
  minimum_data_needed: z.string().max(500).optional(),
});

export const WeeklyReportSchema = z.object({
  headline: z.string().max(300),
  week_score: WellnessScore,
  wins: z.array(z.string().max(300)).max(5),
  patterns_to_explore: z.array(z.string().max(300)).max(5).optional(),
  gaps: z.array(z.string().max(300)).max(5).optional(),
  top_connection: z.string().max(500).optional(),
  top_correlation: z.string().max(500).optional(),
  focus: z.string().max(500),
  data_completeness: z.union([z.string(), z.number()]).optional(),
});

export const BiomarkerSchema = z.object({
  overallScore: z.number().min(0).max(100),
  confidence: z.enum(['low', 'moderate', 'high']).optional(),
  riskTier: z.enum(['Low', 'Moderate', 'High']).optional(),
  recommendations: z.array(z.string().max(500)).max(10).optional(),
  disclaimer: z.string().optional(),
}).passthrough();

// ── Food Scanner (GPT-4o Vision) ──────────────────────────────
export const FoodDetectionSchema = z.object({
    detections: z.array(z.object({
        name: z.string().max(200),
        calories: z.number().min(0).max(5000),
        protein: z.number().min(0).max(500).optional(),
        carbs: z.number().min(0).max(500).optional(),
        fat: z.number().min(0).max(500).optional(),
        grams: z.number().min(0).max(5000).optional(),
    })).max(50),
    restaurant_detected: z.string().optional(),
    meal_description: z.string().max(500).optional(),
}).passthrough();

// ── Lab Parser (GPT-4o) ───────────────────────────────────────
export const LabParseSchema = z.object({
    panel_type: z.string().max(100).optional(),
    markers: z.record(z.object({
        value: z.union([z.number(), z.string()]),
        unit: z.string().max(50).optional(),
        status: z.enum(['normal', 'low', 'high', 'critical']).optional(),
    })).optional(),
}).passthrough();

export function validateOrThrow(schema, data, routeName) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
    console.error(`[ZodValidation] ${routeName} failed: ${issues}`);
    throw new Error(`AI output validation failed: ${issues}`);
  }
  return result.data;
}
