// ─── AI Fetch with Retry ──────────────────────────────────────
// Exponential backoff with jitter, bounded by a TOTAL time budget so a
// flaky provider can never hold a request for minutes. `options.timeoutMs`
// (default 30s) bounds each individual attempt.

const RETRYABLE = new Set([429, 500, 502, 503, 504]);

export async function fetchWithRetry(url, options = {}, {
  retries = 3, baseDelay = 1000, maxTotalMs = 45_000, routeName = 'AI',
} = {}) {
  const startedAt = Date.now();
  // Each attempt gets a fresh timeout so one slow attempt can't poison the
  // retries. A caller-supplied `signal` (overall deadline) is still honoured.
  const { signal: callerSignal, timeoutMs = 30_000, ...init } = options;
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const elapsed = Date.now() - startedAt;
    if (elapsed >= maxTotalMs) break;

    const attemptSignal = AbortSignal.timeout(timeoutMs);
    const signal = callerSignal ? AbortSignal.any([callerSignal, attemptSignal]) : attemptSignal;

    try {
      const res = await fetch(url, { ...init, signal });
      if (!RETRYABLE.has(res.status) || attempt === retries) return res;
      lastError = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastError = err;
      if (attempt === retries || callerSignal?.aborted) break;
    }

    // Exhaustion is decided by the remaining budget, not the sampled delay —
    // full jitter can legitimately draw 0ms, which is an immediate retry.
    const remainingBudget = maxTotalMs - (Date.now() - startedAt);
    if (remainingBudget <= 0) break;
    const ceiling = baseDelay * Math.pow(2, attempt);
    const delay = Math.min(Math.floor(Math.random() * ceiling), remainingBudget);
    console.warn(`[${routeName}] ${lastError?.message} — retrying in ${delay}ms (attempt ${attempt + 1}/${retries})`);
    await new Promise(r => setTimeout(r, delay));
  }

  console.error(`[${routeName}] Gave up after ${Date.now() - startedAt}ms:`, lastError?.message);
  throw new Error('The analysis service is temporarily unavailable — your data is safe. Please try again in a moment.');
}
