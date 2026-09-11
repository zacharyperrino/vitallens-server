// ─── Hygiene Product Scanner Route ───────────────────────────
// POST /api/hygiene/scan    — scan hygiene product by barcode
// GET  /api/hygiene/history — get scan history

import { Router } from 'express';
import { fetchBeautyProduct } from '../services/openBeautyFacts.js';
import { lightLimiter } from '../services/ai-limiters.js';
import { supabase } from '../db/supabase.js';

import { sendError } from '../utils/errors.js';

const router = Router();

// ── POST /api/hygiene/scan ────────────────────────────────────
router.post('/hygiene/scan', lightLimiter, async (req, res) => {
    try {
        const { barcode } = req.body;
        const userId = req.user.id;
        if (!barcode) return res.status(400).json({ error: 'barcode required.' });

        const cleanBarcode = barcode.trim().replace(/[^0-9]/g, '');
        console.log(`[Hygiene] Scanning barcode: ${cleanBarcode}`);

        const product = await fetchBeautyProduct(cleanBarcode);

        if (!product) {
            return res.status(404).json({
                error: 'Product not found in Open Beauty Facts.',
                barcode: cleanBarcode,
                suggestion: 'Try searching by product name instead.',
            });
        }

        // Save scan to Supabase
        {
            const { error: saveErr } = await supabase.from('hygiene_scans').insert({
                user_id: userId,
                barcode: cleanBarcode,
                product_name: product.name,
                brand: product.brand,
                category: product.category,
                ingredients: product.ingredients,
                concerns: product.concerns,
                safety_score: product.safetyScore,
                image_url: product.image_url,
                scanned_at: new Date().toISOString(),
            });
            if (saveErr) console.warn('[Hygiene] Could not save scan:', saveErr.message);
        }

        console.log(`[Hygiene] Scan complete — ${product.name}, safety score: ${product.safetyScore}`);
        res.json({ product });

    } catch (err) {
        console.error('[Hygiene] Scan failed:', err.message);
        sendError(res, err);
    }
});

// ── GET /api/hygiene/history ──────────────────────────────────
router.get('/hygiene/history', async (req, res) => {
    try {
        const { userId, limit = 20 } = req.query;
        if (!userId) return res.status(400).json({ error: 'userId required.' });

        const { data, error } = await supabase
            .from('hygiene_scans')
            .select('*')
            .eq('user_id', userId)
            .order('scanned_at', { ascending: false })
            .limit(parseInt(limit));

        if (error) throw error;
        res.json({ scans: data || [] });
    } catch (err) {
        sendError(res, err);
    }
});

export default router;