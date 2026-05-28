import { Router } from 'express';
import { getUsageSummary, checkAndIncrementUsage } from '../services/usage-gates.js';

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

export default router;