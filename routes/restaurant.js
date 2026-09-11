import { Router } from 'express';
import { RESTAURANT_DB, detectRestaurant, matchMenuItem } from '../data/restaurants.js';

import { sendError } from '../utils/errors.js';

const router = Router();

// POST /api/restaurant/detect
// Body: { mealDescription, foods, restaurant_detected, restaurant_confidence }
// restaurant_detected comes from GPT-4o visual recognition (packaging, branding, containers)
// Text matching used as fallback only.

router.post('/restaurant/detect', async (req, res) => {
    try {
        const {
            mealDescription = '',
            foods = [],
            restaurant_detected = 'none',
            restaurant_confidence = 0,
        } = req.body;

        // Priority 1: GPT-4o visual recognition (packaging, containers, branding)
        if (restaurant_detected && restaurant_detected !== 'none' && restaurant_confidence >= 0.6) {
            console.log(`[Restaurant] Visual detection: ${restaurant_detected} (${Math.round(restaurant_confidence * 100)}% confidence)`);
            const restaurantKey = findRestaurantKey(restaurant_detected);
            if (restaurantKey) {
                const restaurant = RESTAURANT_DB[restaurantKey];
                const matchedItems = foods.map(food => {
                    const match = matchMenuItem(restaurantKey, food.label, food.display_name);
                    return match ? { ...food, restaurantMatch: match } : food;
                });
                return res.json({
                    detected: true,
                    restaurantKey,
                    restaurantName: restaurant.name,
                    detectionMethod: 'visual',
                    confidence: restaurant_confidence,
                    matchedItems,
                });
            }
        }

        // Priority 2: Text-based fallback
        const restaurantKey = detectRestaurant(mealDescription, foods);
        if (!restaurantKey) return res.json({ detected: false });

        const restaurant = RESTAURANT_DB[restaurantKey];
        const matchedItems = foods.map(food => {
            const match = matchMenuItem(restaurantKey, food.label, food.display_name);
            return match ? { ...food, restaurantMatch: match } : food;
        });

        console.log(`[Restaurant] Text detection: ${restaurant.name}`);
        res.json({
            detected: true,
            restaurantKey,
            restaurantName: restaurant.name,
            detectionMethod: 'text',
            confidence: 0.7,
            matchedItems,
        });

    } catch (err) {
        sendError(res, err);
    }
});

// GET /api/restaurant/list
router.get('/restaurant/list', (req, res) => {
    const list = Object.entries(RESTAURANT_DB).map(([key, r]) => ({
        key,
        name: r.name,
        itemCount: Object.keys(r.items).length,
    }));
    res.json({ restaurants: list, total: list.length });
});

function findRestaurantKey(detectedName) {
    const name = (detectedName || '').toLowerCase();
    const nameMap = {
        "mcdonald's": 'mcdonalds', 'mcdonalds': 'mcdonalds',
        'chipotle': 'chipotle',
        'starbucks': 'starbucks',
        'subway': 'subway',
        "chick-fil-a": 'chickfila', 'chick fil a': 'chickfila', 'chickfila': 'chickfila',
        'panda express': 'pandaexpress', 'pandaexpress': 'pandaexpress',
        'taco bell': 'tacobell', 'tacobell': 'tacobell',
        'burger king': 'burgerking', 'burgerking': 'burgerking',
        "domino's": 'dominos', 'dominos': 'dominos',
        'panera': 'panera', 'panera bread': 'panera',
        "wendy's": 'wendys', 'wendys': 'wendys',
        'shake shack': 'shakeshack', 'shakeshack': 'shakeshack',
        'in-n-out': 'inout', 'in n out': 'inout', 'innout': 'inout',
        'popeyes': 'popeyes',
        "dunkin'": 'dunkin', 'dunkin': 'dunkin', 'dunkin donuts': 'dunkin',
        'pizza hut': 'pizzahut', 'pizzahut': 'pizzahut',
        'kfc': 'kfc', 'kentucky fried chicken': 'kfc',
        'five guys': 'fiveguys', 'fiveguys': 'fiveguys',
        'jersey mike\'s': 'jerseymikes', 'jersey mikes': 'jerseymikes',
        'raising cane\'s': 'raisingcanes', 'raising canes': 'raisingcanes', 'cane\'s': 'raisingcanes',
        'sweetgreen': 'sweetgreen', 'sweet green': 'sweetgreen',
        'cava': 'cava',
        'olive garden': 'olivegarden', 'olivegarden': 'olivegarden',
        'ihop': 'ihop', 'i hop': 'ihop',
        'cracker barrel': 'crackerbarrel',
        'p.f. chang\'s': 'pf_changs', 'pf changs': 'pf_changs', 'pf chang': 'pf_changs',
    };
    return nameMap[name] || null;
}

export default router;