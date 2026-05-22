// ─── Health Score Route ──────────────────────────────────────
// POST /api/health-score
// Body: { nutrition: {...}, additives: [...], personalProfile?: {...} }
// Returns the 0–100 health score with breakdown.

import { Router } from 'express';
import { computeHealthScore } from '../services/healthScorer.js';
import { analyzeAdditives, estimateAdditiveRisk } from '../services/additiveAnalyzer.js';

const router = Router();

router.post('/health-score', async (req, res, next) => {
    try {
        const { nutrition, additives = [], personalProfile = {} } = req.body;

        if (!nutrition || typeof nutrition !== 'object') {
            return res.status(400).json({ error: 'Missing or invalid nutrition object' });
        }

        // Validate at least some nutrition fields
        const hasAnyValue = ['calories', 'protein', 'carbs', 'fat', 'sugar'].some(
            k => nutrition[k] != null && !isNaN(nutrition[k])
        );
        if (!hasAnyValue) {
            return res.status(400).json({
                error: 'Nutrition object must contain at least one of: calories, protein, carbs, fat, sugar',
            });
        }

        // Analyze additives
        let riskMap = {};
        let additiveAnalysis = null;

        if (additives.length > 0) {
            try {
                additiveAnalysis = await analyzeAdditives(additives);
                riskMap = additiveAnalysis.riskMap;
            } catch {
                // Fallback to estimation if DB unavailable
                for (const code of additives) {
                    riskMap[code] = estimateAdditiveRisk(code);
                }
            }
        }

        const result = computeHealthScore(nutrition, additives, riskMap, personalProfile);

        res.json({
            ...result,
            additives: additiveAnalysis || undefined,
            input: { nutrition, additiveCount: additives.length },
        });

    } catch (err) {
        next(err);
    }
});

export default router;
