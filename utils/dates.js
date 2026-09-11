// ─── Date helpers ─────────────────────────────────────────────
// One place for YYYY-MM-DD calendar strings and day arithmetic, so routes
// stop hand-rolling `toISOString().split('T')[0]` and `n * 86400000`.
//
// `tz` is 'utc' (default) or 'local'. 'local' shifts by the process's own
// UTC offset so the string is the server's local calendar date — the
// convention the `date` columns (daily_nutrition, sleep_log) are written with.

export const MS_PER_DAY = 86_400_000;

/** YYYY-MM-DD (UTC) for any Date, epoch ms, or ISO string. */
export function isoDate(d) {
  return new Date(d).toISOString().split('T')[0];
}

/** Date object n days before now. */
export function daysAgo(n) {
  return new Date(Date.now() - n * MS_PER_DAY);
}

/** YYYY-MM-DD for n days ago. See `tz` above. */
export function daysAgoISO(n, tz = 'utc') {
  const offsetMs = tz === 'local' ? new Date().getTimezoneOffset() * 60_000 : 0;
  return isoDate(Date.now() - n * MS_PER_DAY - offsetMs);
}

/** Today's YYYY-MM-DD. See `tz` above. */
export function todayISO(tz = 'utc') {
  return daysAgoISO(0, tz);
}
