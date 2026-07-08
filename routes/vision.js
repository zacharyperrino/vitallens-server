// ─── Vision Scan Route ────────────────────────────────────────
// POST /api/vision-scan
// Multipart: image file + optional userId
// Uses GPT-4o Vision with comprehensive food detection prompt.

import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { checkAndIncrementUsage } from '../services/usage-gates.js';
import { trackCost } from '../services/cost-tracker.js';
dotenv.config();

const router = Router();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp'];
        allowed.includes(file.mimetype) ? cb(null, true) : cb(new Error('Only JPEG, PNG, WebP accepted.'));
    },
});

const visionLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    message: { error: 'Vision scan rate limit exceeded.' },
});

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

// Strict schema — guarantees parseable JSON matching the shape VISION_PROMPT asks for.
const MEAL_SCAN_SCHEMA = {
    type: 'json_schema',
    json_schema: {
        name: 'meal_scan',
        strict: true,
        schema: {
            type: 'object',
            additionalProperties: false,
            required: ['foods', 'meal_description', 'meal_context', 'cuisine_type', 'meal_setting', 'scale_anchor_found', 'scale_anchor_notes', 'portion_calibration', 'restaurant_detected', 'restaurant_confidence'],
            properties: {
                foods: {
                    type: 'array',
                    items: {
                        type: 'object',
                        additionalProperties: false,
                        required: ['label', 'display_name', 'confidence', 'estimated_grams', 'cooking_method', 'box'],
                        properties: {
                            label: { type: 'string' },
                            display_name: { type: 'string' },
                            confidence: { type: 'number' },
                            estimated_grams: { type: 'number' },
                            cooking_method: { type: 'string', enum: ['grilled', 'fried', 'steamed', 'baked', 'raw', 'roasted', 'sauteed', 'boiled', 'unknown'] },
                            box: { type: 'array', items: { type: 'number' } },
                        },
                    },
                },
                meal_description: { type: 'string' },
                meal_context: { type: 'string', enum: ['breakfast', 'lunch', 'dinner', 'snack', 'unknown'] },
                cuisine_type: { type: 'string' },
                meal_setting: { type: 'string', enum: ['home_cooked', 'fast_food', 'casual_restaurant', 'fine_dining', 'packaged', 'food_truck', 'unknown'] },
                scale_anchor_found: { type: 'string', enum: ['hand', 'fork', 'plate', 'bowl', 'cup', 'phone', 'card', 'packaging', 'none'] },
                scale_anchor_notes: { type: 'string' },
                portion_calibration: { type: 'string', enum: ['home_portion', 'restaurant_portion', 'fast_food_portion', 'fine_dining_portion', 'unknown'] },
                restaurant_detected: { type: 'string' },
                restaurant_confidence: { type: 'number' },
            },
        },
    },
};

