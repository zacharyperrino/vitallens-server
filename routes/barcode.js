// ─── Barcode Lookup Route ────────────────────────────────────
// POST /api/barcode-lookup
// Body: { barcode: string, userId?: string }
// Checks the products cache (Supabase) first, then falls back to Open Food Facts.

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { supabase } from '../db/supabase.js';
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
            const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
            const { data: cached, error: cacheErr } = await supabase
                .from('products')
                .select('*')
                .eq('barcode', cleanBarcode)
                .gt('updated_at', since)
                .limit(1)
                .maybeSingle();
            if (cacheErr) throw cacheErr;
            if (cached) {
                product = cached;
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

            // Cache in the products table
            try {
                const { error: upsertErr } = await supabase.from('products').upsert({
                    barcode: offProduct.barcode, name: offProduct.name, brand: offProduct.brand,
                    ingredients: offProduct.ingredients, nutrition: offProduct.nutrition,
                    additives: offProduct.additives, nutriscore: offProduct.nutriscore,
                    nova_group: offProduct.nova_group, image_url: offProduct.image_url,
                    raw_response: offProduct.raw_response, updated_at: new Date().toISOString(),
                }, { onConflict: 'barcode' });
                if (upsertErr) throw upsertErr;
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
                const { error: histErr } = await supabase.from('scan_history').insert({
                    user_id: userId, barcode: cleanBarcode, product_name: product.name,
                    health_score: healthScore.score, scan_type: 'barcode',
                });
                if (histErr) throw histErr;
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
