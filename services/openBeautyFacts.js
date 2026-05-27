// ─── Open Beauty Facts API Client ─────────────────────────────
// Fetches cosmetic/hygiene product data by barcode.
// API: https://world.openbeautyfacts.org/api/v2

const OBF_BASE_URL = 'https://world.openbeautyfacts.org/api/v2';
const USER_AGENT = 'VitalLens/1.0 (health-app; contact@vitallens.app)';

// Ingredients of concern in personal care products
const CONCERNING_INGREDIENTS = {
    'parabens': { risk: 'high', note: 'Potential endocrine disruption — commonly associated with hormonal concerns in wellness literature.' },
    'methylparaben': { risk: 'high', note: 'Paraben preservative — commonly flagged in wellness literature.' },
    'propylparaben': { risk: 'high', note: 'Paraben preservative — commonly flagged in wellness literature.' },
    'butylparaben': { risk: 'high', note: 'Paraben preservative — commonly flagged in wellness literature.' },
    'phthalate': { risk: 'high', note: 'Commonly associated with endocrine concerns in wellness literature.' },
    'dibutyl phthalate': { risk: 'high', note: 'Commonly flagged phthalate.' },
    'sodium lauryl sulfate': { risk: 'moderate', note: 'SLS — may be irritating for sensitive skin.' },
    'sodium laureth sulfate': { risk: 'moderate', note: 'SLES — milder than SLS but worth exploring for sensitive skin.' },
    'formaldehyde': { risk: 'high', note: 'Preservative — commonly flagged in wellness literature.' },
    'dmdm hydantoin': { risk: 'high', note: 'Formaldehyde-releasing preservative.' },
    'quaternium-15': { risk: 'high', note: 'Formaldehyde-releasing preservative.' },
    'triclosan': { risk: 'high', note: 'Antimicrobial — commonly flagged in wellness literature.' },
    'oxybenzone': { risk: 'high', note: 'Sunscreen chemical — commonly associated with absorption concerns.' },
    'fragrance': { risk: 'moderate', note: 'Undisclosed fragrance blend — may contain allergens worth exploring.' },
    'parfum': { risk: 'moderate', note: 'Undisclosed fragrance blend — may contain allergens worth exploring.' },
    'mineral oil': { risk: 'low', note: 'Petroleum-derived — some users prefer to avoid.' },
    'petrolatum': { risk: 'low', note: 'Petroleum-derived — some users prefer to avoid.' },
    'talc': { risk: 'moderate', note: 'Worth exploring for products used near sensitive areas.' },
    'aluminum': { risk: 'moderate', note: 'Found in some antiperspirants — commonly discussed in wellness literature.' },
};

export async function fetchBeautyProduct(barcode) {
    const url = `${OBF_BASE_URL}/product/${barcode}.json`;

    const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
        console.warn(`[OBF] HTTP ${response.status} for barcode ${barcode}`);
        return null;
    }

    const data = await response.json();

    if (data.status !== 1 || !data.product) {
        console.log(`[OBF] Product not found: ${barcode}`);
        return null;
    }

    return normalizeBeautyProduct(barcode, data.product);
}

export function analyzeBeautyIngredients(ingredientsText) {
    if (!ingredientsText) return { concerns: [], safetyScore: 100 };

    const lower = ingredientsText.toLowerCase();
    const concerns = [];

    for (const [ingredient, info] of Object.entries(CONCERNING_INGREDIENTS)) {
        if (lower.includes(ingredient)) {
            concerns.push({ ingredient, ...info });
        }
    }

    const highCount = concerns.filter(c => c.risk === 'high').length;
    const modCount = concerns.filter(c => c.risk === 'moderate').length;
    const safetyScore = Math.max(0, 100 - (highCount * 20) - (modCount * 10));

    return { concerns, safetyScore };
}

function normalizeBeautyProduct(barcode, p) {
    const ingredientsText = p.ingredients_text || p.ingredients_text_en || '';
    const { concerns, safetyScore } = analyzeBeautyIngredients(ingredientsText);

    return {
        barcode,
        name: p.product_name || p.product_name_en || 'Unknown Product',
        brand: p.brands || '',
        category: p.categories || '',
        ingredients: ingredientsText,
        concerns,
        safetyScore,
        image_url: p.image_front_url || p.image_url || null,
        labels: p.labels || '',
    };
}