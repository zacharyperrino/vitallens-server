// ─── Biomarker Scan Route ─────────────────────────────────────
// POST /api/biomarker-scan
// Uses Anthropic Claude Vision instead of OpenAI GPT-4o.
// Claude is more permissive for wellness screening use cases.

import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
dotenv.config();
import { fetchWithRetry } from '../services/ai-fetch.js';
import { trackCost } from '../services/cost-tracker.js';

import { WELLNESS_SYSTEM_PROMPT } from '../services/prompts.js';
const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    allowed.includes(file.mimetype) ? cb(null, true) : cb(new Error('Only JPEG, PNG, WebP accepted.'));
  },
});

const biomarkerLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  message: { error: 'Biomarker scan rate limit exceeded.' },
});

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

const PROMPTS = {

  face: `This is for general wellness and educational purposes only. This is not medical advice and does not diagnose, screen for, or assess any disease.

You are a wellness and skincare AI assistant analyzing a facial photograph. Perform a thorough, systematic skin wellness assessment using evidence-based skincare knowledge, functional medicine principles, and traditional wellness frameworks.

STEP 1 — FITZPATRICK SKIN TYPE (assess first — affects all other readings):
Type I: Very fair, always burns, never tans — higher UV sensitivity
Type II: Fair, usually burns, sometimes tans — prone to sun damage
Type III: Medium, sometimes burns, usually tans — moderate sun resilience
Type IV: Olive, rarely burns, always tans — PIH (post-inflammatory hyperpigmentation) risk
Type V: Brown, very rarely burns — PIH common, redness harder to detect
Type VI: Dark brown/black, never burns — conditions present differently, pallor harder to see

STEP 2 — SKIN BARRIER ASSESSMENT:
Intact: even texture, no redness, no tightness signs
Compromised mild: slight redness, minor texture irregularity
Compromised moderate: visible redness, roughness, possible scaling, sensitized
Compromised severe: significant redness, peeling, reactive, barrier dysfunction

STEP 3 — FACIAL ZONE ASSESSMENT (assess each independently):
- Forehead: stress/digestive signals. Breakouts, texture, dehydration. Note horizontal lines (aging/dehydration) vs vertical glabellar lines (chronic stress/liver tension)
- Glabella (between brows): liver/gallbladder signals. Deep furrows, redness, breakouts
- Nose/T-zone: sebum regulation, pore size, blackheads, dilated capillaries
- Left cheek: gut/lung signals. Breakouts, broken capillaries, texture
- Right cheek: liver/digestive signals. Breakouts, redness, texture
- Chin/jawline: hormonal balance. Deep cystic breakouts, jawline definition
- Temples: hydration/gallbladder. Small breakouts, temporal hollowing, dehydration
- Perioral: digestive signals. Cracked corners (B2/iron deficiency), perioral breakouts
- Periorbital (under-eye): kidney/iron/sleep signals. Dark circle tone (purple-blue=vascular/sleep, brown=pigmentation, hollow=volume loss), puffiness severity, fine lines

STEP 4 — STRUCTURAL AGING MARKERS:
- Nasolabial fold depth: shallow=good collagen/hydration, moderate=normal aging, deep=volume loss/dehydration
- Forehead lines: horizontal=aging/dehydration, vertical glabellar=stress/liver, absent=youth or good skin health
- Jowling: none/mild/moderate/significant
- Temporal hollowing: none/mild/moderate/significant (correlates with weight loss, aging, adrenal fatigue)
- Collagen density estimate from skin turgidity, pore size, overall firmness appearance

STEP 5 — BREAKOUT PATTERN:
- Bacterial: inflamed red papules/pustules, clustered, variable distribution
- Fungal: uniform small follicular bumps, forehead-dominant, heat/sweat related
- Hormonal: deep cystic, jawline/chin dominant, cyclical
- Seborrheic: oily flaky patches at eyebrows/nasolabial folds
- Sensitivity/reaction: diffuse redness, scaling, reactive
- Rosacea-like: central face flushing, visible telangiectasia, papules
- Mixed: multiple patterns present

STEP 6 — WELLNESS SIGNALS:
lip condition (dryness, cracked corners), facial symmetry, overall puffiness (kidney/lymphatic), skin tone variation and evenness.

Respond ONLY with valid JSON, no markdown:
{
  "fitzpatrick_type": "I|II|III|IV|V|VI",
  "fitzpatrick_notes": "observed skin type characteristics",
  "overall_skin_score": 78,
  "skin_barrier": "intact|compromised_mild|compromised_moderate|compromised_severe",
  "skin_barrier_notes": "description of barrier status",
  "hydration": "dry|normal|oily|combination|dehydrated",
  "skin_texture": "smooth|rough|uneven|bumpy|crepe_like",
  "skin_tone_evenness": "uniform|mild_variation|significant_variation",
  "collagen_density_estimate": "good|moderate|reduced|significantly_reduced",
  "primary_breakout_type": "none|bacterial|fungal|hormonal|seborrheic|sensitivity|rosacea_like|mixed",
  "breakout_severity": "none|mild|moderate|severe",
  "forehead_lines": {
    "horizontal": "none|mild|moderate|deep",
    "vertical_glabellar": "none|mild|moderate|deep",
    "wellness_note": "what the line pattern may suggest"
  },
  "nasolabial_folds": "shallow|moderate|deep|cannot_assess",
  "jowling": "none|mild|moderate|significant",
  "temporal_hollowing": "none|mild|moderate|significant",
  "zones": {
    "forehead": { "condition": "description", "breakout_type": "none|bacterial|fungal|hormonal|seborrheic|redness|sensitivity", "severity": "clear|mild|moderate|severe", "wellness_signal": "what this may reflect" },
    "glabella": { "condition": "description", "severity": "clear|mild|moderate|severe", "wellness_signal": "what this may reflect" },
    "nose_tzone": { "condition": "description", "severity": "clear|mild|moderate|severe", "wellness_signal": "what this may reflect" },
    "left_cheek": { "condition": "description", "breakout_type": "none|bacterial|fungal|hormonal|seborrheic|redness|sensitivity", "severity": "clear|mild|moderate|severe", "wellness_signal": "what this may reflect" },
    "right_cheek": { "condition": "description", "breakout_type": "none|bacterial|fungal|hormonal|seborrheic|redness|sensitivity", "severity": "clear|mild|moderate|severe", "wellness_signal": "what this may reflect" },
    "chin_jawline": { "condition": "description", "breakout_type": "none|bacterial|fungal|hormonal|seborrheic|redness|sensitivity", "severity": "clear|mild|moderate|severe", "wellness_signal": "what this may reflect" },
    "temples": { "condition": "description", "severity": "clear|mild|moderate|severe", "temporal_hollowing": "none|mild|moderate|significant", "wellness_signal": "what this may reflect" },
    "perioral": { "condition": "description", "severity": "clear|mild|moderate|severe", "wellness_signal": "what this may reflect" },
    "periorbital": { "dark_circles": "none|mild|moderate|severe", "dark_circle_tone": "none|purple_blue|brown|hollow|mixed", "puffiness": "none|mild|moderate|severe", "fine_lines": "none|mild|moderate|severe", "wellness_signal": "what this may reflect" }
  },
  "discoloration": {
    "hormonal_pigmentation": false,
    "dark_spots": false,
    "pallor": false,
    "flushing_redness": false,
    "yellowing_tinge": false,
    "sun_exposure_marks": false,
    "post_breakout_marks": false,
    "hyperpigmentation_pattern": "none|post_inflammatory|melasma_like|sun_damage|mixed"
  },
  "wellness_signals": [{ "indicator": "observation", "significance": "what this may relate to", "urgency": "monitor|discuss_with_doctor|seek_attention", "confidence": "low|moderate|high" }],
  "eyebrow_notes": "normal|outer_third_thinning|sparse|asymmetric",
  "lip_notes": "normal|dry|cracked_corners|pallor|angular_cheilitis",
  "facial_symmetry": "normal|mild_asymmetry|notable_asymmetry",
  "facial_puffiness": "none|mild|moderate|severe",
  "overallScore": 78,
  "riskTier": "Low|Moderate|High",
  "recommendations": ["Specific actionable skincare or wellness recommendation"],
  "suggested_followup": ["Suggested wellness tests or professional consultations"],
  "confidence": "low|moderate|high",
  "disclaimer": "Educational wellness screening tool only. Not a medical diagnosis. Consult a dermatologist for any skin concerns."
}`,

  body: `This is for general wellness and educational purposes only. This is not medical advice and does not diagnose, screen for, or assess any disease.

You are a wellness, movement, and functional health AI assistant analyzing a body photograph. Perform a comprehensive postural, structural, composition, and wellness screening assessment.

STEP 1 — POSTURAL ASSESSMENT (head to toe):

Head & Neck:
- Forward head posture: neutral | mild (1-2cm) | moderate (3-4cm) | severe (5cm+)
- Note: each 2.5cm of forward translation adds ~4.5kg load to cervical spine

Shoulders:
- Position: neutral | mild rounded | moderate rounded | elevated | depressed | asymmetric
- Level: even | right higher | left higher
- Scapular position: neutral | winging | protracted | retracted | asymmetric

Spine:
- Normal: balanced S-curve
- Hyperkyphosis: excessive thoracic rounding (upper back hump)
- Hyperlordosis: excessive lumbar arch (sway back)
- Flat back: reduced natural curves
- Lateral deviation: C-curve or S-curve postural pattern

Pelvis:
- Neutral: ASIS and PSIS level
- Anterior tilt: increased lumbar arch, belly protrudes, glutes appear flat — common in sedentary individuals, tight hip flexors
- Posterior tilt: flattened lumbar curve, tucked pelvis
- Lateral tilt: one hip elevated

Hips, Knees, Feet:
- Hip level: even | right higher | left higher
- Knee alignment: neutral | valgus (knock-knee) | varus (bow-leg) | hyperextension
- Foot position: neutral | pronated (flat) | supinated (high arch) | toeing out | toeing in

STEP 2 — SPINAL SYMMETRY OBSERVATION:
Look for: shoulder height asymmetry, hip height asymmetry, visible lateral spinal deviation, rib cage asymmetry (one side more prominent), waistline asymmetry. Note C-curve vs S-curve pattern if lateral deviation visible.

STEP 3 — ANTERIOR PELVIC TILT INDICATORS:
Excessive lumbar lordosis + protruding abdomen + flat-appearing glutes + forward tilted pelvis = anterior pelvic tilt pattern. Common in people with sedentary lifestyles, tight hip flexors, weak core/glutes.

STEP 4 — MUSCLE IMBALANCE PATTERNS:
- Upper crossed syndrome: forward head + rounded shoulders + tight chest + weak mid-back
- Lower crossed syndrome: anterior pelvic tilt + tight hip flexors + weak glutes/abs
- Lateral imbalance: visible dominant-side hypertrophy or atrophy
- Leg length discrepancy: apparent difference in leg length from hip/shoulder tilt patterns

STEP 5 — BREATHING PATTERN (if chest/torso visible):
- Chest breathing: shoulders visibly rise on inhalation — dysfunctional, stress/anxiety pattern
- Diaphragmatic: abdomen expands on inhalation — functional
- Mixed or cannot assess

STEP 6 — BODY COMPOSITION & WELLNESS:
- Build type: lean | athletic | average | heavier_set
- Fat distribution:
  Android (central/abdominal): apple-shape distribution
  Gynoid (hips/thighs): pear-shape distribution
  Mixed: both patterns
  Lean: minimal visible fat
- Muscle development: well_developed | moderate | low | asymmetric
- Muscle development balance across regions
- Vascular visibility: prominent veins suggest low body fat or dehydration

STEP 7 — LYMPHATIC & FLUID SIGNALS:
- Ankle/lower leg puffiness: general fluid-retention appearance
- Hand puffiness: general fluid-retention appearance
- General facial/body puffiness appearance

STEP 8 — SYMMETRY FULL ASSESSMENT:
Shoulder level difference, hip level difference, apparent arm length difference, apparent leg length difference, overall structural symmetry rating.

Respond ONLY with valid JSON, no markdown:
{
  "overall_wellness_score": 75,
  "posture": {
    "overall_rating": "excellent|good|fair|poor",
    "head_position": "neutral|mild_forward|moderate_forward|severe_forward",
    "shoulder_position": "neutral|mild_rounded|moderate_rounded|elevated|depressed|asymmetric",
    "shoulder_level": "even|right_higher|left_higher",
    "scapular_position": "neutral|winging|protracted|retracted|asymmetric",
    "spinal_pattern": "normal|hyperkyphosis_mild|hyperkyphosis_moderate|hyperlordosis_mild|hyperlordosis_moderate|flat_back|lateral_curve_pattern|combined",
    "lateral_curve_type": "none|c_curve_right|c_curve_left|s_curve|cannot_assess",
    "pelvic_position": "neutral|anterior_tilt_mild|anterior_tilt_moderate|posterior_tilt|lateral_tilt",
    "hip_level": "even|right_higher|left_higher",
    "knee_alignment": "neutral|valgus_mild|valgus_moderate|varus_mild|varus_moderate|hyperextension",
    "foot_position": "neutral|pronated|supinated|toeing_out|toeing_in|mixed",
    "overall_posture_score": 75,
    "primary_observation": "most notable postural finding with functional implication"
  },
  "scoliosis_screen": {
    "shoulder_asymmetry_present": false,
    "hip_asymmetry_present": false,
    "visible_lateral_deviation": false,
    "rib_prominence_asymmetry": false,
    "waistline_asymmetry": false,
    "curve_pattern": "none|c_curve_right|c_curve_left|s_curve|cannot_assess",
    "screen_result": "no_indicators|mild_indicators|moderate_indicators|significant_indicators",
    "recommended_action": "none|monitor|physiotherapy_evaluation|medical_evaluation"
  },
  "anterior_pelvic_tilt": {
    "present": false,
    "severity": "none|mild|moderate|significant",
    "indicators_observed": ["list of visible indicators"],
    "functional_note": "implications for posture, pain, movement"
  },
  "muscle_imbalance": {
    "upper_crossed_syndrome": "none|mild|moderate|significant",
    "lower_crossed_syndrome": "none|mild|moderate|significant",
    "dominant_side_hypertrophy": "none|right|left|cannot_assess",
    "apparent_leg_length_difference": "none|possible_right_longer|possible_left_longer|cannot_assess",
    "notes": "description of observed imbalance patterns"
  },
  "breathing_pattern": {
    "observable": false,
    "pattern": "cannot_assess|chest_dominant|diaphragmatic|mixed",
    "wellness_note": "functional and stress implications"
  },
  "body_composition": {
    "build_type": "lean|athletic|average|heavier_set",
    "fat_distribution": "android_central|gynoid_peripheral|mixed|lean",
    "android_pattern_present": false,
    "metabolic_note": "android fat distribution wellness considerations if applicable",
    "muscle_development": "well_developed|moderate|low|asymmetric",
    "visible_muscle_loss": false,
    "muscle_loss_areas": ["areas if apparent"],
    "vascular_visibility": "normal|prominent_veins|cannot_assess"
  },
  "lymphatic_signals": {
    "ankle_puffiness": "none|mild|moderate|significant",
    "hand_puffiness": "none|mild|moderate|significant",
    "general_puffiness": "none|mild|moderate|significant",
    "wellness_note": "what fluid retention patterns may suggest"
  },
  "symmetry": {
    "shoulder_level": "even|right_higher|left_higher",
    "hip_level": "even|right_higher|left_higher",
    "overall": "symmetric|mild_asymmetry|moderate_asymmetry|significant_asymmetry"
  },
  "wellness_observations": [{ "finding": "specific observation", "location": "body location", "significance": "functional or wellness implication", "urgency": "monitor|discuss_with_doctor|seek_attention", "confidence": "low|moderate|high" }],
  "overallScore": 75,
  "riskTier": "Low|Moderate|High",
  "recommendations": ["Specific actionable exercise or lifestyle recommendation"],
  "suggested_followup": ["Suggested professional assessment — physiotherapist, osteopath, etc."],
  "confidence": "low|moderate|high",
  "image_quality": "good|fair|poor",
  "disclaimer": "Wellness screening tool only. Not a medical diagnosis. Consult a physiotherapist or physician for a full musculoskeletal assessment."
}`,

  tongue: `This is for general wellness and educational purposes only. This is not medical advice and does not diagnose, screen for, or assess any disease.

You are a wellness AI assistant analyzing a tongue photograph using traditional wellness frameworks and nutritional knowledge.

TONGUE BODY: color (pale/pink/red/purple/bluish), size (normal/swollen/thin), moisture (dry/normal/wet), cracks (location/depth), teeth marks, geographic patches, smooth/bald areas.
COATING: thickness (none/thin/moderate/thick), color (white/yellow/grey/black), distribution (full/patchy/one-sided), texture (normal/greasy/dry/wet).
NUTRITIONAL SIGNALS: cracked corners (B2/iron), geographic tongue (B12), smooth bald tongue (iron/B12/folate), white patches (Candida signals).

Respond ONLY with valid JSON, no markdown:
{
  "overall_tongue_score": 72,
  "body": { "color": "pale|pale_pink|normal_pink_red|red|dark_red|purple|bluish|mixed", "color_wellness_note": "what this may suggest", "size": "normal|swollen_enlarged|thin_reduced", "moisture": "dry|normal|excess_wet", "cracks": { "present": false, "locations": ["midline|tip|sides|general|multiple"], "depth": "none|superficial|moderate|deep", "wellness_note": "what cracks may suggest" }, "teeth_marks": false, "teeth_marks_note": "what scalloping may suggest", "geographic_patches": false, "smooth_bald_areas": false, "other_surface_findings": "description" },
  "coating": { "thickness": "none_bare|thin|moderate|thick", "color": "white|yellow|grey|black|mixed|none", "distribution": "full_even|rootless|patchy|front_only|back_only|one_sided", "texture": "normal|greasy_slippery|dry|wet_excess", "coating_wellness_note": "what the coating pattern may suggest" },
  "traditional_wellness_reading": { "primary_pattern": "main wellness pattern", "wellness_areas_noted": ["areas of concern"], "secondary_pattern": "secondary pattern if present" },
  "nutritional_wellness_flags": ["specific nutritional concern"],
  "wellness_signals": [{ "indicator": "observation", "significance": "what this may suggest", "urgency": "monitor|discuss_with_doctor|seek_attention", "confidence": "low|moderate|high" }],
  "overallScore": 72,
  "riskTier": "Low|Moderate|High",
  "recommendations": ["Specific dietary or lifestyle recommendation"],
  "suggested_followup": ["Suggested wellness test or consultation"],
  "confidence": "low|moderate|high",
  "image_quality": "good|fair|poor",
  "disclaimer": "General wellness information only. Not medical advice and not a diagnosis."
}`,

};

