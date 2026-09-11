// server/middleware/auth.js
// ─────────────────────────────────────────────────────────────
// requireAuth  — verifies the Supabase JWT LOCALLY against the project's
//                JWKS (no network round-trip per request). Falls back to
//                a remote check only for legacy HS256 tokens.
// requireSelf  — verifies the user can only access their own data
// ─────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js';
import { createRemoteJWKSet, jwtVerify, errors as joseErrors } from 'jose';

const SUPABASE_URL = process.env.SUPABASE_URL;
const ISSUER = `${SUPABASE_URL}/auth/v1`;

// Cached + auto-refreshing key set. One fetch, then in-memory verification.
const JWKS = createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks.json`), {
  cooldownDuration: 30_000,
  cacheMaxAge: 10 * 60_000,
});

async function verifyLocally(token) {
  const { payload } = await jwtVerify(token, JWKS, { issuer: ISSUER, audience: 'authenticated' });
  if (!payload.sub) throw new joseErrors.JWTInvalid('missing sub');
  return { id: payload.sub, email: payload.email || null, role: payload.role || 'authenticated' };
}

async function verifyRemotely(token) {
  const client = createClient(SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) return null;
  return { id: data.user.id, email: data.user.email || null, role: data.user.role || 'authenticated' };
}

export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Not logged in.' });
  }
  const token = authHeader.slice(7);

  let user;
  try {
    user = await verifyLocally(token);
  } catch (err) {
    // Expired / bad signature / wrong audience → definitively unauthorized.
    if (err instanceof joseErrors.JWTExpired || err instanceof joseErrors.JWSSignatureVerificationFailed
        || err instanceof joseErrors.JWTClaimValidationFailed || err instanceof joseErrors.JWTInvalid) {
      return res.status(401).json({ error: 'Invalid or expired session.' });
    }
    // No matching key (legacy HS256 project) or JWKS unreachable → try the
    // remote check once; if that also fails for a non-auth reason, say so.
    try {
      user = await verifyRemotely(token);
      if (!user) return res.status(401).json({ error: 'Invalid or expired session.' });
    } catch {
      return res.status(503).json({ error: 'Authentication service unavailable. Please try again.' });
    }
  }

  req.user = user;
  // RLS-scoped client for routes that read on the user's behalf.
  req.supabase = createClient(SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  next();
}

export function requireSelf(paramKey = 'userId') {
  return (req, res, next) => {
    const requestedId = req.params[paramKey] || req.query[paramKey] || req.body?.[paramKey];
    if (!requestedId) return res.status(400).json({ error: `${paramKey} is required.` });
    if (requestedId !== req.user.id) return res.status(403).json({ error: 'Forbidden.' });
    next();
  };
}
