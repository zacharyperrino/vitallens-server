import { describe, it, expect, vi, beforeEach } from 'vitest';

const { rpc, maybeSingle, checkSpendGuard } = vi.hoisted(() => ({
  rpc: vi.fn(),
  maybeSingle: vi.fn(),
  checkSpendGuard: vi.fn(),
}));

vi.mock('../../db/supabase.js', () => {
  // Minimal chainable query builder: from().select().eq()...maybeSingle()
  const chain = { select: () => chain, eq: () => chain, maybeSingle };
  return { supabase: { rpc, from: () => chain } };
});
vi.mock('../../services/spend-guard.js', () => ({ checkSpendGuard }));

import {
  FREE_LIMITS,
  isPremium,
  checkAndIncrementUsage,
  getUsageSummary,
} from '../../services/usage-gates.js';

const profile = (row) => maybeSingle.mockResolvedValue({ data: row, error: null });
const inAnHour = () => new Date(Date.now() + 3600_000).toISOString();
const anHourAgo = () => new Date(Date.now() - 3600_000).toISOString();

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  checkSpendGuard.mockResolvedValue({ allowed: true });
  profile({ subscription_status: 'free', trial_end: null });
});

describe('isPremium', () => {
  it('is true for an active subscription', async () => {
    profile({ subscription_status: 'active' });
    expect(await isPremium('u')).toBe(true);
  });

  it('is true for an unexpired trial and false for an expired one', async () => {
    profile({ subscription_status: 'trialing', trial_end: inAnHour() });
    expect(await isPremium('u')).toBe(true);
    profile({ subscription_status: 'trialing', trial_end: anHourAgo() });
    expect(await isPremium('u')).toBe(false);
  });

  it('is false for free users, missing profiles, and lookup failures', async () => {
    profile({ subscription_status: 'free' });
    expect(await isPremium('u')).toBe(false);
    profile(null);
    expect(await isPremium('u')).toBe(false);
    maybeSingle.mockRejectedValue(new Error('db down'));
    expect(await isPremium('u')).toBe(false);
  });
});

describe('checkAndIncrementUsage', () => {
  it('lets premium users bypass the count gate without touching the counter', async () => {
    profile({ subscription_status: 'active' });
    const r = await checkAndIncrementUsage('u', 'ai_chat');

    expect(r).toEqual({ allowed: true, premium: true });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('still applies the spend guard to premium users', async () => {
    profile({ subscription_status: 'active' });
    checkSpendGuard.mockResolvedValue({ allowed: false, message: 'cap reached' });
    const r = await checkAndIncrementUsage('u', 'ai_chat');

    expect(r).toEqual({
      allowed: false,
      premium: true,
      message: 'cap reached',
      spendCapReached: true,
    });
    expect(checkSpendGuard).toHaveBeenCalledWith('u', true);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('applies the spend guard before counting for free users too', async () => {
    checkSpendGuard.mockResolvedValue({ allowed: false, message: 'cap reached' });
    const r = await checkAndIncrementUsage('u', 'ai_chat');

    expect(r.allowed).toBe(false);
    expect(r.spendCapReached).toBe(true);
    expect(checkSpendGuard).toHaveBeenCalledWith('u', false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('increments atomically and reports remaining quota for a free user', async () => {
    rpc.mockResolvedValue({ data: [{ allowed: true, current_count: 2 }], error: null });
    const r = await checkAndIncrementUsage('u', 'food_vision_scan');

    expect(r).toEqual({ allowed: true, premium: false, limit: 5, used: 2, remaining: 3 });
    expect(rpc).toHaveBeenCalledTimes(1);
    const [fn, args] = rpc.mock.calls[0];
    expect(fn).toBe('increment_usage');
    expect(args).toMatchObject({
      p_user: 'u',
      p_feature: 'food_vision_scan',
      p_window_type: 'day',
      p_limit: 5,
    });
    expect(() => new Date(args.p_window_start).toISOString()).not.toThrow();
  });

  it('denies with upgradeRequired when the RPC reports the limit is hit', async () => {
    rpc.mockResolvedValue({ data: [{ allowed: false, current_count: 5 }], error: null });
    const r = await checkAndIncrementUsage('u', 'food_vision_scan');

    expect(r.allowed).toBe(false);
    expect(r.upgradeRequired).toBe(true);
    expect(r.used).toBe(5);
    expect(r.limit).toBe(5);
    expect(r.message).toContain(FREE_LIMITS.food_vision_scan.label);
  });

  it('accepts a single-object RPC result as well as a one-row array', async () => {
    rpc.mockResolvedValue({ data: { allowed: true, current_count: 1 }, error: null });
    const r = await checkAndIncrementUsage('u', 'lab_upload');
    expect(r).toMatchObject({ allowed: true, used: 1, remaining: 1 });
  });

  it('allows the request but flags degraded when the counter RPC errors', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'function does not exist' } });
    const r = await checkAndIncrementUsage('u', 'ai_chat');

    expect(r).toEqual({ allowed: true, premium: false, degraded: true });
    expect(console.error).toHaveBeenCalled();
  });

  it('allows unknown features without counting them', async () => {
    const r = await checkAndIncrementUsage('u', 'not_a_feature');
    expect(r).toEqual({ allowed: true });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('getUsageSummary', () => {
  it('reports unlimited for every feature when premium', async () => {
    profile({ subscription_status: 'active' });
    const s = await getUsageSummary('u');
    expect(s.premium).toBe(true);
    expect(Object.keys(s.limits)).toEqual(Object.keys(FREE_LIMITS));
    for (const v of Object.values(s.limits)) expect(v.limit).toBe('unlimited');
  });

  it('reports per-feature usage and remaining quota for free users', async () => {
    maybeSingle.mockResolvedValue({ data: { count: 4 }, error: null });
    // The first maybeSingle call is the profile lookup.
    maybeSingle.mockResolvedValueOnce({ data: { subscription_status: 'free' }, error: null });
    const s = await getUsageSummary('u');

    expect(s.premium).toBe(false);
    expect(s.limits.food_vision_scan).toEqual({
      limit: 5,
      used: 4,
      remaining: 1,
      window: 'day',
      label: FREE_LIMITS.food_vision_scan.label,
    });
    expect(s.limits.weekly_report.remaining).toBe(0); // 4 used of 1 -> clamped, never negative
  });
});
