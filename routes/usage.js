import { Router } from 'express';
import { getUsageSummary } from '../services/usage-gates.js';
import { getUserSpend } from '../services/spend-guard.js';

const router = Router();

router.get('/usage/status', async (req, res) => {
    try {
        const { userId } = req.query;
        if (!userId) return res.status(400).json({ error: 'userId required.' });
        const summary = await getUsageSummary(userId);
        res.json(summary);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Self-serve month-to-date AI spend for the signed-in user.
router.get('/usage/spend', async (req, res) => {
    try {
        const userId = req.user.id;
        const spend = await getUserSpend(userId);
        res.json(spend);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;