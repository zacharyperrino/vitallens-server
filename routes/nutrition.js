import { Router } from 'express';
import rateLimit from 'express-rate-limit';
const router = Router();

const nutritionLimiter = rateLimit({ windowMs: 60 * 1000, max: 200 });

const USDA_BASE = 'https://api.nal.usda.gov/fdc/v1';
const USDA_API_KEY = process.env.USDA_API_KEY || 'DEMO_KEY';

router.get('/nutrition/search', nutritionLimiter, async (req, res) => {
    const { query, grams = 100 } = req.query;
    if (!query) return res.status(400).json({ error: 'query required.' });

    // Tier 1: Hardcoded fallbacks (instant)
    const queryLower = query.trim().toLowerCase();
    for (const [key, nutrition] of Object.entries(HARDCODED_NUTRITION)) {
        if (queryLower.includes(key)) {
            const scale = parseFloat(grams) / 100;
            return res.json({
                ...nutrition,
                calories: Math.round(nutrition.calories * scale),
                protein: Math.round(nutrition.protein * scale * 10) / 10,
                carbs: Math.round(nutrition.carbs * scale * 10) / 10,
                fat: Math.round(nutrition.fat * scale * 10) / 10,
                fiber: Math.round(nutrition.fiber * scale * 10) / 10,
                grams: parseFloat(grams),
                micronutrients: [],
                healthRating: 60,
                digestibility: 65,
                source: 'VitalLens nutrition database',
            });
        }
    }

    // Tier 2: USDA FoodData Central
    try {
        const result = await searchUSDA(query.trim(), parseFloat(grams));
        if (result) {
            console.log(`[Nutrition] USDA hit: "${query}"`);
            return res.json(result);
        }
    } catch (err) {
        console.warn(`[USDA] Failed for "${query}": ${err.message}`);
    }

    // Tier 2b: USDA fallback — first word only
    const firstWord = query.trim().split(' ')[0];
    if (firstWord !== query.trim()) {
        try {
            console.log(`[USDA] Fallback to: "${firstWord}"`);
            const fallback = await searchUSDA(firstWord, parseFloat(grams));
            if (fallback) return res.json({ ...fallback, fallback: true });
        } catch (err) {
            console.warn(`[USDA] Fallback also failed: ${err.message}`);
        }
    }

    // Tier 3: Open Food Facts
    try {
        console.log(`[OpenFoodFacts] Trying: "${query}"`);
        const offResult = await searchOpenFoodFacts(query.trim(), parseFloat(grams));
        if (offResult) {
            console.log(`[OpenFoodFacts] Found: ${offResult.name}`);
            return res.json(offResult);
        }
    } catch (err) {
        console.warn(`[OpenFoodFacts] Failed: ${err.message}`);
    }

    res.status(404).json({ error: `No nutrition data found for: ${query}` });
});

router.get('/nutrition/food/:fdcId', nutritionLimiter, async (req, res) => {
    const { fdcId } = req.params;
    const { grams = 100 } = req.query;
    try {
        const url = `${USDA_BASE}/food/${fdcId}?api_key=${USDA_API_KEY}`;
        const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!response.ok) return res.status(response.status).json({ error: `USDA error: ${response.status}` });
        const food = await response.json();
        res.json(normalizeNutrition(food, food.description, parseFloat(grams)));
    } catch (err) {
        res.status(502).json({ error: err.message });
    }
});

