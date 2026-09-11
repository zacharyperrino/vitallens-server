// ─── Oura OAuth callback (PUBLIC) ─────────────────────────────
// The browser redirect from Oura carries no Authorization header, so this
// one route lives outside the auth gate. The user is recovered ONLY from the
// HMAC-signed `state` we issued in /api/oura/connect — never from a raw id.
import { Router } from 'express';
import { supabase } from '../db/supabase.js';
import { verifyState } from '../services/oauth-state.js';

const router = Router();
const FRONTEND = process.env.FRONTEND_URL?.split(',')[0]?.trim() || 'http://localhost:3000';
const OURA_TOKEN_URL = 'https://api.ouraring.com/oauth/token';
const OURA_REDIRECT_URI = process.env.OURA_REDIRECT_URI
  || `${process.env.API_PUBLIC_URL || 'http://localhost:3001'}/api/oura/callback`;

router.get('/oura/callback', async (req, res) => {
  const { code, state, error } = req.query;
  if (error || !code) return res.redirect(`${FRONTEND}/#/profile?oura=error`);

  const userId = verifyState(state, 'oura');
  if (!userId) return res.redirect(`${FRONTEND}/#/profile?oura=invalid_state`);

  try {
    const tokenRes = await fetch(OURA_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code', code, redirect_uri: OURA_REDIRECT_URI,
        client_id: process.env.OURA_CLIENT_ID, client_secret: process.env.OURA_CLIENT_SECRET,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!tokenRes.ok) throw new Error(`Oura token exchange failed (${tokenRes.status})`);
    const tokens = await tokenRes.json();

    const { error: dbErr } = await supabase.from('wearable_connections').upsert({
      user_id: userId,
      provider: 'oura',
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expiry: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      connected_at: new Date().toISOString(),
    }, { onConflict: 'user_id,provider' });
    if (dbErr) throw dbErr;

    console.log(`[Oura] Connected for ${userId.slice(0, 8)}`);
    res.redirect(`${FRONTEND}/#/profile?oura=connected`);
  } catch (err) {
    console.error('[Oura] Callback failed:', err.message);
    res.redirect(`${FRONTEND}/#/profile?oura=error`);
  }
});

export default router;
