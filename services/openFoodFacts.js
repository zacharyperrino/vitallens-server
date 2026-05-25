// ─── Open Food Facts API Client ─────────────────────────────
// Fetches product data by barcode, normalizes response.

const OFF_BASE_URL = 'https://world.openfoodfacts.org/api/v2';
const USER_AGENT = 'VitalLens/1.0 (health-app; contact@vitallens.app)';

/**
 * Fetch product from Open Food Facts by barcode.
 * @param {string} barcode — EAN-13 or UPC-A code
 * @returns {object|null} — normalized product data or null if not found
 */
export async function fetchProduct(barcode) {
    const url = `${OFF_BASE_URL}/product/${barcode}.json`;

    const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
        console.warn(`[OFF] HTTP ${response.status} for barcode ${barcode}`);
        return null;
    }

    const data = await response.json();

    if (data.status !== 1 || !data.product) {
        console.log(`[OFF] Product not found: ${barcode}`);
        return null;
    }

    return normalizeProduct(barcode, data.product, data);
}

/**
 * Search Open Food Facts by product name.
 * Used as fallback when USDA doesn't have a branded/packaged item.
 * @param {string} query — product name or brand + name
 * @param {number} limit — max results (default 5)
 * @returns {array} — normalized products array
 */
export async function searchProducts(query, limit = 5) {
    const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=${limit}&fields=product_name,brands,nutriments,nutriscore_grade,nova_group,additives_tags,ingredients_text,image_front_url`;

    try {
        const response = await fetch(url, {
            headers: { 'User-Agent': USER_AGENT },
            signal: AbortSignal.timeout(8000),
        });

        if (!response.ok) {
            console.warn(`[OFF] Search HTTP ${response.status} for: ${query}`);
            return [];
        }

        const data = await response.json();
        const products = data.products || [];

        return products
            .filter(p => p.product_name && p.nutriments?.['energy-kcal_100g'])
            .map(p => normalizeProduct('unknown', p, {}))
            .slice(0, limit);

    } catch (err) {
        console.warn('[OFF] Search failed:', err.message);
        return [];
    }
}

/**
 * Normalize Open Food Facts response into our schema shape.
 */
function normalizeProduct(barcode, p, raw) {
    const nutriments = p.nutriments || {};

    return {
        barcode,
        name: p.product_name || p.product_name_en || 'Unknown Product',
        brand: p.brands || '',
        ingredients: p.ingredients_text || p.ingredients_text_en || '',
        nutrition: {
            calories: nutriments['energy-kcal_100g'] ?? nutriments['energy-kcal'] ?? null,
            protein: nutriments.proteins_100g ?? null,
            carbs: nutriments.carbohydrates_100g ?? null,
            sugar: nutriments.sugars_100g ?? null,
            fat: nutriments.fat_100g ?? null,
            saturated_fat: nutriments['saturated-fat_100g'] ?? null,
            fiber: nutriments.fiber_100g ?? null,
            sodium: nutriments.sodium_100g != null
                ? Math.round(nutriments.sodium_100g * 1000) // g → mg
                : (nutriments.salt_100g != null
                    ? Math.round(nutriments.salt_100g * 400) // salt → sodium (mg)
                    : null),
        },
        additives: extractAdditives(p),
        nutriscore: p.nutriscore_grade?.toUpperCase() || null,
        nova_group: p.nova_group ?? null,
        image_url: p.image_front_url || p.image_url || null,
        raw_response: raw,
    };
}

/**
 * Extract additive E-codes from the product data.
 */
function extractAdditives(p) {
    const codes = new Set();

    // From additives_tags array
    if (Array.isArray(p.additives_tags)) {
        p.additives_tags.forEach(tag => {
            // Tags look like "en:e330" or "en:e621"
            const match = tag.match(/e\d+[a-z]*/i);
            if (match) codes.add(match[0].toUpperCase());
        });
    }

    // Fallback: parse from ingredients text
    if (codes.size === 0 && p.ingredients_text) {
        const matches = p.ingredients_text.match(/\bE\d{3,4}[a-z]?\b/gi) || [];
        matches.forEach(m => codes.add(m.toUpperCase()));
    }

    return [...codes].sort();
}
