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

  face: `This is for educational wellness screening purposes only, not medical diagnosis or treatment.

You are a wellness and skincare AI assistant analyzing a facial photograph. Perform a thorough, systematic skin wellness assessment using evidence-based skincare knowledge, functional medicine principles, and traditional wellness frameworks.

STEP 1 — FITZPATRICK SKIN TYPE (assess first — affects all other readings):
Type I: Very fair, always burns, never tans — high UV sensitivity, melanoma risk
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
Eyebrow outer-third thinning (thyroid signal), lip condition (cracked corners=B2/iron, pallor=anemia), facial symmetry, overall puffiness (kidney/lymphatic), skin tone anomalies (pallor=anemia, yellowing=liver, flushing=rosacea/hormonal).

Respond ONLY with valid JSON, no markdown:
{
  "fitzpatrick_type": "I|II|III|IV|V|VI",
  "fitzpatrick_notes": "observed skin type characteristics and clinical implications",
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

  eye: `This is for educational wellness screening purposes only, not medical diagnosis or treatment.

You are a wellness AI assistant analyzing an eye photograph for general ocular wellness indicators.

CONJUNCTIVAL CHECK: color (normal pink vs pale vs irritated), pallor severity.
SCLERAL CHECK: color (normal vs yellowing tinge vs bloodshot), vascularity.
PERIORBITAL CHECK: puffiness, dark circles (tone: purple/blue vs brown vs hollow), yellow deposits near inner corner.
EYELID CHECK: drooping, swelling.

Respond ONLY with valid JSON, no markdown:
{
  "overall_eye_score": 82,
  "conjunctiva": { "color": "normal_pink|pale_mild|pale_moderate|pale_severe|irritated_red", "pallor_present": false, "pallor_severity": "none|mild|moderate|severe", "pallor_notes": "description", "wellness_note": "what this may reflect" },
  "sclera": { "color": "white_normal|yellow_tinge_mild|yellow_tinge_moderate|bloodshot_mild|bloodshot_moderate|bloodshot_severe", "yellowing_present": false, "yellowing_severity": "none|mild|moderate", "vascularity": "normal|mildly_increased|significantly_increased", "red_patch_present": false, "wellness_note": "what this may reflect" },
  "periorbital": { "puffiness": "none|mild|moderate|severe", "puffiness_pattern": "none|bilateral|unilateral|upper_lid|lower_lid|general", "dark_circles": "none|mild|moderate|severe", "dark_circle_tone": "none|purple_blue|brown|hollow|mixed", "xanthelasma_present": false, "wellness_notes": ["observations"] },
  "eyelids": { "drooping_present": false, "drooping_severity": "none|mild|moderate", "other_findings": "description" },
  "wellness_signals": [{ "indicator": "observation", "significance": "what this may relate to", "urgency": "monitor|discuss_with_doctor|seek_attention", "confidence": "low|moderate|high" }],
  "overallScore": 82,
  "riskTier": "Low|Moderate|High",
  "recommendations": ["Specific actionable wellness recommendation"],
  "suggested_followup": ["Suggested tests or consultations"],
  "confidence": "low|moderate|high",
  "image_quality": "good|fair|poor",
  "disclaimer": "Wellness screening tool only. Not a medical diagnosis. Consult an eye care professional for any concerns."
}`,

  skin: `This is for educational wellness screening purposes only, not medical diagnosis or treatment.

You are a skincare wellness AI assistant performing comprehensive dermatological wellness screening on a skin photograph.

STEP 1 — FITZPATRICK SKIN TYPE:
Type I-II: Very fair to fair — high UV sensitivity, easy to assess redness
Type III-IV: Medium to olive — moderate UV resilience, PIH risk
Type V-VI: Brown to dark — conditions present differently, hyperpigmentation common
Note: adjust lesion color assessment and pigmentation interpretation based on type.

STEP 2 — ABCDE LESION FRAMEWORK (if any lesion visible):
A — Asymmetry: one half unlike the other (concerning if present)
B — Border: irregular, ragged, notched, or blurred edges (concerning if present)
C — Color: variation in shades — tan, brown, black, red, white, blue (multiple colors concerning)
D — Diameter: estimate relative to known anchors — over 6mm warrants evaluation
E — Evolution: note if user should monitor for change; prompt for history if ambiguous

STEP 3 — INFLAMMATION PATTERN:
- Psoriasis-like: well-defined red plaques with silvery/white scale, Koebner phenomenon
- Eczema-like: poorly defined red, scaly, itchy patches, flexural/crease distribution
- Contact reaction: geometric or linear distribution suggesting external trigger
- Seborrheic-like: greasy yellowish scale on erythematous base
- Follicular: inflammation centered on hair follicles
- Rosacea-like: central face, telangiectasia, papules, flushing
- Mixed: multiple patterns present

