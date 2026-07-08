// ─── Hygiene Product Scanner Route ───────────────────────────
// POST /api/hygiene/scan    — scan hygiene product by barcode
// GET  /api/hygiene/history — get scan history

import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import rateLimit from 'express-rate-limit';
import { fetchBeautyProduct } from '../services/openBeautyFacts.js';
import { lightLimiter } from '../services/ai-limiters.js';
import dotenv from 'dotenv';
dotenv.config();

const router = Router();
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── POST /api/hygiene/scan ────────────────────────────────────
router.post('/hygiene/scan', lightLimiter, async (req, res) => {
    try {
        const { barcode, userId } = req.body;
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
        if (userId) {
            await supabase.from('hygiene_scans').insert({
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
        }

        console.log(`[Hygiene] Scan complete — ${product.name}, safety score: ${product.safetyScore}`);
        res.json({ product });

    } catch (err) {
        console.error('[Hygiene] Scan failed:', err.message);
        res.status(500).json({ error: err.message });
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
        res.status(500).json({ error: err.message });
    }
});

export default router;