// Common foods USDA doesn't carry well — hardcoded fallbacks
const HARDCODED_NUTRITION = {
    'chimichurri': { name: 'Chimichurri Sauce', calories: 120, protein: 0.5, carbs: 2, fat: 13, fiber: 0.5, sodium: 180, grams: 30 },
    'chimichurri sauce': { name: 'Chimichurri Sauce', calories: 120, protein: 0.5, carbs: 2, fat: 13, fiber: 0.5, sodium: 180, grams: 30 },
    'pesto': { name: 'Pesto Sauce', calories: 150, protein: 3, carbs: 2, fat: 15, fiber: 0.5, sodium: 210, grams: 30 },
    'guacamole': { name: 'Guacamole', calories: 100, protein: 1, carbs: 6, fat: 9, fiber: 3, sodium: 150, grams: 60 },
    'tzatziki': { name: 'Tzatziki', calories: 45, protein: 2, carbs: 3, fat: 3, fiber: 0, sodium: 110, grams: 60 },
    'hollandaise': { name: 'Hollandaise Sauce', calories: 160, protein: 2, carbs: 1, fat: 17, fiber: 0, sodium: 230, grams: 45 },
    'aioli': { name: 'Aioli', calories: 180, protein: 0.5, carbs: 1, fat: 20, fiber: 0, sodium: 200, grams: 30 },
    'sriracha': { name: 'Sriracha Sauce', calories: 15, protein: 0.5, carbs: 3, fat: 0, fiber: 0, sodium: 480, grams: 15 },
    'teriyaki sauce': { name: 'Teriyaki Sauce', calories: 60, protein: 1, carbs: 14, fat: 0, fiber: 0, sodium: 690, grams: 30 },
    'miso soup': { name: 'Miso Soup', calories: 35, protein: 2, carbs: 5, fat: 1, fiber: 0.5, sodium: 630, grams: 240 },
    'bone broth': { name: 'Bone Broth', calories: 45, protein: 9, carbs: 0, fat: 1, fiber: 0, sodium: 450, grams: 240 },
    'salsa': { name: 'Tomato Salsa', calories: 20, protein: 1, carbs: 4, fat: 0, fiber: 1, sodium: 230, grams: 60 },
    'tahini': { name: 'Tahini', calories: 180, protein: 5, carbs: 7, fat: 16, fiber: 1.5, sodium: 35, grams: 30 },
    'hummus': { name: 'Hummus', calories: 140, protein: 5, carbs: 12, fat: 8, fiber: 3, sodium: 210, grams: 60 },
    'ranch dressing': { name: 'Ranch Dressing', calories: 140, protein: 0.5, carbs: 2, fat: 15, fiber: 0, sodium: 310, grams: 30 },
    'balsamic vinaigrette': { name: 'Balsamic Vinaigrette', calories: 80, protein: 0, carbs: 4, fat: 7, fiber: 0, sodium: 160, grams: 30 },
    'caesar dressing': { name: 'Caesar Dressing', calories: 160, protein: 1, carbs: 1, fat: 17, fiber: 0, sodium: 320, grams: 30 },
    'dumplings': { name: 'Steamed Dumplings', calories: 280, protein: 12, carbs: 38, fat: 8, fiber: 2, sodium: 580, grams: 200 },
    'steamed dumplings': { name: 'Steamed Dumplings', calories: 280, protein: 12, carbs: 38, fat: 8, fiber: 2, sodium: 580, grams: 200 },
    'potstickers': { name: 'Potstickers', calories: 320, protein: 13, carbs: 40, fat: 11, fiber: 2, sodium: 640, grams: 200 },
    'gyoza': { name: 'Gyoza', calories: 300, protein: 12, carbs: 38, fat: 10, fiber: 2, sodium: 610, grams: 200 },
    'soy sauce': { name: 'Soy Sauce', calories: 8, protein: 1, carbs: 1, fat: 0, fiber: 0, sodium: 902, grams: 15 },
    'ponzu': { name: 'Ponzu Sauce', calories: 20, protein: 1, carbs: 4, fat: 0, fiber: 0, sodium: 640, grams: 30 },
    'oyster sauce': { name: 'Oyster Sauce', calories: 35, protein: 1, carbs: 7, fat: 0, fiber: 0, sodium: 640, grams: 30 },
    'fish sauce': { name: 'Fish Sauce', calories: 10, protein: 1, carbs: 1, fat: 0, fiber: 0, sodium: 1190, grams: 15 },
    'hoisin sauce': { name: 'Hoisin Sauce', calories: 35, protein: 1, carbs: 7, fat: 1, fiber: 0, sodium: 360, grams: 16 },
    'duck sauce': { name: 'Duck Sauce', calories: 40, protein: 0, carbs: 10, fat: 0, fiber: 0, sodium: 100, grams: 30 },
    'sweet chili sauce': { name: 'Sweet Chili Sauce', calories: 60, protein: 0, carbs: 15, fat: 0, fiber: 0, sodium: 230, grams: 30 },
    'strawberries': { name: 'Strawberries', calories: 32, protein: 0.7, carbs: 7.7, fat: 0.3, fiber: 2, sodium: 1, grams: 100 },
    'strawberry': { name: 'Strawberries', calories: 32, protein: 0.7, carbs: 7.7, fat: 0.3, fiber: 2, sodium: 1, grams: 100 },
    'blueberries': { name: 'Blueberries', calories: 57, protein: 0.7, carbs: 14.5, fat: 0.3, fiber: 2.4, sodium: 1, grams: 100 },
    'raspberries': { name: 'Raspberries', calories: 52, protein: 1.2, carbs: 11.9, fat: 0.7, fiber: 6.5, sodium: 1, grams: 100 },
    'blackberries': { name: 'Blackberries', calories: 43, protein: 1.4, carbs: 9.6, fat: 0.5, fiber: 5.3, sodium: 1, grams: 100 },
    'mango': { name: 'Mango', calories: 60, protein: 0.8, carbs: 15, fat: 0.4, fiber: 1.6, sodium: 1, grams: 100 },
    'banana': { name: 'Banana', calories: 89, protein: 1.1, carbs: 23, fat: 0.3, fiber: 2.6, sodium: 1, grams: 100 },
    'apple': { name: 'Apple', calories: 52, protein: 0.3, carbs: 14, fat: 0.2, fiber: 2.4, sodium: 1, grams: 100 },
    'grapes': { name: 'Grapes', calories: 69, protein: 0.7, carbs: 18, fat: 0.2, fiber: 0.9, sodium: 2, grams: 100 },
    'watermelon': { name: 'Watermelon', calories: 30, protein: 0.6, carbs: 7.6, fat: 0.2, fiber: 0.4, sodium: 1, grams: 100 },
    'orange': { name: 'Orange', calories: 47, protein: 0.9, carbs: 12, fat: 0.1, fiber: 2.4, sodium: 0, grams: 100 },
    'pineapple': { name: 'Pineapple', calories: 50, protein: 0.5, carbs: 13, fat: 0.1, fiber: 1.4, sodium: 1, grams: 100 },
    'skirt steak': { name: 'Beef Skirt Steak', calories: 204, protein: 26, carbs: 0, fat: 11, fiber: 0, sodium: 67, grams: 100 },
    'beef skirt steak': { name: 'Beef Skirt Steak', calories: 204, protein: 26, carbs: 0, fat: 11, fiber: 0, sodium: 67, grams: 100 },
    'flank steak': { name: 'Beef Flank Steak', calories: 192, protein: 27, carbs: 0, fat: 9, fiber: 0, sodium: 60, grams: 100 },
    'ribeye': { name: 'Ribeye Steak', calories: 291, protein: 24, carbs: 0, fat: 21, fiber: 0, sodium: 70, grams: 100 },
    'yellow squash': { name: 'Yellow Squash', calories: 18, protein: 1.2, carbs: 3.8, fat: 0.2, fiber: 1.1, sodium: 2, grams: 100 },
    'zucchini': { name: 'Zucchini', calories: 17, protein: 1.2, carbs: 3.1, fat: 0.3, fiber: 1, sodium: 8, grams: 100 },
    'lions mane mushroom': { name: "Lion's Mane Mushroom", calories: 35, protein: 2.5, carbs: 6.4, fat: 0.3, fiber: 1, sodium: 2, grams: 100 },
    'lion\'s mane mushroom': { name: "Lion's Mane Mushroom", calories: 35, protein: 2.5, carbs: 6.4, fat: 0.3, fiber: 1, sodium: 2, grams: 100 },
    'mushroom': { name: 'Mushrooms', calories: 22, protein: 3.1, carbs: 3.3, fat: 0.3, fiber: 1, sodium: 5, grams: 100 },
    // ── Drinks (per 100ml) ──
    'coffee': { name: 'Black Coffee', calories: 2, protein: 0.3, carbs: 0, fat: 0, fiber: 0, sodium: 2, grams: 240 },
    'black coffee': { name: 'Black Coffee', calories: 2, protein: 0.3, carbs: 0, fat: 0, fiber: 0, sodium: 2, grams: 240 },
    'espresso': { name: 'Espresso', calories: 3, protein: 0.1, carbs: 0.5, fat: 0.1, fiber: 0, sodium: 5, grams: 30 },
    'latte': { name: 'Latte', calories: 190, protein: 10, carbs: 19, fat: 7, fiber: 0, sodium: 150, grams: 360 },
    'cappuccino': { name: 'Cappuccino', calories: 120, protein: 7, carbs: 10, fat: 5, fiber: 0, sodium: 100, grams: 240 },
    'cold brew': { name: 'Cold Brew Coffee', calories: 5, protein: 0.5, carbs: 0, fat: 0, fiber: 0, sodium: 5, grams: 350 },
    'americano': { name: 'Americano', calories: 5, protein: 0.3, carbs: 0.5, fat: 0, fiber: 0, sodium: 5, grams: 240 },
    'matcha latte': { name: 'Matcha Latte', calories: 180, protein: 7, carbs: 25, fat: 5, fiber: 0, sodium: 120, grams: 360 },
    'matcha': { name: 'Matcha', calories: 180, protein: 7, carbs: 25, fat: 5, fiber: 0, sodium: 120, grams: 360 },
    'green tea': { name: 'Green Tea', calories: 2, protein: 0, carbs: 0.5, fat: 0, fiber: 0, sodium: 2, grams: 240 },
    'orange juice': { name: 'Orange Juice', calories: 112, protein: 1.7, carbs: 26, fat: 0.5, fiber: 0.5, sodium: 2, grams: 240 },
    'apple juice': { name: 'Apple Juice', calories: 117, protein: 0.3, carbs: 29, fat: 0.3, fiber: 0.5, sodium: 10, grams: 240 },
    'smoothie': { name: 'Fruit Smoothie', calories: 180, protein: 3, carbs: 40, fat: 1, fiber: 3, sodium: 50, grams: 350 },
    'protein shake': { name: 'Protein Shake', calories: 200, protein: 30, carbs: 10, fat: 4, fiber: 1, sodium: 200, grams: 350 },
    'whole milk': { name: 'Whole Milk', calories: 149, protein: 8, carbs: 12, fat: 8, fiber: 0, sodium: 105, grams: 240 },
    'milk': { name: 'Whole Milk', calories: 149, protein: 8, carbs: 12, fat: 8, fiber: 0, sodium: 105, grams: 240 },
    'oat milk': { name: 'Oat Milk', calories: 120, protein: 3, carbs: 16, fat: 5, fiber: 2, sodium: 100, grams: 240 },
    'almond milk': { name: 'Almond Milk', calories: 40, protein: 1, carbs: 3, fat: 3, fiber: 0.5, sodium: 150, grams: 240 },
    'red wine': { name: 'Red Wine', calories: 125, protein: 0.1, carbs: 4, fat: 0, fiber: 0, sodium: 10, grams: 150 },
    'white wine': { name: 'White Wine', calories: 121, protein: 0.1, carbs: 4, fat: 0, fiber: 0, sodium: 10, grams: 150 },
    'wine': { name: 'Wine', calories: 123, protein: 0.1, carbs: 4, fat: 0, fiber: 0, sodium: 10, grams: 150 },
    'beer': { name: 'Beer', calories: 154, protein: 1.6, carbs: 13, fat: 0, fiber: 0, sodium: 14, grams: 355 },
    'light beer': { name: 'Light Beer', calories: 103, protein: 0.9, carbs: 6, fat: 0, fiber: 0, sodium: 14, grams: 355 },
    'vodka': { name: 'Vodka', calories: 97, protein: 0, carbs: 0, fat: 0, fiber: 0, sodium: 0, grams: 44 },
    'whiskey': { name: 'Whiskey', calories: 105, protein: 0, carbs: 0, fat: 0, fiber: 0, sodium: 0, grams: 44 },
    'tequila': { name: 'Tequila', calories: 96, protein: 0, carbs: 0, fat: 0, fiber: 0, sodium: 0, grams: 44 },
    'cocktail': { name: 'Cocktail', calories: 180, protein: 0, carbs: 15, fat: 0, fiber: 0, sodium: 10, grams: 200 },
    'soda': { name: 'Soda / Cola', calories: 140, protein: 0, carbs: 39, fat: 0, fiber: 0, sodium: 45, grams: 355 },
    'cola': { name: 'Cola', calories: 140, protein: 0, carbs: 39, fat: 0, fiber: 0, sodium: 45, grams: 355 },
    'sparkling water': { name: 'Sparkling Water', calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sodium: 5, grams: 350 },
    'kombucha': { name: 'Kombucha', calories: 30, protein: 0, carbs: 8, fat: 0, fiber: 0, sodium: 15, grams: 240 },
    'energy drink': { name: 'Energy Drink', calories: 110, protein: 1, carbs: 28, fat: 0, fiber: 0, sodium: 200, grams: 250 },
};