STEP 4 — HYPERPIGMENTATION PATTERN:
- Post-inflammatory (PIH): follows previous lesion or injury distribution
- Melasma-like: symmetric, sun-exposed areas, hormonal/UV pattern
- Sun damage: random discrete spots, sun-exposed distribution
- Diffuse: even darkening suggesting systemic or medication cause

STEP 5 — TEXTURE & STRUCTURAL FINDINGS:
- Keratosis pilaris: rough follicular bumps on upper arms, thighs, cheeks
- Xerosis: generalized dryness, fine white scaling
- Lichenification: thickened leathery skin from chronic scratching
- Skin atrophy: thinned translucent appearance, easy bruising signs

STEP 6 — STRETCH MARKS:
- Fresh/active: red or purple — recent stretching, collagen disruption
- Mature/old: white or silver — established, collagen remodeled
- Distribution: abdomen, hips, thighs, breasts, upper arms — note pattern

STEP 7 — VASCULAR ASSESSMENT:
- Telangiectasia: fine dilated capillaries, spider-like
- Spider angioma: central vessel with radiating branches (liver signal if multiple)
- Purpura/petechiae: non-blanching spots (coagulation/platelet signal if widespread)
- Livedo reticularis: mottled net-like pattern (circulation/autoimmune signal)

Respond ONLY with valid JSON, no markdown:
{
  "overall_skin_score": 85,
  "fitzpatrick_type": "I|II|III|IV|V|VI",
  "fitzpatrick_notes": "observed characteristics and implications for assessment",
  "lesion_present": false,
  "lesion_assessment": {
    "present": false,
    "count": 0,
    "asymmetry": "symmetric|mildly_asymmetric|asymmetric",
    "border": "regular|slightly_irregular|irregular",
    "color": "uniform|mild_variation|significant_variation",
    "diameter_estimate": "under_6mm|approximately_6mm|over_6mm|cannot_assess",
    "evolution_note": "user should monitor for changes or describe history",
    "abcde_concern_count": 0,
    "likely_pattern": "common_benign|worth_evaluation|multiple_concerns|cannot_determine",
    "recommended_action": "routine_monitoring|watch_for_changes|professional_evaluation_recommended|prompt_evaluation"
  },
  "inflammation": {
    "present": false,
    "pattern": "none|psoriasis_like|eczema_like|contact_reaction|seborrheic_like|follicular|rosacea_like|mixed",
    "severity": "none|mild|moderate|severe",
    "distribution": "localized|regional|widespread",
    "wellness_note": "what this pattern may suggest systemically"
  },
  "hyperpigmentation": {
    "present": false,
    "pattern": "none|post_inflammatory|melasma_like|sun_damage|diffuse|mixed",
    "severity": "none|mild|moderate|significant",
    "wellness_note": "hormonal, UV, or inflammatory cause considerations"
  },
  "texture_findings": {
    "overall": "smooth|rough|scaly|bumpy|lichenified|atrophic",
    "keratosis_pilaris": false,
    "xerosis": false,
    "lichenification": false,
    "atrophy": false,
    "notes": "description of texture findings"
  },
  "stretch_marks": {
    "present": false,
    "stage": "none|fresh_active|mature_old|mixed",
    "distribution": "description of areas affected",
    "wellness_note": "rapid weight change, growth, hormonal, or pregnancy signals"
  },
  "scarring": {
    "present": false,
    "type": "none|atrophic|hypertrophic|keloid|mixed",
    "severity": "none|mild|moderate|significant"
  },
  "skin_condition": {
    "hydration": "dry|normal|oily|dehydrated",
    "sun_exposure_evident": false,
    "sun_damage_severity": "none|mild|moderate|significant",
    "other_findings": "any additional observations"
  },
  "vascular_observations": {
    "telangiectasia": false,
    "spider_angioma": false,
    "purpura_petechiae": false,
    "livedo_reticularis": false,
    "severity": "none|mild|moderate|significant",
    "notes": "description of vascular findings",
    "wellness_note": "what vascular patterns may suggest"
  },
  "wellness_signals": [{ "indicator": "observation", "significance": "what this may suggest", "urgency": "monitor|discuss_with_doctor|seek_attention", "confidence": "low|moderate|high" }],
  "overallScore": 85,
  "riskTier": "Low|Moderate|High",
  "recommendations": ["Specific actionable skincare recommendation"],
  "suggested_followup": ["Suggested professional evaluation if warranted"],
  "confidence": "low|moderate|high",
  "image_quality": "good|fair|poor",
  "disclaimer": "Wellness screening tool only. Not a medical diagnosis. Any skin concern should be evaluated by a dermatologist."
}`,

  body: `This is for educational wellness screening purposes only, not medical diagnosis or treatment.

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
- Lateral deviation: C-curve or S-curve pattern — scoliosis indicator

