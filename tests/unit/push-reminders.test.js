import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { db, webpush } = vi.hoisted(() => ({
  db: { rows: [], updates: [] },
  webpush: { setVapidDetails: vi.fn(), sendNotification: vi.fn() },
}));

vi.mock('../../db/supabase.js', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ not: async () => ({ data: db.rows, error: null }) }) }),
      update: (patch) => ({
        eq: async (_col, id) => { db.updates.push({ id, patch }); return { error: null }; },
      }),
    }),
  },
}));
vi.mock('web-push', () => ({ default: webpush }));

const VAPID = { VAPID_EMAIL: 'mailto:test@example.com', VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv' };
Object.assign(process.env, VAPID);
const { sendDueReminders, startPushReminders } = await import('../../services/push-reminders.js');

const SUB = { endpoint: 'https://push.example/abc', keys: { p256dh: 'k', auth: 'a' } };
// America/Los_Angeles is UTC-7 in September: 03:30Z on the 11th is 20:30 on the 10th in LA.
const LA_2030 = new Date('2026-09-11T03:30:00Z');
const LA_0930 = new Date('2026-09-10T16:30:00Z');
const user = (over = {}) => ({ id: 'user-aaaa-bbbb', push_subscription: SUB, timezone: 'America/Los_Angeles', last_push_at: null, ...over });

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  db.rows = [];
  db.updates = [];
  webpush.sendNotification.mockResolvedValue({ statusCode: 201 });
  Object.assign(process.env, VAPID);
});
afterEach(() => vi.restoreAllMocks());

describe('sendDueReminders', () => {
  it('sends to a user at local 20:xx with no prior push, then stamps last_push_at', async () => {
    db.rows = [user()];
    const stats = await sendDueReminders(LA_2030);

    expect(stats).toMatchObject({ checked: 1, sent: 1, disabled: 0, failed: 0 });
    expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
    const [sub, payload] = webpush.sendNotification.mock.calls[0];
    expect(sub).toEqual(SUB);
    expect(JSON.parse(payload)).toEqual({
      title: 'VitalLens',
      body: 'Evening check-in — a minute to log today keeps your patterns honest.',
      url: '/#/health-input',
    });
    expect(db.updates).toEqual([{ id: 'user-aaaa-bbbb', patch: { last_push_at: LA_2030.toISOString() } }]);
  });

  it('skips a user whose local hour is 9', async () => {
    db.rows = [user()];
    const stats = await sendDueReminders(LA_0930);

    expect(stats).toMatchObject({ checked: 1, sent: 0 });
    expect(webpush.sendNotification).not.toHaveBeenCalled();
    expect(db.updates).toEqual([]);
  });

  it('skips a user already pushed today (local date), sends if the last push was an earlier local day', async () => {
    db.rows = [user({ last_push_at: '2026-09-11T03:05:00Z' })]; // 20:05 LA, same local day
    expect((await sendDueReminders(LA_2030)).sent).toBe(0);
    expect(webpush.sendNotification).not.toHaveBeenCalled();

    db.rows = [user({ last_push_at: '2026-09-10T03:30:00Z' })]; // 20:30 LA on the 9th
    expect((await sendDueReminders(LA_2030)).sent).toBe(1);
  });

  it('disables push for a user whose subscription is gone (410)', async () => {
    db.rows = [user()];
    webpush.sendNotification.mockRejectedValue(Object.assign(new Error('Gone'), { statusCode: 410 }));
    const stats = await sendDueReminders(LA_2030);

    expect(stats).toMatchObject({ sent: 0, disabled: 1, failed: 0 });
    expect(db.updates).toEqual([{ id: 'user-aaaa-bbbb', patch: { push_enabled: false, push_subscription: null } }]);
  });

  it('warns (id prefix only) and continues on other send errors', async () => {
    db.rows = [user({ id: 'user-1111-2222' }), user({ id: 'user-3333-4444' })];
    webpush.sendNotification
      .mockRejectedValueOnce(Object.assign(new Error('boom'), { statusCode: 500 }))
      .mockResolvedValueOnce({ statusCode: 201 });
    const stats = await sendDueReminders(LA_2030);

    expect(stats).toMatchObject({ sent: 1, failed: 1, disabled: 0 });
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('user-111'), expect.anything());
    expect(console.warn.mock.calls[0][0]).not.toContain('user-1111-2222');
    expect(db.updates).toEqual([{ id: 'user-3333-4444', patch: { last_push_at: LA_2030.toISOString() } }]);
  });

  it('falls back to UTC for a missing or invalid timezone', async () => {
    const utc2015 = new Date('2026-09-10T20:15:00Z');
    db.rows = [user({ id: 'u-none', timezone: null }), user({ id: 'u-bad', timezone: 'Mars/Olympus' })];
    expect((await sendDueReminders(utc2015)).sent).toBe(2);
  });
});

describe('startPushReminders', () => {
  it('returns null and schedules nothing when VAPID vars are unset', () => {
    delete process.env.VAPID_PRIVATE_KEY;
    expect(startPushReminders()).toBeNull();
  });

  it('returns an unref\'d interval when configured', () => {
    const timer = startPushReminders({ intervalMs: 60_000 });
    expect(timer).toBeTruthy();
    expect(typeof timer.unref).toBe('function');
    clearInterval(timer);
  });
});
