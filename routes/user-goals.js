// ─── User Goals Route ─────────────────────────────────────────
import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const router = Router();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

router.get('/user-goals', async (req, res) => {
    try {
        const { userId } = req.query;
        if (!userId) return res.status(400).json({ error: 'userId required.' });
        const { data, error } = await supabase.from('user_goals').select('*').eq('user_id', userId).single();
        if (error && error.code !== 'PGRST116') throw error;
        res.json({ goals: data || null });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/user-goals', async (req, res) => {
    try {
        const { userId, goals_text, dietary_restrictions, health_concerns } = req.body;
        if (!userId) return res.status(400).json({ error: 'userId required.' });
        const { error } = await supabase.from('user_goals').upsert(
            { user_id: userId, goals_text, dietary_restrictions, health_concerns, updated_at: new Date().toISOString() },
            { onConflict: 'user_id' }
        );
        if (error) throw error;
        console.log(`[UserGoals] Saved for ${userId.slice(0, 8)}`);
        res.json({ saved: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;