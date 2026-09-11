// ─── Push Notification Route ──────────────────────────────────
// POST /api/push/subscribe    — save push subscription
// POST /api/push/send         — send push notification
// DELETE /api/push/unsubscribe — remove subscription

import { Router } from 'express';
import webpush from 'web-push';
import { supabase } from '../db/supabase.js';

import { sendError } from '../utils/errors.js';

const router = Router();

// Web push is optional: without VAPID keys the routes answer 503 and the
// app keeps its local (in-page) reminders. See services/push-reminders.js.
const PUSH_CONFIGURED = !!(process.env.VAPID_EMAIL && process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
if (PUSH_CONFIGURED) {
    webpush.setVapidDetails(process.env.VAPID_EMAIL, process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
}
router.use('/push', (req, res, next) => {
    if (!PUSH_CONFIGURED) return res.status(503).json({ error: 'Push notifications are not configured on this server.' });
    next();
});

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
        sendError(res, err);
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
        sendError(res, err);
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
        sendError(res, err);
    }
});

export default router;