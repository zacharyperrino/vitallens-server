// ─── Usage Gates Service ──────────────────────────────────────
// Tracks and enforces usage limits for free tier users.
// Premium users (subscription_status = 'active') bypass all gates.

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
import { checkSpendGuard } from './spend-guard.js';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── Free tier limits ──────────────────────────────────────────
export const FREE_LIMITS = {
    food_vision_scan: { count: 5, window: 'day', label: '5 food vision scans per day' },
    lab_upload: { count: 2, window: 'month', label: '2 lab uploads per month' },
    ai_chat: { count: 10, window: 'day', label: '10 AI chat messages per day' },
    correlation_run: { count: 3, window: 'month', label: '3 pattern analyses per month' },
    prediction_run: { count: 3, window: 'month', label: '3 trend analyses per month' },
    weekly_report: { count: 1, window: 'week', label: '1 weekly summary per week' },
    narrative: { count: 1, window: 'month', label: '1 wellness narrative per month' },
};

// ── Check if user is premium ──────────────────────────────────
export async function isPremium(userId) {
    try {
        const { data } = await supabase
            .from('profiles')
            .select('subscription_status, trial_end')
            .eq('id', userId)
            .single();

        if (!data) return false;

        // Active subscription
        if (data.subscription_status === 'active') return true;

        // Active trial
        if (data.subscription_status === 'trialing' && data.trial_end) {
            return new Date(data.trial_end) > new Date();
        }

        return false;
    } catch {
        return false;
    }
}

// ── Get window start date ─────────────────────────────────────
function getWindowStart(window) {
    const now = new Date();
    switch (window) {
        case 'day':
            return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        case 'week':
            const day = now.getDay();
            const diff = now.getDate() - day + (day === 0 ? -6 : 1);
            return new Date(now.getFullYear(), now.getMonth(), diff).toISOString();
        case 'month':
            return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        default:
            return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    }
}

// ── Check and increment usage ─────────────────────────────────
export async function checkAndIncrementUsage(userId, feature) {
    const premium = await isPremium(userId);

    // Hard spend ceiling — applies to EVERYONE (including premium) before any
    // model call. This is the backstop against surprise bills.
    const spend = await checkSpendGuard(userId, premium);
    if (!spend.allowed) {
        return { allowed: false, premium, message: spend.message, spendCapReached: true };
    }

    // Premium users bypass per-feature count gates (but not the spend cap above)
    if (premium) return { allowed: true, premium: true };

    const limit = FREE_LIMITS[feature];
    if (!limit) return { allowed: true }; // Unknown feature — allow

    const windowStart = getWindowStart(limit.window);

    try {
        // Get current usage
        const { data: usage } = await supabase
            .from('usage_tracking')
            .select('count')
            .eq('user_id', userId)
            .eq('feature', feature)
            .gte('window_start', windowStart)
            .single();

        const currentCount = usage?.count || 0;

        if (currentCount >= limit.count) {
            return {
                allowed: false,
                premium: false,
                limit: limit.count,
                used: currentCount,
                window: limit.window,
                message: `Free tier limit reached: ${limit.label}. Upgrade to Premium for unlimited access.`,
                upgradeRequired: true,
            };
        }

        // Increment usage
        if (usage) {
            await supabase
                .from('usage_tracking')
                .update({ count: currentCount + 1, updated_at: new Date().toISOString() })
                .eq('user_id', userId)
                .eq('feature', feature)
                .gte('window_start', windowStart);
        } else {
            await supabase
                .from('usage_tracking')
                .insert({
                    user_id: userId,
                    feature,
                    count: 1,
                    window_start: windowStart,
                    window_type: limit.window,
                });
        }

        return {
            allowed: true,
            premium: false,
            limit: limit.count,
            used: currentCount + 1,
            remaining: limit.count - currentCount - 1,
        };

    } catch (err) {
        console.warn('[UsageGates] Failed to check usage:', err.message);
        return { allowed: true }; // Fail open — don't block users on DB errors
    }
}

// ── Get usage summary for a user ──────────────────────────────
export async function getUsageSummary(userId) {
    const premium = await isPremium(userId);

    if (premium) {
        return {
            premium: true,
            limits: Object.fromEntries(
                Object.entries(FREE_LIMITS).map(([k, v]) => [k, { limit: 'unlimited', used: 0, remaining: 'unlimited' }])
            ),
        };
    }

    const summary = {};

    for (const [feature, limit] of Object.entries(FREE_LIMITS)) {
        const windowStart = getWindowStart(limit.window);
        try {
            const { data } = await supabase
                .from('usage_tracking')
                .select('count')
                .eq('user_id', userId)
                .eq('feature', feature)
                .gte('window_start', windowStart)
                .single();

            const used = data?.count || 0;
            summary[feature] = {
                limit: limit.count,
                used,
                remaining: Math.max(0, limit.count - used),
                window: limit.window,
                label: limit.label,
            };
        } catch {
            summary[feature] = {
                limit: limit.count,
                used: 0,
                remaining: limit.count,
                window: limit.window,
                label: limit.label,
            };
        }
    }

    return { premium: false, limits: summary };
}