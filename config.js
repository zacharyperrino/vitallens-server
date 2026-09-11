// ─── Server config ────────────────────────────────────────────
// Single source of truth for server-to-self ("internal") API calls —
// e.g. the health copilot invoking /api/correlate/run on this same server.
//
// Defaults to this process's own port. In production, set INTERNAL_API_BASE
// if the API is reachable at a different host/port than localhost:PORT
// (e.g. behind a gateway, or when PORT differs from 3001).
//
// .env is loaded once by env.js (the first import of every entrypoint), so
// PORT / INTERNAL_API_BASE are already resolved when this evaluates.

export const INTERNAL_API_BASE =
  process.env.INTERNAL_API_BASE || `http://localhost:${process.env.PORT || 3001}`;
