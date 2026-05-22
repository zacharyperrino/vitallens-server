// ─── Barcode Lookup Route ────────────────────────────────────
// POST /api/barcode-lookup
// Body: { barcode: string, userId?: string }
// Checks PostgreSQL cache first, then falls back to Open Food Facts.

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { query } from '../db/pool.js';
import { fetchProduct } from '../services/openFoodFacts.js';
import { analyzeAdditives } from '../services/additiveAnalyzer.js';
import { computeHealthScore } from '../services/healthScorer.js';

const router = Router();

// Stricter rate limit for barcode lookups (external API dependency)
const barcodeLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    message: { error: 'Barcode lookup rate limit exceeded. Try again in a minute.' },
});

router.post('/barcode-lookup', barcodeLimiter, async (req, res, next) => {
    const startTime = Date.now();

    try {
        const { barcode, userId } = req.body;

        if (!barcode || typeof barcode !== 'string') {
            return res.status(400).json({ error: 'Missing or invalid barcode' });
        }

        // Normalize barcode (strip whitespace, enforce digits only)
        const cleanBarcode = barcode.trim().replace(/[^0-9]/g, '');
        if (cleanBarcode.length < 8 || cleanBarcode.length > 14) {
            return res.status(400).json({ error: 'Invalid barcode length. Expected 8–14 digits.' });
        }

        // ─── Check cache ─────────────────────────────────────
        let product = null;
        try {
            const cached = await query(
                'SELECT * FROM products WHERE barcode = $1 AND updated_at > NOW() - INTERVAL \'7 days\'',
                [cleanBarcode]
            );
            if (cached.rows.length > 0) {
                product = cached.rows[0];
                console.log(`[Barcode] Cache hit: ${cleanBarcode}`);
            }
        } catch (dbErr) {
            console.warn('[Barcode] Cache lookup failed, proceeding to API:', dbErr.message);
        }

        // ─── Fetch from Open Food Facts ──────────────────────
        if (!product) {
            console.log(`[Barcode] Cache miss, fetching from OFF: ${cleanBarcode}`);
            const offProduct = await fetchProduct(cleanBarcode);

            if (!offProduct) {
                return res.status(404).json({
                    error: 'Product not found',
                    barcode: cleanBarcode,
                    suggestion: 'Try capturing the nutrition label using OCR mode.',
                });
            }

            // Cache in PostgreSQL
            try {
                await query(
                    `INSERT INTO products (barcode, name, brand, ingredients, nutrition, additives, nutriscore, nova_group, image_url, raw_response)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (barcode) DO UPDATE SET
             name = EXCLUDED.name, brand = EXCLUDED.brand, ingredients = EXCLUDED.ingredients,
             nutrition = EXCLUDED.nutrition, additives = EXCLUDED.additives, nutriscore = EXCLUDED.nutriscore,
             nova_group = EXCLUDED.nova_group, image_url = EXCLUDED.image_url, raw_response = EXCLUDED.raw_response,
             updated_at = NOW()`,
                    [
                        offProduct.barcode, offProduct.name, offProduct.brand, offProduct.ingredients,
                        JSON.stringify(offProduct.nutrition), JSON.stringify(offProduct.additives),
                        offProduct.nutriscore, offProduct.nova_group, offProduct.image_url,
                        JSON.stringify(offProduct.raw_response),
                    ]
                );
            } catch (cacheErr) {
                console.warn('[Barcode] Failed to cache product:', cacheErr.message);
            }

            product = offProduct;
        }

        // ─── Analyze additives ───────────────────────────────
        const additiveList = Array.isArray(product.additives)
            ? product.additives
            : (typeof product.additives === 'string' ? JSON.parse(product.additives) : []);

        const additiveAnalysis = await analyzeAdditives(additiveList);

        // ─── Compute health score ────────────────────────────
        const nutrition = typeof product.nutrition === 'string'
            ? JSON.parse(product.nutrition)
            : product.nutrition;

        const healthScore = computeHealthScore(nutrition, additiveList, additiveAnalysis.riskMap);

        // ─── Log scan history ────────────────────────────────
        if (userId) {
            try {
                await query(
                    'INSERT INTO scan_history (user_id, barcode, product_name, health_score, scan_type) VALUES ($1, $2, $3, $4, $5)',
                    [userId, cleanBarcode, product.name, healthScore.score, 'barcode']
                );
            } catch (histErr) {
                console.warn('[Barcode] Failed to log scan history:', histErr.message);
            }
        }

        // ─── Response ────────────────────────────────────────
        const responseTime = Date.now() - startTime;
        res.json({
            product: {
                barcode: cleanBarcode,
                name: product.name,
                brand: product.brand || (typeof product.brand === 'string' ? product.brand : ''),
                ingredients: product.ingredients,
                nutrition,
                nutriscore: product.nutriscore,
                nova_group: product.nova_group,
                image_url: product.image_url,
            },
            healthScore,
            additives: additiveAnalysis,
            meta: {
                cached: !!product.id,
                responseTimeMs: responseTime,
            },
        });

    } catch (err) {
        next(err);
    }
});

export default router;
