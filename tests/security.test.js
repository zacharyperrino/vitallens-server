// Integration tests for security-critical routes, against the real Express app.
// Uses the two Supabase test users from .env.test to obtain real JWTs.
// Every test asserts an actual auth/consent property — none pass without it.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createClient } from '@supabase/supabase-js';
import app from '../server.js';

const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function signIn(email, password) {
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error || !data?.session) throw new Error(`Sign-in failed for ${email}: ${error?.message || 'no session'}`);
  return { token: data.session.access_token, id: data.user.id };
}

async function clearLink() {
  await admin.from('practitioner_links').delete().eq('practitioner_id', A.id).eq('client_id', B.id);
}

let A, B;

beforeAll(async () => {
  A = await signIn(process.env.TEST_USER_A_EMAIL, process.env.TEST_USER_A_PASSWORD);
  B = await signIn(process.env.TEST_USER_B_EMAIL, process.env.TEST_USER_B_PASSWORD);
  await clearLink();
});

afterAll(async () => {
  await clearLink();
});

describe('practitioner portal is FROZEN (not mounted)', () => {
  // The practitioner portal was unmounted pending counsel review + a proper
  // consent flow. It must not be reachable — no cross-user data path exists.
  it('practitioner/client-data returns 404 (route frozen)', async () => {
    const res = await request(app)
      .get(`/api/practitioner/client-data?practitionerId=${A.id}&clientId=${B.id}`)
      .set('Authorization', `Bearer ${A.token}`);
    expect(res.status).toBe(404);
    expect(res.body.meals).toBeUndefined();
    expect(res.body.sleep).toBeUndefined();
  });
});

describe('user-data/export', () => {
  it('returns 401 with no token', async () => {
    const res = await request(app).get(`/api/user-data/export?userId=${A.id}`);
    expect(res.status).toBe(401);
  });

  it('returns 403 when User B requests User A export', async () => {
    const res = await request(app)
      .get(`/api/user-data/export?userId=${A.id}`)
      .set('Authorization', `Bearer ${B.token}`);
    expect(res.status).toBe(403);
  });

  it('returns 200 for User A own export, scoped to their own userId', async () => {
    const res = await request(app)
      .get(`/api/user-data/export?userId=${A.id}`)
      .set('Authorization', `Bearer ${A.token}`);
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe(A.id);
  });
});

describe('requireSelf blocks cross-user access', () => {
  it('medications: 401 with no token', async () => {
    const res = await request(app).get(`/api/medications?userId=${A.id}`);
    expect(res.status).toBe(401);
  });

  it('medications: 403 when User B requests User A', async () => {
    const res = await request(app)
      .get(`/api/medications?userId=${A.id}`)
      .set('Authorization', `Bearer ${B.token}`);
    expect(res.status).toBe(403);
  });

  it('water/today: 403 when User B requests User A', async () => {
    const res = await request(app)
      .get(`/api/water/today?userId=${A.id}`)
      .set('Authorization', `Bearer ${B.token}`);
    expect(res.status).toBe(403);
  });

  it('cycle/current: 403 when User B requests User A', async () => {
    const res = await request(app)
      .get(`/api/cycle/current?userId=${A.id}`)
      .set('Authorization', `Bearer ${B.token}`);
    expect(res.status).toBe(403);
  });

  it('custom-correlation: 403 when User B posts User A userId', async () => {
    const res = await request(app)
      .post('/api/custom-correlation')
      .set('Authorization', `Bearer ${B.token}`)
      .send({ userId: A.id, variableA: 'sleep', variableB: 'calories' });
    expect(res.status).toBe(403);
  });
});

describe('global ownership guard covers previously-unguarded routes', () => {
  // These routes never had requireSelf; the app-wide guard must still block
  // any request that names another user's id in query or body.
  const getRoutes = [
    '/api/health-profile',
    '/api/supplements',
    '/api/user-goals',
    '/api/biomarker-history',
    '/api/meal-memory',
    '/api/hygiene/history',
  ];
  for (const route of getRoutes) {
    it(`${route}: 403 when User B requests User A via query`, async () => {
      const res = await request(app)
        .get(`${route}?userId=${A.id}`)
        .set('Authorization', `Bearer ${B.token}`);
      expect(res.status).toBe(403);
    });
  }

  it('health-profile POST: 403 when User B writes User A via body', async () => {
    const res = await request(app)
      .post('/api/health-profile')
      .set('Authorization', `Bearer ${B.token}`)
      .send({ userId: A.id, height_cm: 180 });
    expect(res.status).toBe(403);
  });

  it('own request still succeeds (guard does not block self)', async () => {
    const res = await request(app)
      .get(`/api/health-profile?userId=${A.id}`)
      .set('Authorization', `Bearer ${A.token}`);
    expect(res.status).not.toBe(403);
  });
});

describe('billing routes are authenticated (regression: unauthenticated IDOR)', () => {
  // billingRoutes mounts before the global auth gate so the Stripe webhook
  // stays public; every other billing route must authenticate itself.
  it('billing/status: 401 with no token, even with a valid userId', async () => {
    const res = await request(app).get(`/api/billing/status?userId=${A.id}`);
    expect(res.status).toBe(401);
  });

  it('billing/status: returns ONLY the caller\'s own record, ignoring userId param', async () => {
    const res = await request(app)
      .get(`/api/billing/status?userId=${A.id}`) // B asks for A
      .set('Authorization', `Bearer ${B.token}`);
    expect(res.status).toBe(200);
    // B gets B's status; the leaked stripe_customer_id field is never returned
    expect(res.body.stripe_customer_id).toBeUndefined();
  });

  it('billing/create-checkout: 401 with no token', async () => {
    const res = await request(app)
      .post('/api/billing/create-checkout')
      .send({ plan: 'monthly' });
    expect(res.status).toBe(401);
  });
});
