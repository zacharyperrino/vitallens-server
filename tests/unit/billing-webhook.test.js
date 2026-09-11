import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import Stripe from 'stripe';

const { db } = vi.hoisted(() => ({
  db: { from: vi.fn(), update: vi.fn(), eq: vi.fn(), select: vi.fn(), single: vi.fn() },
}));

vi.mock('../../db/supabase.js', () => ({ supabase: { from: db.from } }));
vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (_req, _res, next) => next(),
  requireSelf: () => (_req, _res, next) => next(),
}));
vi.mock('@sentry/node', () => ({ captureException: vi.fn() }));

// Both are read at import / request time respectively.
const WEBHOOK_SECRET = 'whsec_unit_test_secret';
process.env.STRIPE_SECRET_KEY = 'sk_test_x';
process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
const { default: billingRoutes } = await import('../../routes/billing.js');

// Mirrors server.js: raw body on the webhook path, JSON everywhere else.
const app = express();
app.use('/api/billing/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());
app.use('/api', billingRoutes);

const stripe = new Stripe('sk_test_x');
const sign = (payload, opts = {}) =>
  stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET, ...opts });
const event = (type, object = {}) =>
  JSON.stringify({ id: 'evt_1', object: 'event', type, data: { object } });

const post = (payload, signature) =>
  request(app)
    .post('/api/billing/webhook')
    .set('Content-Type', 'application/json')
    .set('stripe-signature', signature)
    .send(payload);

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  db.from.mockReturnValue({ update: db.update, select: db.select });
  db.update.mockReturnValue({ eq: db.eq });
  db.eq.mockResolvedValue({ error: null });
  db.select.mockReturnValue({ eq: () => ({ single: db.single }) });
  db.single.mockResolvedValue({ data: null, error: null });
});

describe('POST /api/billing/webhook — signature verification', () => {
  it('accepts a correctly signed event', async () => {
    const payload = event('ping');
    const res = await post(payload, sign(payload));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('rejects a payload that was modified after signing', async () => {
    const payload = event('checkout.session.completed', { metadata: { userId: 'victim' } });
    const signature = sign(payload);
    const tampered = payload.replace('victim', 'attacker');

    const res = await post(tampered, signature);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Webhook signature verification failed.' });
    expect(db.from).not.toHaveBeenCalled();
  });

  it('rejects a missing signature header', async () => {
    const res = await request(app)
      .post('/api/billing/webhook')
      .set('Content-Type', 'application/json')
      .send(event('ping'));
    expect(res.status).toBe(400);
  });

  it('rejects a signature made with a different secret', async () => {
    const payload = event('ping');
    const res = await post(payload, sign(payload, { secret: 'whsec_someone_else' }));
    expect(res.status).toBe(400);
  });

  it('rejects a stale signature (replay outside the tolerance window)', async () => {
    const payload = event('ping');
    const tenMinutesAgo = Math.floor(Date.now() / 1000) - 600;
    const res = await post(payload, sign(payload, { timestamp: tenMinutesAgo }));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/billing/webhook — event handling', () => {
  it('grants premium on checkout.session.completed using the session metadata user', async () => {
    const payload = event('checkout.session.completed', {
      metadata: { userId: 'user-9' },
      customer: 'cus_1',
      subscription: 'sub_1',
    });
    const res = await post(payload, sign(payload));

    expect(res.status).toBe(200);
    expect(db.from).toHaveBeenCalledWith('profiles');
    expect(db.update).toHaveBeenCalledWith(
      expect.objectContaining({
        subscription_status: 'active',
        subscription_plan: 'premium',
        stripe_customer_id: 'cus_1',
        stripe_subscription_id: 'sub_1',
        trial_end: null,
      }),
    );
    expect(db.eq).toHaveBeenCalledWith('id', 'user-9');
  });

  it('ignores a completed session that carries no userId', async () => {
    const payload = event('checkout.session.completed', { metadata: {} });
    const res = await post(payload, sign(payload));
    expect(res.status).toBe(200);
    expect(db.update).not.toHaveBeenCalled();
  });

  it('downgrades to free on customer.subscription.deleted', async () => {
    const payload = event('customer.subscription.deleted', {
      id: 'sub_1',
      metadata: { userId: 'user-9' },
    });
    await post(payload, sign(payload));

    expect(db.update).toHaveBeenCalledWith(
      expect.objectContaining({ subscription_status: 'canceled', subscription_plan: 'free' }),
    );
    expect(db.eq).toHaveBeenCalledWith('id', 'user-9');
  });

  it('marks past_due on invoice.payment_failed, resolving the user by customer id', async () => {
    db.single.mockResolvedValue({ data: { id: 'user-4' }, error: null });
    const payload = event('invoice.payment_failed', { customer: 'cus_4' });
    await post(payload, sign(payload));

    expect(db.update).toHaveBeenCalledWith(
      expect.objectContaining({ subscription_status: 'past_due', subscription_plan: 'free' }),
    );
    expect(db.eq).toHaveBeenCalledWith('id', 'user-4');
  });

  it('returns 500 when the profile write throws', async () => {
    db.eq.mockRejectedValue(new Error('db down'));
    const payload = event('customer.subscription.deleted', { id: 's', metadata: { userId: 'u' } });
    const res = await post(payload, sign(payload));
    expect(res.status).toBe(500);
  });
});
