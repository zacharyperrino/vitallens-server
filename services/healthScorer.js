// ─── Health Scoring Algorithm ────────────────────────────────
// Original 0–100 scoring system for food products.
// NOT a Yuka reproduction — this is VitalLens's own formula.
//
// Base = 60, then penalties subtract and bonuses add.
// Final = clamp(0, 100, base + bonuses − penalties)

/**
 * Compute health score for a product.
 *
 * @param {object} nutrition — per 100g values:
 *   { calories, protein, carbs, sugar, fat, saturated_fat, fiber, sodium }
 *   (sodium in mg, everything else in g except calories in kcal)
 *
 * @param {string[]} additives — array of E-codes e.g. ["E621", "E951"]
 *
 * @param {object} [additiveRiskMap] — map of code → risk_level from DB
 *   e.g. { "E621": "moderate", "E951": "high" }
 *
 * @param {object} [personalProfile] — optional user profile for personalized scoring
 *   { diabetic, hypertension, heartDisease, athletic, pregnant, celiac }
 *
 * @returns {{ score, rating, color, positives, negatives, breakdown }}
 */
export function computeHealthScore(nutrition, additives = [], additiveRiskMap = {}, personalProfile = {}) {
    const n = normalizeNutrition(nutrition);
    const breakdown = {};
    const positives = [];
    const negatives = [];

    // ─── Penalties ──────────────────────────────────────────
    const sugarMultiplier = personalProfile.diabetic ? 2.0 : 1.0;
    const sugarPenalty = Math.min(20, (n.sugar ?? 0) * 1.5 * sugarMultiplier);
    breakdown.sugar = -round2(sugarPenalty);
    if (sugarPenalty > 10) negatives.push(`High sugar content (${n.sugar}g/100g)`);
    else if (sugarPenalty > 5) negatives.push(`Moderate sugar content (${n.sugar}g/100g)`);

    const sodiumMultiplier = personalProfile.hypertension ? 2.0 : 1.0;
    const sodiumPenalty = Math.min(15, (n.sodium ?? 0) * 0.012 * sodiumMultiplier);
    breakdown.sodium = -round2(sodiumPenalty);
    if (sodiumPenalty > 8) negatives.push(`High sodium (${n.sodium}mg/100g)`);
    else if (sodiumPenalty > 4) negatives.push(`Moderate sodium (${n.sodium}mg/100g)`);

    const satFatMultiplier = personalProfile.heartDisease ? 1.5 : 1.0;
    const satFatPenalty = Math.min(15, (n.saturated_fat ?? 0) * 2.0 * satFatMultiplier);
    breakdown.saturated_fat = -round2(satFatPenalty);
    if (satFatPenalty > 8) negatives.push(`High saturated fat (${n.saturated_fat}g/100g)`);
    else if (satFatPenalty > 4) negatives.push(`Moderate saturated fat (${n.saturated_fat}g/100g)`);

    // Additive penalty — risk-weighted
    let additivePenalty = 0;
    const riskWeights = { high: 5, moderate: 3, low: 1, banned: 8 };
    const flaggedAdditives = [];

    for (const code of additives) {
        const risk = additiveRiskMap[code] || 'low';
        additivePenalty += riskWeights[risk] || 1;
        if (risk === 'high' || risk === 'banned') {
            const name = additiveRiskMap[`${code}_name`] || code;
            flaggedAdditives.push(`${name} (${code})`);
        }
    }
    additivePenalty = Math.min(20, additivePenalty);
    breakdown.additives = -round2(additivePenalty);
    if (flaggedAdditives.length > 0) {
        negatives.push(`Contains concerning additives: ${flaggedAdditives.join(', ')}`);
    } else if (additives.length > 5) {
        negatives.push(`Contains ${additives.length} additives`);
    }

    const totalPenalty = sugarPenalty + sodiumPenalty + satFatPenalty + additivePenalty;

    // ─── Bonuses ────────────────────────────────────────────
    const proteinMultiplier = personalProfile.athletic ? 1.5 : 1.0;
    const fiberBonus = Math.min(10, (n.fiber ?? 0) * 2.0);
    breakdown.fiber = round2(fiberBonus);
    if (fiberBonus > 5) positives.push(`Good fiber source (${n.fiber}g/100g)`);

    const proteinBonus = Math.min(10, (n.protein ?? 0) * 0.8 * proteinMultiplier);
    breakdown.protein = round2(proteinBonus);
    if (proteinBonus > 5) positives.push(`Good protein content (${n.protein}g/100g)`);

    // Macronutrient balance bonus
    let balanceBonus = 0;
    const totalMacroG = (n.protein ?? 0) + (n.carbs ?? 0) + (n.fat ?? 0);
    if (totalMacroG > 0) {
        const pPct = ((n.protein ?? 0) / totalMacroG) * 100;
        const cPct = ((n.carbs ?? 0) / totalMacroG) * 100;
        const fPct = ((n.fat ?? 0) / totalMacroG) * 100;
        const pInRange = pPct >= 15 && pPct <= 40;
        const cInRange = cPct >= 40 && cPct <= 65;
        const fInRange = fPct >= 15 && fPct <= 40;
        const inRangeCount = [pInRange, cInRange, fInRange].filter(Boolean).length;
        balanceBonus = Math.round((inRangeCount / 3) * 5);
        if (inRangeCount === 3) positives.push('Well-balanced macronutrient profile');
    }
    breakdown.balance = balanceBonus;

    // Low calorie bonus
    const calBonus = (n.calories ?? 0) < 150 ? 3 : 0;
    if (calBonus > 0) positives.push('Low calorie density');
    breakdown.low_calorie = calBonus;

    const totalBonus = fiberBonus + proteinBonus + balanceBonus + calBonus;

    // ─── Final Score ────────────────────────────────────────
    const BASE = 60;
    const raw = BASE + totalBonus - totalPenalty;
    const score = Math.max(0, Math.min(100, Math.round(raw)));

    // No negatives? Add a positive
    if (negatives.length === 0) positives.push('No significant nutritional concerns');
    if (additives.length === 0) positives.push('No additives detected');

    const { rating, color } = getRating(score);

    return { score, rating, color, positives, negatives, breakdown };
}

/**
 * Determine rating and color from score.
 */
function getRating(score) {
    if (score >= 75) return { rating: 'Excellent', color: '#4CAF50' };
    if (score >= 50) return { rating: 'Good', color: '#FFC107' };
    return { rating: 'Poor', color: '#F44336' };
}

/**
 * Ensure nutrition values are numbers, default to 0.
 */
function normalizeNutrition(n) {
    const result = {};
    for (const [key, val] of Object.entries(n || {})) {
        result[key] = typeof val === 'number' ? val : parseFloat(val) || 0;
    }
    return result;
}

function round2(n) { return Math.round(n * 100) / 100; }
