// ─── Spend Guard ──────────────────────────────────────────────
// Hard dollar ceiling on AI spend, enforced BEFORE any model call.
// This is the backstop that makes surprise bills impossible: even a premium
// user, a bug, or abuse cannot exceed the monthly caps set here.
//
// Caps are env-configurable (USD, per calendar month):
//   MAX_USER_MONTHLY_USD          free-tier per-user cap   (default 5)
//   MAX_USER_MONTHLY_USD_PREMIUM  premium per-user cap     (default 50)
//   MAX_GLOBAL_MONTHLY_USD        whole-app cap            (default 250)

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const USER_CAP = Number(process.env.MAX_USER_MONTHLY_USD) || 5;
const USER_CAP_PREMIUM = Number(process.env.MAX_USER_MONTHLY_USD_PREMIUM) || 50;
const GLOBAL_CAP = Number(process.env.MAX_GLOBAL_MONTHLY_USD) || 250;

function monthStartISO() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

async function sumSpend(filterUserId) {
    let q = supabase
        .from('api_cost_log')
        .select('cost_usd')
        .gte('logged_at', monthStartISO());
    if (filterUserId) q = q.eq('user_id', filterUserId);
    const { data, error } = await q;
    if (error) throw error;
    return (data || []).reduce((sum, r) => sum + (Number(r.cost_usd) || 0), 0);
}

/**
 * @param {string} userId
 * @param {boolean} premium
 * @returns {{allowed:boolean, message?:string, userSpend:number, globalSpend:number, userCap:number, globalCap:number}}
 */
export async function checkSpendGuard(userId, premium = false) {
    try {
        const userCap = premium ? USER_CAP_PREMIUM : USER_CAP;
        const [userSpend, globalSpend] = await Promise.all([
            userId ? sumSpend(userId) : Promise.resolve(0),
            sumSpend(null),
        ]);

        if (globalSpend >= GLOBAL_CAP) {
            return { allowed: false, message: 'AI features are temporarily paused (service spend cap reached). Please try again later.', userSpend, globalSpend, userCap, globalCap: GLOBAL_CAP };
        }
        if (userId && userSpend >= userCap) {
            return { allowed: false, message: 'You have reached your monthly AI usage limit. It resets at the start of next month.', userSpend, globalSpend, userCap, globalCap: GLOBAL_CAP };
        }
        return { allowed: true, userSpend, globalSpend, userCap, globalCap: GLOBAL_CAP };
    } catch (err) {
        // Fail CLOSED on the global cap is safer, but a DB blip shouldn't brick
        // the app; log loudly and allow. Per-request rate limits still apply.
        console.warn('[SpendGuard] check failed, allowing:', err.message);
        return { allowed: true, userSpend: 0, globalSpend: 0, userCap: USER_CAP, globalCap: GLOBAL_CAP };
    }
}

export async function getUserSpend(userId) {
    const premium = false;
    try {
        const userSpend = await sumSpend(userId);
        return { monthToDateUsd: Number(userSpend.toFixed(4)), cap: premium ? USER_CAP_PREMIUM : USER_CAP };
    } catch {
        return { monthToDateUsd: 0, cap: USER_CAP };
    }
}
