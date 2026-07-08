// server/middleware/auth.js
// ─────────────────────────────────────────────────────────────
// requireAuth  — verifies the user is logged in via Supabase JWT
// requireSelf  — verifies the user can only access their own data
// ─────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js';

export function requireAuth(req, res, next) {
  // Read the Authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Not logged in.' });
  }

  const token = authHeader.split(' ')[1];

  // Verify the token with Supabase using the anon key
  // This enforces RLS — the user can only see their own data
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );

  supabase.auth.getUser(token).then(({ data: { user }, error }) => {
    if (error || !user) {
      return res.status(401).json({ error: 'Invalid or expired session.' });
    }
    // Attach verified user and their scoped client to the request
    req.user = user;
    req.supabase = supabase; // use this in routes — RLS enforced
    next();
  });
}

export function requireSelf(paramKey = 'userId') {
  return (req, res, next) => {
    const requestedId =
      req.params[paramKey] ||
      req.query[paramKey] ||
      req.body?.[paramKey];

    if (!requestedId) {
      return res.status(400).json({ error: `${paramKey} is required.` });
    }
    if (requestedId !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden.' });
    }
    next();
  };
}