import { describe, it, expect, vi, beforeEach } from 'vitest';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('../../db/supabase.js', () => ({ supabase: { rpc } }));

import { checkSpendGuard, getUserSpend } from '../../services/spend-guard.js';

// Stub sum_ai_spend(): p_user === null is the global sum, otherwise the user sum.
// Pass an Error to simulate a Postgres/PostgREST failure for that branch.
function stubSpend({ global = 0, user = 0 } = {}) {
  rpc.mockImplementation(async (fn, { p_user }) => {
    expect(fn).toBe('sum_ai_spend');
    const v = p_user === null ? global : user;
    return v instanceof Error ? { data: null, error: v } : { data: v, error: null };
  });
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('checkSpendGuard', () => {
  it('allows when user and global spend are both under their caps', async () => {
    stubSpend({ global: 1.25, user: 0.5 });
    const r = await checkSpendGuard('user-1');

    expect(r.allowed).toBe(true);
    expect(r.userSpend).toBe(0.5);
    expect(r.globalSpend).toBe(1.25);
    expect(r.userCap).toBeGreaterThan(0);
    expect(r.globalCap).toBeGreaterThan(r.userCap);
  });

  it('sums the current calendar month (UTC) — global first, then the user', async () => {
    stubSpend();
    await checkSpendGuard('user-1');

    expect(rpc).toHaveBeenCalledTimes(2);
    const [[, first], [, second]] = rpc.mock.calls;
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    expect(first).toEqual({ p_since: monthStart, p_user: null });
    expect(second).toEqual({ p_since: monthStart, p_user: 'user-1' });
  });

  it('denies a user who has reached their monthly cap, with a user-facing message', async () => {
    stubSpend({ global: 0, user: 1e9 });
    const r = await checkSpendGuard('user-1');

    expect(r.allowed).toBe(false);
    expect(r.message).toMatch(/monthly AI usage limit/i);
    expect(r.userSpend).toBe(1e9);
  });

  it('treats spend exactly at the cap as over it', async () => {
    const { userCap } = await (stubSpend(), checkSpendGuard('user-1'));
    stubSpend({ user: userCap });
    expect((await checkSpendGuard('user-1')).allowed).toBe(false);
  });

  it('gives premium users a higher per-user cap', async () => {
    stubSpend();
    const { userCap: freeCap } = await checkSpendGuard('user-1', false);
    const { userCap: premiumCap } = await checkSpendGuard('user-1', true);
    expect(premiumCap).toBeGreaterThan(freeCap);

    stubSpend({ user: freeCap });
    expect((await checkSpendGuard('user-1', false)).allowed).toBe(false);
    expect((await checkSpendGuard('user-1', true)).allowed).toBe(true);
  });

  it('denies everyone (premium included) once the global cap is reached', async () => {
    stubSpend({ global: 1e9, user: 0 });
    const r = await checkSpendGuard('user-1', true);

    expect(r.allowed).toBe(false);
    expect(r.message).toMatch(/spend cap reached/i);
    expect(rpc).toHaveBeenCalledTimes(1); // user sum never consulted
  });

  it('fails CLOSED when the global sum errors', async () => {
    stubSpend({ global: new Error('connection refused') });
    const r = await checkSpendGuard('user-1');

    expect(r.allowed).toBe(false);
    expect(r.message).toMatch(/temporarily unavailable/i);
    expect(r.globalSpend).toBeNull();
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('fails OPEN when only the user sum errors', async () => {
    stubSpend({ global: 0, user: new Error('statement timeout') });
    const r = await checkSpendGuard('user-1');

    expect(r.allowed).toBe(true);
    expect(r.userSpend).toBe(0);
    expect(console.warn).toHaveBeenCalled();
  });

  it('skips the per-user check when no user id is supplied', async () => {
    stubSpend();
    const r = await checkSpendGuard(null);
    expect(r.allowed).toBe(true);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('treats a null sum (no rows this month) as zero spend', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const r = await checkSpendGuard('user-1');
    expect(r).toMatchObject({ allowed: true, userSpend: 0, globalSpend: 0 });
  });
});

describe('getUserSpend', () => {
  it('returns month-to-date spend rounded to 4dp with the applicable cap', async () => {
    stubSpend({ user: 1.23456789 });
    const free = await getUserSpend('user-1', false);
    const premium = await getUserSpend('user-1', true);

    expect(free.monthToDateUsd).toBe(1.2346);
    expect(premium.cap).toBeGreaterThan(free.cap);
  });

  it('returns a null figure (never a fake zero) when the sum fails', async () => {
    stubSpend({ user: new Error('down') });
    const r = await getUserSpend('user-1');
    expect(r.monthToDateUsd).toBeNull();
    expect(r.cap).toBeGreaterThan(0);
  });
});
