// ─── Push Notification Route ──────────────────────────────────
// POST /api/push/subscribe    — save push subscription
// POST /api/push/send         — send push notification
// DELETE /api/push/unsubscribe — remove subscription

import { Router } from 'express';
import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const router = Router();
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

webpush.setVapidDetails(
    process.env.VAPID_EMAIL,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
);

// ── POST /api/push/subscribe ──────────────────────────────────
router.post('/push/subscribe', async (req, res) => {
    try {
        const { userId, subscription } = req.body;
        if (!userId || !subscription) return res.status(400).json({ error: 'userId and subscription required.' });

        await supabase.from('profiles').update({
            push_subscription: subscription,
            push_enabled: true,
        }).eq('id', userId);

        console.log(`[Push] Subscription saved for ${userId.slice(0, 8)}`);
        res.json({ success: true });
    } catch (err) {
        console.error('[Push] Subscribe failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ── POST /api/push/send ───────────────────────────────────────
router.post('/push/send', async (req, res) => {
    try {
        const { userId, title, body, url = '/' } = req.body;
        if (!userId || !title) return res.status(400).json({ error: 'userId and title required.' });

        const { data: profile } = await supabase
            .from('profiles')
            .select('push_subscription, push_enabled')
            .eq('id', userId)
            .single();

        if (!profile?.push_subscription || !profile?.push_enabled) {
            return res.status(404).json({ error: 'No push subscription found.' });
        }

        await webpush.sendNotification(
            profile.push_subscription,
            JSON.stringify({ title, body, url })
        );

        console.log(`[Push] Notification sent to ${userId.slice(0, 8)}: ${title}`);
        res.json({ success: true });
    } catch (err) {
        console.error('[Push] Send failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ── DELETE /api/push/unsubscribe ──────────────────────────────
router.delete('/push/unsubscribe', async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId) return res.status(400).json({ error: 'userId required.' });

        await supabase.from('profiles').update({
            push_subscription: null,
            push_enabled: false,
        }).eq('id', userId);

        console.log(`[Push] Unsubscribed ${userId.slice(0, 8)}`);
        res.json({ success: true });
    } catch (err) {
        console.error('[Push] Unsubscribe failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

export default router;