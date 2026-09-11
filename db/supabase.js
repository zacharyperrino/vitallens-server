// ─── Shared Supabase service-role client ─────────────────────
// One client for the whole API process. The service-role key bypasses RLS,
// so every route that uses this MUST derive the user from req.user (set by
// requireAuth) — never from client-supplied ids.
import { createClient } from '@supabase/supabase-js';

// Bound every PostgREST call so a hung connection can't hang a request forever.
// A signal supabase-js attaches itself (e.g. `.abortSignal()`) still wins.
const REQUEST_TIMEOUT_MS = 15_000;
const fetchWithTimeout = (url, opts = {}) => fetch(url, {
    ...opts,
    signal: opts.signal
        ? AbortSignal.any([opts.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)])
        : AbortSignal.timeout(REQUEST_TIMEOUT_MS),
});

export const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: fetchWithTimeout },
    }
);