const VISION_PROMPT = `You are a world-class food recognition and nutrition AI, specialized in estimating calories and portions from photos with the highest possible accuracy. Your job is identical to what a professional sports nutritionist would do when handed a photo of a meal.

STEP 1 — RESTAURANT & BRAND VISUAL RECOGNITION
Before anything else, scan the image for visual indicators of known restaurants or brands:
- Packaging: boxes, bags, cups, wrappers with logos or brand colors
- Containers: recognizable takeout containers (Chipotle foil bowls, McDonald's red boxes, Starbucks green cups)
- Presentation style: In-N-Out paper wrapping, Shake Shack wax paper, Chick-fil-A waffle fries shape
- Food appearance: Panda Express orange chicken color/texture, Taco Bell distinctive taco shells
- Branded cups, napkins, trays, or receipts visible in frame
- Color schemes: Chipotle silver foil, McDonald's yellow/red, KFC red/white striped bucket
If you visually identify a restaurant, set restaurant_detected to that restaurant name with high confidence. Restaurant data is exact — this is the most accurate path.

STEP 2 — SCALE ANCHOR DETECTION & CALCULATION
Scan the entire image for ANY reference objects. Check corners and edges too — anchors are often at the periphery.

ANCHOR PRIORITY (use highest available):
1. Human hand — most reliable. Adult palm width ≈ 9cm, thumb width ≈ 2cm, index finger length ≈ 7cm, full hand ≈ 18cm. If a hand is holding food, use finger length to estimate food size directly.
2. Utensils — fork ≈ 19cm total, tines ≈ 4cm, handle ≈ 10cm. Spoon ≈ 15cm. Knife ≈ 22cm.
3. Plate/bowl — dinner plate ≈ 27cm diameter. Side plate ≈ 18cm. Bowl ≈ 15cm diameter, 7cm deep.
4. Cup/glass — standard mug ≈ 9cm tall, 8cm wide. Pint glass ≈ 15cm tall.
5. Phone — iPhone ≈ 14.7cm tall, 7.1cm wide. Android varies 14-17cm.
6. Credit card — exactly 8.5cm x 5.4cm. Very reliable if visible.
7. Food packaging — use visible text size or known product dimensions.
8. Can/bottle — standard 330ml can ≈ 12cm tall, 6.6cm diameter.

HOW TO CALCULATE FROM ANCHOR:
- Measure the anchor in pixels in the image
- Calculate pixels-per-cm ratio from anchor
- Measure food items in pixels
- Convert to real dimensions using ratio
- Estimate volume/grams from dimensions and food density

DENSITY REFERENCES (g per cm³):
- Cooked rice/grains: 0.9 g/cm³
- Cooked meat: 1.0 g/cm³
- Raw vegetables: 0.6 g/cm³
- Cooked vegetables: 0.7 g/cm³
- Bread/baked goods: 0.3 g/cm³
- Cheese: 1.1 g/cm³
- Sauce/liquid: 1.0 g/cm³

IF NO ANCHOR FOUND:
- Note "no scale anchor found — estimates have higher uncertainty"
- Use plate size estimation (standard dinner plate fills most of frame = ~27cm)
- Use food-to-food relative sizing
- Apply conservative bias: add 20% to all gram estimates
- Set confidence to maximum 0.70 for all items

MULTIPLE ANCHORS: If multiple anchors visible, use the largest/most reliable one and note the others as confirmation.

State exactly: what anchor you found, its pixel size, the pixels-per-cm ratio calculated, and how you applied it to each food item.
ANCHOR QUALITY REPORTING:
Rate your anchor quality in scale_anchor_notes:
- EXCELLENT: hand or utensil clearly visible, sharp, unobstructed
- GOOD: plate or bowl visible with clear edges  
- FAIR: partial anchor visible or partially obscured
- POOR: no reliable anchor, using context estimation only

If no hand is visible, add to scale_anchor_notes:
"No hand visible — accuracy reduced. User should include hand or utensil in photo."

SIMULTANEOUS ANCHOR VERIFICATION:
If multiple anchors are visible, cross-check your estimates:
- Estimate grams using anchor 1
- Verify using anchor 2
- If estimates differ by more than 20%, use the average
- Report both anchors and the final verified estimate in scale_anchor_notes

STEP 3 — MEAL CONTEXT
Identify:
- Cuisine type: American, Italian, Japanese, Mexican, Chinese, Indian, Korean, Mediterranean, Thai, etc.
- Setting: home-cooked, fast food, casual restaurant, fine dining, packaged, food truck
- Meal time: breakfast, lunch, dinner, snack
- Portion style: individual serving, shared plate, takeout container, meal prep container
Calibration rules:
- Restaurant portions: multiply home baseline by 1.4
- Fast food: use known chain standard sizes
- Fine dining: smaller, more precise portions
- Meal prep containers: typically 400-600g total
- Home cooked: use baseline grams

STEP 4 — EXHAUSTIVE PLATE DECOMPOSITION
This step is critical. Scan the plate systematically — do not stop at the obvious foods.

QUADRANT SCAN METHOD:
Mentally divide the plate into 4 quadrants (top-left, top-right, bottom-left, bottom-right). List every distinct food visible in each quadrant before moving on. This prevents missing items at the edges or partially hidden items.

LAYER DETECTION:
- What is ON TOP of other foods? (cheese on meat, sauce on pasta, dressing on salad)
- What is UNDERNEATH? (rice under curry, lettuce under burger patty, noodles under broth)
- What is INSIDE? (stuffing in a burrito, filling in a dumpling, toppings inside a sandwich)
- What is ON THE SIDE? (dipping sauces, garnishes, side salads, pickle slices)

MANDATORY CHECKS — look specifically for each of these even if not immediately obvious:
□ Protein: meat, fish, eggs, legumes, tofu, cheese as main protein
□ Starch/grain: rice, pasta, bread, potato, noodles, tortilla
□ Vegetables: every type separately — do not write "mixed vegetables"
□ Sauce: any liquid or semi-liquid component >20 calories
□ Fat additions: oil, butter, cream, avocado, nuts
□ Toppings: seeds, croutons, bacon bits, crispy onions, herbs with calories
□ Drinks: any visible beverage — estimate ml
□ Condiments on side: ketchup, mayo, hot sauce, dipping sauce

HIDDEN FOOD RULES:
- If you see a bowl of soup/broth, assume noodles/rice/vegetables underneath unless clearly empty
- If you see a sandwich, list the bread AND every layer of filling separately
- If you see pasta with sauce, list pasta AND sauce separately
- If you see a salad, list the greens AND every topping AND the dressing separately
- If you see a stir fry, list the protein AND each visible vegetable separately
- If you see a curry, list the protein AND sauce AND the grain it sits on

MINIMUM ITEM COUNTS (if below these, look harder):
- Simple plate (one protein, one side): minimum 2 items
- Standard meal: minimum 3-4 items
- Complex plate (Asian, Mediterranean, Indian): minimum 5-7 items
- Salad: minimum 4 items
- Sandwich/burger: minimum 4 items (bread x2 + protein + at least 1 topping)
- Bowl meal (burrito bowl, poke bowl): minimum 5 items
- Pizza slice: minimum 3 items (dough, sauce, cheese + toppings)

NAMING RULES:
- Be maximally specific: "jasmine_rice" not "rice", "grilled_chicken_thigh" not "chicken"
- Always include cooking method in protein names
- Include preparation state: "raw_spinach" vs "sauteed_spinach"
- Include sauce type when visible: "teriyaki_glazed_salmon" not just "salmon"

CALORIE-SIGNIFICANT THRESHOLD:
Include any component that adds more than 20 calories. This includes:
- Olive oil drizzle (~40 cal per tsp)
- Parmesan shaving (~20 cal per tbsp)
- Avocado slice (~50 cal per slice)
- Croutons (~30 cal per small handful)
- Salad dressing (~70-120 cal per tbsp)

Protein naming — be maximally specific:
"pan_seared_salmon_fillet" not "fish"
"grilled_chicken_thigh" not "chicken"
"beef_skirt_steak" not "meat"
"scrambled_eggs" not "eggs"
"breaded_fried_shrimp" not "shrimp"

PARTIAL AND CUT FOOD RULES:
- Half-eaten food: estimate the ORIGINAL full portion before eating began, note it is partially eaten
- Cut or sliced food: count all pieces as one item, estimate the total combined weight
- Food partially off-frame: note it is cut off and add 20% to the visible estimate

BOWL AND VESSEL DEPTH ESTIMATION:
- Shallow bowl (under 4cm deep): multiply visible surface area estimate by 1.2
- Standard bowl (4-7cm deep): multiply visible surface area estimate by 1.5
- Deep bowl or cup (over 7cm): multiply visible surface area estimate by 2.0
- Ramen/soup bowl: always assume liquid fills at least 60% of volume, solids sit underneath

SAUCE VOLUME ESTIMATION:
- Light drizzle: 10-20g
- Light coating on food: 20-40g
- Heavy sauce coating: 40-80g
- Sauce pooled on plate: 60-120g
- Sauce in separate ramekin: measure ramekin size, typically 30-60ml

NON-CALORIC VS CALORIC GARNISH:
Include these (caloric): herbs in large quantities, edible flowers with oil, microgreens, crispy shallots, toasted sesame seeds, pomegranate seeds, citrus zest if significant
Exclude these (non-caloric): single herb leaf garnish under 5 calories, decorative flower not meant to eat, paper/skewer/toothpick

DENSITY ADJUSTMENT FOR COOKING STATE:
- Raw meat shrinks 25% when cooked — if you see cooked meat, the raw weight was higher but estimate the COOKED weight as that is what is being eaten
- Pasta doubles in weight when cooked — 80g dry pasta becomes 160g cooked
- Rice approximately doubles — 80g dry rice becomes 160g cooked
- Vegetables lose 20-30% weight when cooked — estimate the cooked weight

CONFIDENCE PENALTY RULES:
Reduce confidence by 0.10 for each of these conditions:
- Food is partially obscured by another food
- Sauce covers more than 50% of the food surface
- Food is in a closed container (estimate from container size)
- Lighting causes significant shadows over the food
- Image is blurry or low resolution in that area
Never report confidence above 0.85 unless anchor is EXCELLENT rated and food is fully visible

STEP 5 — GRAM ESTIMATION
For each food:
1. Use scale anchor if found — calculate actual size from reference
2. Apply meal context multiplier
3. Use visual depth and density (thick steak vs thin cutlet, full bowl vs half bowl)
4. CONSERVATIVE BIAS RULE: always choose the higher estimate when uncertain
   - Between 180g and 220g — choose 220g
   - Between 300 and 400 cal — choose 400 cal
   - Underestimating calories causes worse health outcomes

REFERENCE BASELINES (home portion, adjust for context):
Proteins: chicken breast 180g, chicken thigh 150g, steak 220g, salmon 170g, shrimp 140g, 2 eggs 100g
Grains: cooked rice 160g, cooked pasta 180g, bread slice 30g, tortilla 45g
Vegetables: broccoli 90g, salad 120g, roasted veg 100g
Sauces: significant sauce 30-60g

STEP 6 — CONFIDENCE
0.90-1.00: clearly visible, scale anchor present, restaurant confirmed visually
0.70-0.89: visible, minor uncertainty on type or portion
0.50-0.69: partially obscured or under sauce
0.25-0.49: limited visual info
Below 0.25: exclude

Respond ONLY with valid JSON, no markdown, no other text:
{
  "foods": [
    {
      "label": "food_name_lowercase_underscores",
      "display_name": "Human Readable Name",
      "confidence": 0.92,
      "estimated_grams": 220,
      "cooking_method": "grilled|fried|steamed|baked|raw|roasted|sauteed|boiled|unknown",
      "box": [0.1, 0.1, 0.9, 0.9]
    }
  ],
  "meal_description": "Full description: what anchor was found, how portions were calibrated, restaurant visual evidence",
  "meal_context": "breakfast|lunch|dinner|snack",
  "cuisine_type": "american|italian|japanese|mexican|chinese|indian|korean|mediterranean|thai|other",
  "meal_setting": "home_cooked|fast_food|casual_restaurant|fine_dining|packaged|food_truck|unknown",
  "scale_anchor_found": "hand|fork|plate|bowl|cup|phone|card|packaging|none",
  "scale_anchor_notes": "exactly what anchor was found and how it was used",
  "portion_calibration": "home_portion|restaurant_portion|fast_food_portion|fine_dining_portion|unknown",
  "restaurant_detected": "McDonald's|Chipotle|Starbucks|Subway|Chick-fil-A|Panda Express|Taco Bell|Burger King|Domino's|Panera|Wendy's|Shake Shack|In-N-Out|Popeyes|Dunkin|Pizza Hut|KFC|Five Guys|Raising Cane's|none",
  "restaurant_confidence": 0.0
}

Rules:
- restaurant_detected is "none" unless you have strong visual evidence from packaging, containers, or unmistakable brand presentation
- Always decompose complex plates into every individual component — never lump foods together
- Always identify cooking method for proteins
- Always look for and use scale anchors
- Always bias toward higher gram estimates when uncertain
- Include drinks visible in frame
- Include calorie-significant sauces
- label must be lowercase_with_underscores
- box is [x1,y1,x2,y2] normalized 0-1, estimate if needed
- If no food detected: {"foods":[],"meal_description":"No food detected","meal_context":"unknown","cuisine_type":"unknown","meal_setting":"unknown","scale_anchor_found":"none","scale_anchor_notes":"","portion_calibration":"unknown","restaurant_detected":"none","restaurant_confidence":0}`;