async function searchUSDA(query, grams = 100) {
    // Strip accents and clean query
    const cleanQuery = query
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/^(pan.seared|pan.fried|pan.roasted|stir.fried|deep.fried|slow.cooked|air.fried|oven.baked|oven.roasted|pan.browned)\s+/i, '')
        .replace(/^(roasted|grilled|fried|steamed|baked|sauteed|boiled|raw|cooked)\s+/i, '')
        .replace(/\s+(sauce|mix|herb|garlic|onion|seasoned|style|glazed|crusted|browned).*$/i, '')
        .trim();

    const encodedQuery = encodeURIComponent(cleanQuery);
    const url = `${USDA_BASE}/foods/search?query=${encodedQuery}&pageSize=8&api_key=${USDA_API_KEY}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) {
        const text = await response.text();
        console.error(`[USDA] Error ${response.status} for "${cleanQuery}":`, text.slice(0, 100));
        throw new Error(`USDA API error: ${response.status}`);
    }
    const data = await response.json();
    const foods = data.foods;
    if (!foods || foods.length === 0) return null;
    const best = foods.find(f => f.dataType === 'Foundation')
        || foods.find(f => f.dataType === 'SR Legacy')
        || foods.find(f => f.dataType === 'Survey (FNDDS)')
        || foods[0];
    return normalizeNutrition(best, cleanQuery, grams);
}

async function searchOpenFoodFacts(query, grams = 100) {
    const encoded = encodeURIComponent(query);
    const url = `https://world.openfoodfacts.org/api/v2/search?q=${encoded}&page_size=5&fields=product_name,nutriments,nutrition_grades,nova_group`;

    const response = await fetch(url, {
        signal: AbortSignal.timeout(8000),
        headers: { 'User-Agent': 'VitalLens/1.0 (health app)' }
    });

    if (!response.ok) throw new Error(`OpenFoodFacts error: ${response.status}`);

    const data = await response.json();
    const products = data.products || [];

    if (products.length === 0) return null;

    // Find best match — prefer products with complete nutrition data
    const best = products.find(p =>
        p.nutriments?.['energy-kcal_100g'] &&
        p.nutriments?.['proteins_100g'] !== undefined &&
        p.product_name
    ) || products[0];

    if (!best?.nutriments) return null;

    const n = best.nutriments;
    const scale = grams / 100;

    return {
        name: cleanFoodName(best.product_name || query),
        grams,
        calories: Math.round((n['energy-kcal_100g'] || 0) * scale),
        protein: Math.round((n['proteins_100g'] || 0) * scale * 10) / 10,
        carbs: Math.round((n['carbohydrates_100g'] || 0) * scale * 10) / 10,
        fat: Math.round((n['fat_100g'] || 0) * scale * 10) / 10,
        fiber: Math.round((n['fiber_100g'] || 0) * scale * 10) / 10,
        sugar: Math.round((n['sugars_100g'] || 0) * scale * 10) / 10,
        sodium: Math.round((n['sodium_100g'] || 0) * 1000 * scale),
        micronutrients: [],
        healthRating: Math.min(100, Math.max(0, Math.round(
            50
            + ((n['proteins_100g'] || 0) * 1.5)
            + ((n['fiber_100g'] || 0) * 3)
            - ((n['sugars_100g'] || 0) * 0.5)
            - ((n['saturated-fat_100g'] || 0) * 2)
            - ((n['sodium_100g'] || 0) * 10)
        ))),
        digestibility: 65,
        source: 'Open Food Facts',
        nutriscore: best.nutrition_grades || null,
        nova_group: best.nova_group || null,
    };
}

