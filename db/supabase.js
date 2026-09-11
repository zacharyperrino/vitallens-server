// ─── Shared Supabase service-role client ─────────────────────
// One client for the whole API process. The service-role key bypasses RLS,
// so every route that uses this MUST derive the user from req.user (set by
// requireAuth) — never from client-supplied ids.
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
);
