// ─── Server config ────────────────────────────────────────────
// Single source of truth for server-to-self ("internal") API calls —
// e.g. the health copilot invoking /api/correlate/run on this same server.
//
// Defaults to this process's own port. In production, set INTERNAL_API_BASE
// if the API is reachable at a different host/port than localhost:PORT
// (e.g. behind a gateway, or when PORT differs from 3001).
//
// dotenv is loaded here so PORT / INTERNAL_API_BASE are resolved from .env
// before the constant is computed.
import dotenv from 'dotenv';
dotenv.config();

export const INTERNAL_API_BASE =
  process.env.INTERNAL_API_BASE || `http://localhost:${process.env.PORT || 3001}`;