// ── Route ─────────────────────────────────────────────────────

router.post('/biomarker-scan', biomarkerLimiter, upload.single('image'), async (req, res, next) => {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Anthropic API key not configured.' });

    const scanType = req.body?.scanType || 'face';
    const userId = req.body?.userId || null;
    // Wellness-observation scan types only. Clinical/condition-inference modes
    // (eye, skin, nail) are retired and hard-rejected here, not just hidden in the UI.
    const ALLOWED_SCANS = ['face', 'body', 'tongue'];
    if (!ALLOWED_SCANS.includes(scanType)) {
      return res.status(400).json({ error: 'Unsupported scan type.' });
    }
    const prompt = PROMPTS[scanType];
    if (!prompt) return res.status(400).json({ error: `Invalid scanType: ${scanType}` });

    let base64Image, mimeType;

    if (req.file) {
      base64Image = req.file.buffer.toString('base64');
      mimeType = req.file.mimetype;
    } else if (req.body?.image) {
      const raw = req.body.image;
      base64Image = raw.replace(/^data:image\/\w+;base64,/, '');
      mimeType = req.body.mimeType || 'image/jpeg';
    } else {
      return res.status(400).json({ error: 'No image provided.' });
    }

    console.log(`[Biomarker] ${scanType} scan requested`);

    // IMAGE PRIVACY: image sent directly to provider, never stored locally
    const claudeRes = await fetchWithRetry(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 3000,
        system: WELLNESS_SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mimeType,
                data: base64Image,
              },
            },
            {
              type: 'text',
              text: prompt,
            },
          ],
        }],
      }),
      signal: AbortSignal.timeout(30000),
    }, { routeName: 'Biomarker' });

    if (!claudeRes.ok) {
      const err = await claudeRes.json().catch(() => ({}));
      console.error('[Biomarker] Claude API error:', err);
      return res.status(502).json({ error: err.error?.message || `Claude API error: ${claudeRes.status}` });
    }

    const claudeData = await claudeRes.json();

    await trackCost({ userId, route: 'biomarker-scan', model: 'claude-sonnet-4-20250514', inputTokens: claudeData.usage?.input_tokens || 0, outputTokens: claudeData.usage?.output_tokens || 0, hasImage: true, meta: { scanType } });

    const raw = claudeData.content?.[0]?.text || '';
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error('[Biomarker] JSON parse failed:', raw.slice(0, 200));
      return res.status(422).json({ error: 'Failed to parse analysis response. Try again.' });
    }

    // Normalize overallScore
    if (parsed.overall_skin_score !== undefined) parsed.overallScore = parsed.overall_skin_score;
    if (parsed.overall_eye_score !== undefined) parsed.overallScore = parsed.overall_eye_score;
    if (parsed.overall_tongue_score !== undefined) parsed.overallScore = parsed.overall_tongue_score;
    if (parsed.overall_nail_score !== undefined) parsed.overallScore = parsed.overall_nail_score;
    if (parsed.overall_wellness_score !== undefined) parsed.overallScore = parsed.overall_wellness_score;

    console.log(`[Biomarker] ${scanType} scan complete — score: ${parsed.overallScore}`);
    res.json(parsed);

  } catch (err) {
    next(err);
  }
});

export default router;