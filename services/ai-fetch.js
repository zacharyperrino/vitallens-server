// ─── AI Fetch with Retry ──────────────────────────────────────
// Wraps fetch calls to Claude/GPT with exponential backoff retry.
// Returns a graceful error message on final failure instead of
// surfacing raw API errors to users.

/**
 * Fetch with exponential backoff retry.
 * Retries on 429, 500, 502, 503, 504.
 * Throws on final failure with a user-safe message.
 *
 * @param {string} url
 * @param {RequestInit} options
 * @param {object} config
 * @param {number} config.retries - number of retries (default 3)
 * @param {number} config.baseDelay - base delay in ms (default 1000)
 * @param {string} config.routeName - for logging
 * @returns {Promise<Response>}
 */
export async function fetchWithRetry(url, options, { retries = 3, baseDelay = 1000, routeName = 'AI' } = {}) {
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options);

      // Retryable status codes
      if ([429, 500, 502, 503, 504].includes(res.status) && attempt < retries) {
        const delay = baseDelay * Math.pow(2, attempt);
        console.warn(`[${routeName}] HTTP ${res.status} — retrying in ${delay}ms (attempt ${attempt + 1}/${retries})`);
        await sleep(delay);
        continue;
      }

      return res;
    } catch (err) {
      lastError = err;

      // Timeout or network error — retry
      if (attempt < retries) {
        const delay = baseDelay * Math.pow(2, attempt);
        console.warn(`[${routeName}] Network error — retrying in ${delay}ms (attempt ${attempt + 1}/${retries}): ${err.message}`);
        await sleep(delay);
        continue;
      }
    }
  }

  // All retries exhausted
  console.error(`[${routeName}] All ${retries} retries failed:`, lastError?.message);
  throw new Error('Pattern analysis is temporarily unavailable — your data is safe. Please try again in a moment.');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}