function cleanFoodName(raw) {
    if (!raw) return raw;
    // Remove USDA technical descriptors
    let name = raw
        .replace(/,\s*(boneless|separable lean and fat|trimmed to \d+"? fat|choice|select|grade \w+|raw|cooked|grilled|roasted|baked|steamed|fried|boiled)/gi, '')
        .replace(/,\s*(canned|frozen|dried|dehydrated|powdered|concentrate)/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
    // Title case
    name = name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    // Cap length
    if (name.length > 40) name = name.substring(0, 37) + '...';
    return name;
}

function normalizeNutrition(food, query, grams) {
    if (!food) return null;
    const nutrients = food.foodNutrients || [];
    const get = (ids) => {
        for (const id of ids) {
            const n = nutrients.find(n => n.nutrientId === id || n.nutrientNumber === String(id) || n.number === String(id));
            if (n) return parseFloat(n.value ?? n.amount ?? n.nutrientAmount ?? 0) || 0;
        }
        return 0;
    };
    const per100 = {
        calories: get([1008, 2047, 2048]), protein: get([1003]), fat: get([1004]),
        carbs: get([1005]), fiber: get([1079]), sugar: get([1063, 2000]),
        sodium: get([1093]), cholesterol: get([1253]), saturatedFat: get([1258]),
        vitaminC: get([1162]), vitaminD: get([1114]), iron: get([1089]),
        calcium: get([1087]), potassium: get([1092]), magnesium: get([1090]),
        zinc: get([1095]), vitaminB12: get([1178]), folate: get([1177]),
    };
    const scale = grams / 100;
    const s = {};
    for (const [k, v] of Object.entries(per100)) s[k] = Math.round(v * scale * 10) / 10;
    const micronutrients = [
        { name: 'Vitamin C', amount: `${s.vitaminC}mg`, rda: Math.min(200, Math.round((s.vitaminC / 90) * 100)) },
        { name: 'Vitamin D', amount: `${s.vitaminD}IU`, rda: Math.min(200, Math.round((s.vitaminD / 600) * 100)) },
        { name: 'Iron', amount: `${s.iron}mg`, rda: Math.min(200, Math.round((s.iron / 18) * 100)) },
        { name: 'Calcium', amount: `${s.calcium}mg`, rda: Math.min(200, Math.round((s.calcium / 1000) * 100)) },
        { name: 'Potassium', amount: `${s.potassium}mg`, rda: Math.min(200, Math.round((s.potassium / 4700) * 100)) },
        { name: 'Magnesium', amount: `${s.magnesium}mg`, rda: Math.min(200, Math.round((s.magnesium / 420) * 100)) },
        { name: 'Zinc', amount: `${s.zinc}mg`, rda: Math.min(200, Math.round((s.zinc / 11) * 100)) },
        { name: 'Vitamin B12', amount: `${s.vitaminB12}mcg`, rda: Math.min(200, Math.round((s.vitaminB12 / 2.4) * 100)) },
        { name: 'Folate', amount: `${s.folate}mcg`, rda: Math.min(200, Math.round((s.folate / 400) * 100)) },
    ].filter(m => parseFloat(m.amount) > 0);
    const healthRating = Math.min(100, Math.max(0, Math.round(50 + (s.protein * 1.5) + (s.fiber * 3) - (s.sugar * 0.5) - (s.saturatedFat * 2) - (s.sodium * 0.01))));
    const digestibility = Math.min(100, Math.max(0, Math.round(70 + (s.fiber * 2) - (s.fat * 0.3) - (s.sugar * 0.2))));
    return {
        name: cleanFoodName(food.description || query),
        calories: s.calories, protein: s.protein, carbs: s.carbs, fat: s.fat,
        fiber: s.fiber, sugar: s.sugar, sodium: s.sodium,
        micronutrients, healthRating, digestibility,
        fdcId: food.fdcId, dataType: food.dataType, source: 'USDA FoodData Central',
    };
}

export default router;