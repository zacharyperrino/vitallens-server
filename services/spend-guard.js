// ─── Spend Guard ──────────────────────────────────────────────
// Hard dollar ceiling on AI spend, enforced BEFORE any model call.
//
// Caps are env-configurable (USD, per calendar month):
//   MAX_USER_MONTHLY_USD          free-tier per-user cap   (default 5)
//   MAX_USER_MONTHLY_USD_PREMIUM  premium per-user cap     (default 50)
//   MAX_GLOBAL_MONTHLY_USD        whole-app cap            (default 250)
//
// Sums are computed by the sum_ai_spend() Postgres function — never by
// selecting rows, which PostgREST silently caps at 1,000.
//
// Failure policy: the GLOBAL check fails CLOSED (an outage must not become
// an uncapped bill); the per-user check fails open so a DB blip doesn't
// block a single user while rate limits still apply.

import { supabase } from '../db/supabase.js';

// An explicit 0 is an emergency kill switch — `Number(x) || default` would
// silently coerce it back to the default. Only unset / non-numeric falls back.
function envNumber(name, fallback) {
    const raw = process.env[name]?.trim();
    if (raw === undefined || raw === '') return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
}

const USER_CAP = envNumber('MAX_USER_MONTHLY_USD', 5);
const USER_CAP_PREMIUM = envNumber('MAX_USER_MONTHLY_USD_PREMIUM', 50);
const GLOBAL_CAP = envNumber('MAX_GLOBAL_MONTHLY_USD', 250);

function monthStartISO() {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

async function sumSpend(userId = null) {
    const { data, error } = await supabase.rpc('sum_ai_spend', {
        p_since: monthStartISO(),
        p_user: userId,
    });
    if (error) throw error;
    return Number(data) || 0;
}

export async function checkSpendGuard(userId, premium = false) {
    const userCap = premium ? USER_CAP_PREMIUM : USER_CAP;

    let globalSpend;
    try {
        globalSpend = await sumSpend(null);
    } catch (err) {
        console.error('[SpendGuard] Global check failed — failing CLOSED:', err.message);
        return { allowed: false, message: 'AI features are temporarily unavailable. Please try again shortly.', userSpend: 0, globalSpend: null, userCap, globalCap: GLOBAL_CAP };
    }
    if (globalSpend >= GLOBAL_CAP) {
        return { allowed: false, message: 'AI features are temporarily paused (service spend cap reached). Please try again later.', userSpend: 0, globalSpend, userCap, globalCap: GLOBAL_CAP };
    }

    let userSpend = 0;
    if (userId) {
        try {
            userSpend = await sumSpend(userId);
        } catch (err) {
            console.warn('[SpendGuard] User check failed, allowing:', err.message);
        }
        if (userSpend >= userCap) {
            return { allowed: false, message: 'You have reached your monthly AI usage limit. It resets at the start of next month.', userSpend, globalSpend, userCap, globalCap: GLOBAL_CAP };
        }
    }
    return { allowed: true, userSpend, globalSpend, userCap, globalCap: GLOBAL_CAP };
}

export async function getUserSpend(userId, premium = false) {
    try {
        const userSpend = await sumSpend(userId);
        return { monthToDateUsd: Number(userSpend.toFixed(4)), cap: premium ? USER_CAP_PREMIUM : USER_CAP };
    } catch {
        return { monthToDateUsd: null, cap: premium ? USER_CAP_PREMIUM : USER_CAP };
    }
}
