// ─── Date helpers ─────────────────────────────────────────────
// One place for YYYY-MM-DD calendar strings and day arithmetic, so routes
// stop hand-rolling `toISOString().split('T')[0]` and `n * 86400000`.
//
// `tz` is 'utc' (default), 'local', or an IANA zone name. 'local' shifts by
// the process's own UTC offset so the string is the server's local calendar
// date — the convention the `date` columns (daily_nutrition, sleep_log) are
// written with. An IANA name (profiles.timezone) gives the user's calendar
// date; an unrecognised name falls back to 'local'.

export const MS_PER_DAY = 86_400_000;

/** YYYY-MM-DD (UTC) for any Date, epoch ms, or ISO string. */
export function isoDate(d) {
  return new Date(d).toISOString().split('T')[0];
}

/** Date object n days before now. */
export function daysAgo(n) {
  return new Date(Date.now() - n * MS_PER_DAY);
}

/** YYYY-MM-DD in an IANA zone, or null when the zone name is invalid. */
function isoDateInZone(ms, timeZone) {
  try {
    // en-CA renders as YYYY-MM-DD.
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);
  } catch {
    return null;
  }
}

/** YYYY-MM-DD for n days ago. See `tz` above. */
export function daysAgoISO(n, tz = 'utc') {
  const ms = Date.now() - n * MS_PER_DAY;
  if (tz !== 'utc' && tz !== 'local') {
    const inZone = isoDateInZone(ms, tz);
    if (inZone) return inZone;
  }
  const offsetMs = tz === 'utc' ? 0 : new Date().getTimezoneOffset() * 60_000;
  return isoDate(ms - offsetMs);
}

/** Today's YYYY-MM-DD. See `tz` above. */
export function todayISO(tz = 'utc') {
  return daysAgoISO(0, tz);
}
