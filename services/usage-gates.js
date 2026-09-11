// ─── Usage Gates Service ──────────────────────────────────────
// Free-tier feature counters. Premium users (active subscription or
// unexpired trial) bypass the COUNT gates but never the spend guard.
//
// The increment is a single atomic Postgres call (increment_usage): there
// is no read-modify-write window, so concurrent requests cannot create
// duplicate rows or disable the gate.

import { supabase } from '../db/supabase.js';
import { checkSpendGuard } from './spend-guard.js';

export const FREE_LIMITS = {
    food_vision_scan:   { count: 5,  window: 'day',   label: '5 food vision scans per day' },
    lab_upload:         { count: 2,  window: 'month', label: '2 lab uploads per month' },
    ai_chat:            { count: 10, window: 'day',   label: '10 AI chat messages per day' },
    correlation_run:    { count: 3,  window: 'month', label: '3 pattern analyses per month' },
    prediction_run:     { count: 3,  window: 'month', label: '3 trend analyses per month' },
    weekly_report:      { count: 1,  window: 'week',  label: '1 weekly summary per week' },
    narrative:          { count: 1,  window: 'month', label: '1 wellness narrative per month' },
    biomarker_scan:     { count: 3,  window: 'day',   label: '3 wellness photo check-ins per day' },
    early_patterns:     { count: 5,  window: 'day',   label: '5 early-pattern checks per day' },
    custom_correlation: { count: 5,  window: 'day',   label: '5 custom correlations per day' },
};

export async function isPremium(userId) {
    try {
        const { data } = await supabase
            .from('profiles')
            .select('subscription_status, trial_end')
            .eq('id', userId)
            .maybeSingle();
        if (!data) return false;
        if (data.subscription_status === 'active') return true;
        if (data.subscription_status === 'trialing' && data.trial_end) {
            return new Date(data.trial_end) > new Date();
        }
        return false;
    } catch {
        return false;
    }
}

function getWindowStart(window) {
    const now = new Date();
    switch (window) {
        case 'week': {
            const day = now.getDay();
            const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday start
            return new Date(now.getFullYear(), now.getMonth(), diff).toISOString();
        }
        case 'month':
            return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        case 'day':
        default:
            return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    }
}

export async function checkAndIncrementUsage(userId, feature) {
    const premium = await isPremium(userId);

    // Hard spend ceiling applies to EVERYONE, premium included.
    const spend = await checkSpendGuard(userId, premium);
    if (!spend.allowed) {
        return { allowed: false, premium, message: spend.message, spendCapReached: true };
    }
    if (premium) return { allowed: true, premium: true };

    const limit = FREE_LIMITS[feature];
    if (!limit) return { allowed: true };

    const windowStart = getWindowStart(limit.window);
    const { data, error } = await supabase.rpc('increment_usage', {
        p_user: userId,
        p_feature: feature,
        p_window_start: windowStart,
        p_window_type: limit.window,
        p_limit: limit.count,
    });

    if (error) {
        // Counting failed: allow this one request (rate limits + spend guard
        // still apply) but log loudly — this should never be silent.
        console.error('[UsageGates] increment_usage failed, allowing:', error.message);
        return { allowed: true, premium: false, degraded: true };
    }

    const row = Array.isArray(data) ? data[0] : data;
    const used = row?.current_count ?? 0;
    if (!row?.allowed) {
        return {
            allowed: false, premium: false, limit: limit.count, used, window: limit.window,
            message: `Free tier limit reached: ${limit.label}. Upgrade to Premium for unlimited access.`,
            upgradeRequired: true,
        };
    }
    return { allowed: true, premium: false, limit: limit.count, used, remaining: Math.max(0, limit.count - used) };
}

export async function getUsageSummary(userId) {
    const premium = await isPremium(userId);
    if (premium) {
        return {
            premium: true,
            limits: Object.fromEntries(Object.keys(FREE_LIMITS).map(k => [k, { limit: 'unlimited', used: 0, remaining: 'unlimited' }])),
        };
    }
    const summary = {};
    for (const [feature, limit] of Object.entries(FREE_LIMITS)) {
        const windowStart = getWindowStart(limit.window);
        const { data } = await supabase
            .from('usage_tracking')
            .select('count')
            .eq('user_id', userId)
            .eq('feature', feature)
            .eq('window_start', windowStart)
            .maybeSingle();
        const used = data?.count || 0;
        summary[feature] = { limit: limit.count, used, remaining: Math.max(0, limit.count - used), window: limit.window, label: limit.label };
    }
    return { premium: false, limits: summary };
}
