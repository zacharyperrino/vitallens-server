// ─── Health Profile Route ─────────────────────────────────────
// GET  /api/health-profile?userId=   — fetch profile + targets
// POST /api/health-profile           — save profile + targets

import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const router = Router();
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

router.get('/health-profile', async (req, res) => {
    try {
        const { userId } = req.query;
        if (!userId) return res.status(400).json({ error: 'userId required.' });

        const { data, error } = await supabase
            .from('health_profile')
            .select('*')
            .eq('user_id', userId)
            .single();

        if (error && error.code !== 'PGRST116') throw error;
        res.json({ profile: data || null });
    } catch (err) {
        console.error('[HealthProfile] Fetch failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

router.post('/health-profile', async (req, res) => {
    try {
        const { userId, ...profile } = req.body;
        if (!userId) return res.status(400).json({ error: 'userId required.' });

        const { error } = await supabase
            .from('health_profile')
            .upsert({ user_id: userId, ...profile, updated_at: new Date().toISOString() },
                { onConflict: 'user_id' });

        if (error) throw error;
        console.log(`[HealthProfile] Saved for user ${userId.slice(0, 8)}`);
        res.json({ saved: true });
    } catch (err) {
        console.error('[HealthProfile] Save failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

export default router;