Pelvis:
- Neutral: ASIS and PSIS level
- Anterior tilt: increased lumbar arch, belly protrudes, glutes appear flat — common in sedentary individuals, tight hip flexors
- Posterior tilt: flattened lumbar curve, tucked pelvis
- Lateral tilt: one hip elevated

Hips, Knees, Feet:
- Hip level: even | right higher | left higher
- Knee alignment: neutral | valgus (knock-knee) | varus (bow-leg) | hyperextension
- Foot position: neutral | pronated (flat) | supinated (high arch) | toeing out | toeing in

STEP 2 — SCOLIOSIS SCREENING:
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
  Android (central/abdominal): apple shape — associated with insulin resistance, metabolic syndrome risk
  Gynoid (hips/thighs): pear shape — lower metabolic risk
  Mixed: both patterns
  Lean: minimal visible fat
- Muscle development: well_developed | moderate | low | asymmetric
- Visible muscle loss: note atrophy areas if present (temporal, thenar eminence, quadriceps)
- Vascular visibility: prominent veins suggest low body fat or dehydration

STEP 7 — LYMPHATIC & FLUID SIGNALS:
- Ankle/lower leg puffiness: lymphatic congestion, venous insufficiency, kidney signals
- Hand puffiness: lymphatic or kidney signals
- General facial/body puffiness: cortisol, kidney, dietary sodium, thyroid signals

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

  tongue: `This is for educational wellness screening purposes only, not medical diagnosis or treatment.

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
  "disclaimer": "Educational wellness screening tool only. Traditional wellness frameworks are not substitutes for medical evaluation."
}`,

  nail: `This is for educational wellness screening purposes only, not medical diagnosis or treatment.

You are a wellness AI assistant analyzing fingernail photographs for general nail and wellness indicators.

NAIL COLOR: pink (normal), pale/white (nutritional/circulation), yellow (fungal/lymphatic), blue (circulation), brown streak (worth evaluation), horizontal grooves (past illness/stress).
NAIL SHAPE: normal, clubbing (worth attention), spoon nails (iron wellness), horizontal ridges (past illness timing).
NAIL SURFACE: smooth (normal), pitting (skin wellness patterns), separation (thyroid/fungal), brittle (nutritional wellness).
LUNULA: visible/absent/enlarged, color (white normal/red/blue).
FUNGAL PATTERN: yellow-brown thickening, white patches, inflammation.

Respond ONLY with valid JSON, no markdown:
{
  "overall_nail_score": 80,
  "nail_color": "normal_pink|pale|yellow|green_tinge|poor_circulation_blue|brown_streak|white_pattern|mixed",
  "color_pattern": "uniform|mostly_white_pink_tip|horizontal_bands|half_half|brown_streak|other",
  "color_wellness_note": "what the color may suggest",
  "shape": { "morphology": "normal|clubbed|spoon_shaped|pincer|beau_lines|other", "clubbing_present": false, "clubbing_grade": "none|mild|moderate|severe", "clubbing_wellness_note": "what this may suggest", "spoon_shape_present": false, "beau_lines_present": false, "beau_lines_notes": "timing estimate if present" },
  "surface": { "overall": "smooth|pitted|ridged|rough_texture|brittle|separation_present", "pitting_present": false, "separation_present": false, "severity": "none|mild|moderate|severe" },
  "lunula": { "visible": true, "size": "normal|absent|enlarged", "color": "white_normal|red|blue|other" },
  "nail_fold": { "cuticle": "intact_normal|ragged|absent", "redness_present": false, "infection_signs": false, "other_findings": "description" },
  "fungal_pattern": { "suspected": false, "pattern": "none|distal_thickening|proximal_white|surface_white|candida_like", "severity": "none|mild|moderate|severe", "nails_affected": "description" },
  "wellness_signals": [{ "indicator": "observation", "significance": "what this may suggest", "urgency": "monitor|discuss_with_doctor|seek_attention", "confidence": "low|moderate|high", "wellness_areas": ["list of wellness areas"] }],
  "overallScore": 80,
  "riskTier": "Low|Moderate|High",
  "recommendations": ["Specific actionable recommendation"],
  "suggested_followup": ["Suggested wellness test or consultation"],
  "confidence": "low|moderate|high",
  "image_quality": "good|fair|poor",
  "disclaimer": "Educational wellness screening tool only. Nail observations require professional examination. Not a medical diagnosis."
}`

};

// ── Route ─────────────────────────────────────────────────────

router.post('/biomarker-scan', biomarkerLimiter, upload.single('image'), async (req, res, next) => {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Anthropic API key not configured.' });

    const scanType = req.body?.scanType || 'face';
    const userId = req.body?.userId || null;
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