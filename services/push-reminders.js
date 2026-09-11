// ─── Evening push reminders ──────────────────────────────────
// The only web-push sender. Every interval, look at subscribed profiles and
// nudge each user once per local day at 20:00 in their own timezone. Runs
// in-process on an unref'd timer, so it never keeps the process alive and
// never throws out of the interval. Without VAPID keys it is a no-op.
import webpush from 'web-push';
import { supabase } from '../db/supabase.js';

const REMINDER_HOUR = 20;
// Shape matches sw.js `push` handler: { title, body, url }.
const PAYLOAD = {
    title: 'VitalLens',
    body: 'Evening check-in — a minute to log today keeps your patterns honest.',
    url: '/#/health-input',
};

const vapidConfigured = () =>
    Boolean(process.env.VAPID_EMAIL && process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

let vapidReady = false;
function ensureVapid() {
    if (vapidReady) return;
    webpush.setVapidDetails(process.env.VAPID_EMAIL, process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
    vapidReady = true;
}

// Local hour and YYYY-MM-DD for an instant in a timezone; UTC if the zone is missing/invalid.
function localParts(date, tz) {
    const opts = (extra) => ({ timeZone: tz || 'UTC', ...extra });
    try {
        return {
            hour: parseInt(new Intl.DateTimeFormat('en-US', opts({ hour: 'numeric', hour12: false })).format(date), 10),
            date: new Intl.DateTimeFormat('en-CA', opts({ year: 'numeric', month: '2-digit', day: '2-digit' })).format(date),
        };
    } catch {
        return tz ? localParts(date, 'UTC') : { hour: NaN, date: '' };
    }
}

function isDue(row, now) {
    const { hour, date } = localParts(now, row.timezone);
    if (hour !== REMINDER_HOUR) return false;
    if (!row.last_push_at) return true;
    return localParts(new Date(row.last_push_at), row.timezone).date < date;
}

export async function sendDueReminders(now = new Date()) {
    const stats = { checked: 0, sent: 0, disabled: 0, failed: 0 };
    if (!vapidConfigured()) return stats;
    ensureVapid();

    const { data: rows, error } = await supabase
        .from('profiles')
        .select('id, push_subscription, timezone, last_push_at')
        .eq('push_enabled', true)
        .not('push_subscription', 'is', null);
    if (error) {
        console.warn('[Push] Reminder query failed:', error.message);
        return stats;
    }

    for (const row of rows || []) {
        stats.checked++;
        if (!isDue(row, now)) continue;
        const tag = String(row.id).slice(0, 8);
        try {
            await webpush.sendNotification(row.push_subscription, JSON.stringify(PAYLOAD));
            const { error: upErr } = await supabase
                .from('profiles').update({ last_push_at: now.toISOString() }).eq('id', row.id);
            if (upErr) console.warn(`[Push] last_push_at update failed for ${tag}:`, upErr.message);
            stats.sent++;
        } catch (err) {
            if (err?.statusCode === 404 || err?.statusCode === 410) {
                // Subscription expired/unsubscribed at the push service — stop trying.
                const { error: upErr } = await supabase
                    .from('profiles').update({ push_enabled: false, push_subscription: null }).eq('id', row.id);
                if (upErr) console.warn(`[Push] Disable failed for ${tag}:`, upErr.message);
                stats.disabled++;
            } else {
                console.warn(`[Push] Reminder failed for ${tag}:`, err?.statusCode || err?.message || err);
                stats.failed++;
            }
        }
    }

    if (stats.sent || stats.disabled || stats.failed) {
        console.log(`[Push] Reminders: sent ${stats.sent}, disabled ${stats.disabled}, failed ${stats.failed}`);
    }
    return stats;
}

export function startPushReminders({ intervalMs = 15 * 60 * 1000 } = {}) {
    if (!vapidConfigured()) {
        console.log('[Push] VAPID keys not set — evening reminders disabled');
        return null;
    }
    const timer = setInterval(() => {
        sendDueReminders().catch((err) => console.warn('[Push] Reminder tick failed:', err?.message || err));
    }, intervalMs);
    timer.unref();
    return timer;
}
