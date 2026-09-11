// ─── AI Fetch with Retry ──────────────────────────────────────
// Exponential backoff with jitter, bounded by a TOTAL time budget so a
// flaky provider can never hold a request for minutes.

const RETRYABLE = new Set([429, 500, 502, 503, 504]);

export async function fetchWithRetry(url, options, {
  retries = 3, baseDelay = 1000, maxTotalMs = 45_000, routeName = 'AI',
} = {}) {
  const startedAt = Date.now();
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const elapsed = Date.now() - startedAt;
    if (elapsed >= maxTotalMs) break;

    try {
      const res = await fetch(url, options);
      if (!RETRYABLE.has(res.status) || attempt === retries) return res;
      lastError = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastError = err;
      if (attempt === retries) break;
    }

    // Full jitter: random delay in [0, base * 2^attempt], capped by the budget.
    const ceiling = baseDelay * Math.pow(2, attempt);
    const delay = Math.min(Math.floor(Math.random() * ceiling), maxTotalMs - (Date.now() - startedAt));
    if (delay <= 0) break;
    console.warn(`[${routeName}] ${lastError?.message} — retrying in ${delay}ms (attempt ${attempt + 1}/${retries})`);
    await new Promise(r => setTimeout(r, delay));
  }

  console.error(`[${routeName}] Gave up after ${Date.now() - startedAt}ms:`, lastError?.message);
  throw new Error('The analysis service is temporarily unavailable — your data is safe. Please try again in a moment.');
}