// ── Route ─────────────────────────────────────────────────────
router.post('/vision-scan', visionLimiter, upload.single('image'), async (req, res, next) => {
    try {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) return res.status(500).json({ error: 'OpenAI API key not configured.' });

        // ── Usage gate ────────────────────────────────────────
        const userId = req.body?.userId;
        if (userId) {
            const gate = await checkAndIncrementUsage(userId, 'food_vision_scan');
            if (!gate.allowed) return res.status(429).json({ error: gate.message, upgradeRequired: true });
        }

        // ── Barcode-first gate ────────────────────────────────
        // Prefer exact barcode data over GPT-4o vision. Only fall
        // through to GPT-4o when no barcode result is available.
        const formatBarcodeResult = (product) => ({
            detections: [{
                label: product.product_name,
                display_name: product.product_name,
                estimated_grams: 100,
                confidence: 0.95,
                cooking_method: 'unknown',
                box: [0, 0, 1, 1],
            }],
            meal_description: 'Barcode scan result',
            source: 'barcode',
        });

        // 2 — pre-fetched barcode result from the frontend
        if (req.body?.barcodeData) {
            let pre = req.body.barcodeData;
            try {
                if (typeof pre === 'string') pre = JSON.parse(pre);
            } catch { pre = null; }
            const product = pre?.product || pre;
            if (product?.product_name && product?.nutriments) {
                console.log(`[Vision] Barcode hit: ${product.product_name}`);
                return res.json(formatBarcodeResult(product));
            }
        }

        // 1 — barcode lookup against Open Food Facts
        if (req.body?.barcode) {
            try {
                const offRes = await fetch(
                    `https://world.openfoodfacts.org/api/v0/product/${req.body.barcode}.json`,
                    { signal: AbortSignal.timeout(8000) },
                );
                if (offRes.ok) {
                    const offData = await offRes.json();
                    const product = offData?.product;
                    if (product?.product_name && product?.nutriments) {
                        console.log(`[Vision] Barcode hit: ${product.product_name}`);
                        return res.json(formatBarcodeResult(product));
                    }
                }
            } catch (e) {
                console.warn('[Vision] Open Food Facts lookup failed:', e.message);
            }
        }

        console.log('[Vision] No barcode — falling through to GPT-4o');

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

        let prompt = VISION_PROMPT;
        const correctionHints = req.body?.correctionHints;
        if (correctionHints) {
            prompt += `\n\nUSER CORRECTION HISTORY — apply these with high priority:\n${correctionHints}`;
            console.log('[Vision] Injecting corrections from client hints');
            console.log('[Vision] Correction content:\n' + correctionHints);
        }

        const todayMeals = req.body?.todayMeals;
        if (todayMeals) {
            try {
                const meals = JSON.parse(todayMeals);
                if (meals.length > 0) {
                    const mealList = meals.map(m => `- ${m.name} (~${m.calories || '?'} cal, logged at ${m.time || 'earlier today'})`).join('\n');
                    prompt += `\n\nALREADY LOGGED TODAY — do NOT re-detect these as new items unless they are clearly a different portion or meal:\n${mealList}\nFocus only on NEW foods not already accounted for.`;
                    console.log(`[Vision] Injecting ${meals.length} already-logged meals as context`);
                }
            } catch { /* ignore parse errors */ }
        }

        // IMAGE PRIVACY: image sent directly to provider, never stored locally
        const response = await fetch(OPENAI_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: 'gpt-4o',
                max_tokens: 2000,
                temperature: 0,
                response_format: MEAL_SCAN_SCHEMA,
                messages: [{
                    role: 'user',
                    content: [
                        {
                            type: 'image_url',
                            image_url: {
                                url: `data:${mimeType};base64,${base64Image}`,
                                detail: 'high',
                            },
                        },
                        { type: 'text', text: prompt },
                    ],
                }],
            }),
            signal: AbortSignal.timeout(30000),
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            console.error('[Vision] OpenAI error:', err);
            return res.status(502).json({ error: err.error?.message || `OpenAI error: ${response.status}` });
        }

        const data = await response.json();

