// ─── Stripe Billing Routes ────────────────────────────────────
// POST /api/billing/create-checkout   — create Stripe checkout session
// POST /api/billing/webhook           — handle Stripe webhook events
// GET  /api/billing/status?userId=    — get subscription status

import { Router } from 'express';
import Stripe from 'stripe';
import { requireAuth } from '../middleware/auth.js';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const router = Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── Price IDs — create these in Stripe dashboard ──────────────
// Replace with your actual Stripe price IDs after creating products
const PRICES = {
    monthly: process.env.STRIPE_PRICE_MONTHLY || 'price_monthly',
    annual: process.env.STRIPE_PRICE_ANNUAL || 'price_annual',
};

// ── POST /api/billing/create-checkout ────────────────────────
// This router is mounted before the global auth gate so the Stripe webhook
// (which Stripe signs, not the user) stays reachable. Every other billing
// route must therefore authenticate itself, and must NEVER trust a
// client-supplied userId — the webhook later grants premium to whatever id
// lands in session metadata.
router.post('/billing/create-checkout', requireAuth, async (req, res) => {
    try {
        const { plan = 'monthly', successUrl, cancelUrl } = req.body;
        const userId = req.user.id;
        const email = req.user.email;
        if (!email) return res.status(400).json({ error: 'Account has no email on file.' });

        const priceId = PRICES[plan];
        if (!priceId) return res.status(400).json({ error: 'Invalid plan.' });

        const session = await stripe.checkout.sessions.create({
            mode: 'subscription',
            payment_method_types: ['card'],
            customer_email: email,
            line_items: [{ price: priceId, quantity: 1 }],
            subscription_data: {
                trial_period_days: 14,
                metadata: { userId },
            },
            metadata: { userId },
            success_url: successUrl || `${process.env.FRONTEND_URL || 'http://localhost:3000'}/#/profile?upgraded=true`,
            cancel_url: cancelUrl || `${process.env.FRONTEND_URL || 'http://localhost:3000'}/#/profile`,
        });

        console.log(`[Billing] Checkout session created for ${userId.slice(0, 8)}`);
        res.json({ url: session.url, sessionId: session.id });

    } catch (err) {
        console.error('[Billing] Checkout failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ── POST /api/billing/webhook ─────────────────────────────────
// Must use raw body — add express.raw middleware in server.js
router.post('/billing/webhook', async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        event = stripe.webhooks.constructEvent(
            req.body,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET
        );
    } catch (err) {
        console.error('[Billing] Webhook signature failed:', err.message);
        return res.status(400).json({ error: 'Webhook signature verification failed.' });
    }

    const { type, data } = event;
    console.log(`[Billing] Webhook: ${type}`);

    try {
        switch (type) {
            case 'checkout.session.completed': {
                const session = data.object;
                const userId = session.metadata?.userId;
                if (!userId) break;

                await upsertSubscription(userId, {
                    status: 'active',
                    stripe_customer_id: session.customer,
                    stripe_subscription_id: session.subscription,
                    plan: 'premium',
                    trial_end: null,
                });
                break;
            }

            case 'customer.subscription.updated': {
                const sub = data.object;
                const userId = sub.metadata?.userId;
                if (!userId) break;

                await upsertSubscription(userId, {
                    status: sub.status,
                    stripe_subscription_id: sub.id,
                    plan: sub.status === 'active' ? 'premium' : 'free',
                    trial_end: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
                    current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
                });
                break;
            }

            case 'customer.subscription.deleted': {
                const sub = data.object;
                const userId = sub.metadata?.userId;
                if (!userId) break;

                await upsertSubscription(userId, {
                    status: 'canceled',
                    plan: 'free',
                    stripe_subscription_id: sub.id,
                });
                break;
            }

            case 'invoice.payment_failed': {
                const invoice = data.object;
                const customerId = invoice.customer;
                // Find user by customer ID and downgrade
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('id')
                    .eq('stripe_customer_id', customerId)
                    .single();

                if (profile) {
                    await upsertSubscription(profile.id, { status: 'past_due', plan: 'free' });
                }
                break;
            }
        }

        res.json({ received: true });

    } catch (err) {
        console.error('[Billing] Webhook handler failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ── GET /api/billing/status ───────────────────────────────────
router.get('/billing/status', requireAuth, async (req, res) => {
    try {
        // Only ever the caller's own status — the query param was an
        // unauthenticated IDOR that leaked any user's subscription record.
        const userId = req.user.id;

        const { data, error } = await supabase
            .from('profiles')
            .select('subscription_status, subscription_plan, trial_end, current_period_end')
            .eq('id', userId)
            .maybeSingle(); // no profile row yet (pre-onboarding) = free tier, not a 500

        if (error) throw error;

        res.json({
            status: data?.subscription_status || 'free',
            plan: data?.subscription_plan || 'free',
            isPremium: data?.subscription_status === 'active' || data?.subscription_status === 'trialing',
            trialEnd: data?.trial_end || null,
            currentPeriodEnd: data?.current_period_end || null,
        });

    } catch (err) {
        console.error('[Billing] Status fetch failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ── Helper ────────────────────────────────────────────────────
async function upsertSubscription(userId, fields) {
    const { error } = await supabase
        .from('profiles')
        .update({
            subscription_status: fields.status,
            subscription_plan: fields.plan,
            stripe_customer_id: fields.stripe_customer_id,
            stripe_subscription_id: fields.stripe_subscription_id,
            trial_end: fields.trial_end,
            current_period_end: fields.current_period_end,
            updated_at: new Date().toISOString(),
        })
        .eq('id', userId);

    if (error) console.error('[Billing] Subscription upsert failed:', error.message);
    else console.log(`[Billing] Subscription updated for ${userId.slice(0, 8)}: ${fields.status}`);
}

export default router;