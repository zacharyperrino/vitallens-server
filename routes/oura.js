// ─── Oura Ring Integration ────────────────────────────────────
// GET  /api/oura/connect?userId=     — start OAuth flow
// GET  /api/oura/callback            — handle OAuth callback
// POST /api/oura/sync?userId=        — sync latest Oura data
// GET  /api/oura/status?userId=      — check connection status

import { Router } from 'express';
import { supabase } from '../db/supabase.js';

import { sendError } from '../utils/errors.js';
import { daysAgoISO, todayISO } from '../utils/dates.js';

import { signState } from '../services/oauth-state.js';

const router = Router();

const OURA_CLIENT_ID = process.env.OURA_CLIENT_ID;
const OURA_CLIENT_SECRET = process.env.OURA_CLIENT_SECRET;
const OURA_REDIRECT_URI = process.env.OURA_REDIRECT_URI
    || `${process.env.API_PUBLIC_URL || 'http://localhost:3001'}/api/oura/callback`;
const OURA_AUTH_URL = 'https://cloud.ouraring.com/oauth/authorize';
const OURA_TOKEN_URL = 'https://api.ouraring.com/oauth/token';
const OURA_API_BASE = 'https://api.ouraring.com/v2';

// ── GET /api/oura/connect ─────────────────────────────────────
router.get('/oura/connect', (req, res) => {
    if (!OURA_CLIENT_ID || !OURA_CLIENT_SECRET) {
        return res.status(503).json({ error: 'Oura integration is not configured on this server.' });
    }
    const userId = req.user.id;
    const params = new URLSearchParams({
        response_type: 'code',
        client_id: OURA_CLIENT_ID,
        redirect_uri: OURA_REDIRECT_URI,
        scope: 'daily heartrate personal session spo2 workout',
        state: signState(userId, 'oura'),
    });
    console.log(`[Oura] Starting OAuth for ${userId.slice(0, 8)}`);
    res.json({ url: `${OURA_AUTH_URL}?${params}` });
});

// ── POST /api/oura/sync ───────────────────────────────────────
router.post('/oura/sync', async (req, res) => {
    try {
        const userId = req.user.id;
        if (!userId) return res.status(400).json({ error: 'userId required.' });

        const { data: connection } = await supabase
            .from('wearable_connections')
            .select('access_token, refresh_token, token_expiry')
            .eq('user_id', userId)
            .eq('provider', 'oura')
            .single();

        if (!connection) return res.status(404).json({ error: 'Oura not connected.' });

        // Refresh token if expired
        let accessToken = connection.access_token;
        if (new Date(connection.token_expiry) < new Date()) {
            accessToken = await refreshOuraToken(userId, connection.refresh_token);
        }

        const today = todayISO();
        const sevenDaysAgo = daysAgoISO(7);

        // Fetch sleep, readiness, activity, HRV in parallel
        const [sleepRes, readinessRes, activityRes] = await Promise.allSettled([
            ouraFetch('/usercollection/daily_sleep', accessToken, { start_date: sevenDaysAgo, end_date: today }),
            ouraFetch('/usercollection/daily_readiness', accessToken, { start_date: sevenDaysAgo, end_date: today }),
            ouraFetch('/usercollection/daily_activity', accessToken, { start_date: sevenDaysAgo, end_date: today }),
        ]);

        const synced = { sleep: 0, readiness: 0, activity: 0 };

        // Sync sleep data
        if (sleepRes.status === 'fulfilled' && sleepRes.value?.data) {
            for (const day of sleepRes.value.data) {
                await supabase.from('sleep_log').upsert({
                    user_id: userId,
                    date: day.day,
                    hours: Math.round((day.total_sleep_duration / 3600) * 10) / 10,
                    quality: scoreToQuality(day.score),
                    source: 'oura',
                    hrv_ms: day.average_hrv || null,
                    logged_at: new Date().toISOString(),
                }, { onConflict: 'user_id,date' });
                synced.sleep++;
            }
        }

        // Sync readiness as hr_readings
        if (readinessRes.status === 'fulfilled' && readinessRes.value?.data) {
            for (const day of readinessRes.value.data) {
                await supabase.from('hr_readings').upsert({
                    user_id: userId,
                    date: day.day,
                    readiness_score: day.score,
                    resting_hr: day.resting_heart_rate || null,
                    source: 'oura',
                    logged_at: new Date().toISOString(),
                }, { onConflict: 'user_id,date' });
                synced.readiness++;
            }
        }

        // Sync activity as exercise
        if (activityRes.status === 'fulfilled' && activityRes.value?.data) {
            for (const day of activityRes.value.data) {
                if (day.steps > 1000) {
                    await supabase.from('exercise_log').upsert({
                        user_id: userId,
                        type: 'Daily Activity',
                        name: `${day.steps.toLocaleString()} steps`,
                        duration: Math.round(day.active_calories / 5),
                        calories: day.active_calories || null,
                        source: 'oura',
                        logged_at: new Date(day.day).toISOString(),
                    }, { onConflict: 'user_id,source,logged_at' });
                    synced.activity++;
                }
            }
        }

        console.log(`[Oura] Synced for ${userId.slice(0, 8)}: ${JSON.stringify(synced)}`);
        res.json({ success: true, synced });

    } catch (err) {
        console.error('[Oura] Sync failed:', err.message);
        sendError(res, err);
    }
});

// ── GET /api/oura/status ──────────────────────────────────────
router.get('/oura/status', async (req, res) => {
    try {
        const userId = req.user.id;
        if (!userId) return res.status(400).json({ error: 'userId required.' });

        const { data } = await supabase
            .from('wearable_connections')
            .select('connected_at, token_expiry')
            .eq('user_id', userId)
            .eq('provider', 'oura')
            .single();

        res.json({
            connected: !!data,
            connectedAt: data?.connected_at || null,
        });
    } catch {
        // Soft probe: a lookup failure reads as "not connected", never as a 500.
        res.json({ connected: false });
    }
});

// ── Helpers ───────────────────────────────────────────────────
async function ouraFetch(path, accessToken, params = {}) {
    const url = new URL(`${OURA_API_BASE}${path}`);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`Oura API error: ${res.status}`);
    return res.json();
}

async function refreshOuraToken(userId, refreshToken) {
    const res = await fetch(OURA_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: OURA_CLIENT_ID,
            client_secret: OURA_CLIENT_SECRET,
        }),
    });
    if (!res.ok) throw new Error('Token refresh failed');
    const tokens = await res.json();

    await supabase.from('wearable_connections').update({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_expiry: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    }).eq('user_id', userId).eq('provider', 'oura');

    return tokens.access_token;
}

function scoreToQuality(score) {
    if (!score) return 'Fair';
    if (score >= 85) return 'Excellent';
    if (score >= 70) return 'Good';
    if (score >= 55) return 'Fair';
    return 'Poor';
}

export default router;