await trackCost({
  userId: userId || null,
  route: 'vision-scan',
  model: 'gpt-4o',
  inputTokens:  data.usage?.prompt_tokens     || 0,
  outputTokens: data.usage?.completion_tokens || 0,
  hasImage: true,
});
        const raw = data.choices?.[0]?.message?.content || '';

        let parsed;
        try {
            parsed = JSON.parse(raw);
        } catch {
            console.error('[Vision] JSON parse failed:', raw.slice(0, 200));
            return res.status(422).json({ error: 'Failed to parse vision response.' });
        }

        const foods = parsed.foods || [];
        console.log(`[Vision] ${foods.length} foods detected | Restaurant: ${parsed.restaurant_detected || 'none'} | Anchor: ${parsed.scale_anchor_found || 'none'}`);

        res.json({
            detections: foods,
            meal_description: parsed.meal_description || '',
            meal_context: parsed.meal_context || 'unknown',
            cuisine_type: parsed.cuisine_type || 'unknown',
            meal_setting: parsed.meal_setting || 'unknown',
            scale_anchor_found: parsed.scale_anchor_found || 'none',
            scale_anchor_notes: parsed.scale_anchor_notes || '',
            portion_calibration: parsed.portion_calibration || 'unknown',
            restaurant_detected: parsed.restaurant_detected || 'none',
            restaurant_confidence: parsed.restaurant_confidence || 0,
        });

    } catch (err) {
        next(err);
    }
});

export default router;