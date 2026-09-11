import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchWithRetry } from '../../services/ai-fetch.js';

const fetchMock = vi.fn();
const res = (status) => ({ status, ok: status < 400 });
// Small real delays keep the suite fast while still exercising the sleep path.
const fast = { retries: 3, baseDelay: 4, maxTotalMs: 2000, routeName: 'test' };

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(Math, 'random').mockReturnValue(0.5); // deterministic jitter
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('fetchWithRetry', () => {
  it('returns a successful response without retrying', async () => {
    const ok = res(200);
    fetchMock.mockResolvedValue(ok);
    await expect(fetchWithRetry('https://ai.example/v1', { method: 'POST' }, fast)).resolves.toBe(
      ok,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('https://ai.example/v1', { method: 'POST' });
  });

  it('retries a 503 and returns the eventual success', async () => {
    const ok = res(200);
    fetchMock.mockResolvedValueOnce(res(503)).mockResolvedValueOnce(res(503)).mockResolvedValue(ok);
    await expect(fetchWithRetry('u', {}, fast)).resolves.toBe(ok);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(console.warn).toHaveBeenCalledTimes(2);
  });

  it('retries 429 / 5xx but returns a non-retryable 400 immediately', async () => {
    const bad = res(400);
    fetchMock.mockResolvedValue(bad);
    await expect(fetchWithRetry('u', {}, fast)).resolves.toBe(bad);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(res(429)).mockResolvedValue(res(200));
    expect((await fetchWithRetry('u', {}, fast)).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries a thrown network error', async () => {
    const ok = res(200);
    fetchMock.mockRejectedValueOnce(new Error('ECONNRESET')).mockResolvedValue(ok);
    await expect(fetchWithRetry('u', {}, fast)).resolves.toBe(ok);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns the last retryable response once retries are exhausted', async () => {
    fetchMock.mockResolvedValue(res(503));
    const r = await fetchWithRetry('u', {}, fast);
    expect(r.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(fast.retries + 1);
  });

  it('throws a user-safe message when the final attempt throws', async () => {
    fetchMock.mockRejectedValue(new Error('socket hang up'));
    await expect(fetchWithRetry('u', {}, { ...fast, retries: 1 })).rejects.toThrow(
      /temporarily unavailable/,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives up within maxTotalMs even when retries remain', async () => {
    fetchMock.mockResolvedValue(res(503));
    const started = Date.now();
    // With random=0.5 the back-off is 20ms, 40ms, then capped by the remaining budget.
    await expect(
      fetchWithRetry('u', {}, { retries: 50, baseDelay: 40, maxTotalMs: 120, routeName: 'test' }),
    ).rejects.toThrow(/temporarily unavailable/);
    const elapsed = Date.now() - started;

    expect(elapsed).toBeLessThan(1000);
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(5); // nowhere near 51
    expect(console.error).toHaveBeenCalledWith(
      expect.stringMatching(/Gave up after \d+ms/),
      'HTTP 503',
    );
  });
});
