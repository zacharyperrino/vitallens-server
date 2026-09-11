# VitalLens API

Express backend for [VitalLens](../README.md), a personal wellness journal. Single process, ESM, Node 20+.

## Run

```bash
cp .env.example .env     # fill in Supabase, OpenAI, Anthropic keys
npm install
npm start                # = node --import ./instrument.js server.js → http://localhost:3001
```

`Procfile` and `railway.json` use the same start command. The `--import` preload is what lets Sentry hook Express under ESM; importing `instrument.js` from `server.js` does not instrument it.

`GET /api/health` — liveness · `GET /api/ready` — readiness (one-row `select` on `profiles`, no count).

## Request pipeline (`server.js`)

1. `instrument.js` (preloaded via `--import`) imports `env.js` first so `.env` is loaded before any other module evaluates, then initialises Sentry with a `beforeSend` that strips request bodies, query strings, cookies, and auth headers
2. `server.js` evaluates with env + Sentry already in place, so Express is instrumented
3. CORS allow-list (`FRONTEND_URL`), Helmet, JSON limit, `trust proxy`
4. Production 5xx sanitizer (never leaks internals)
5. Global rate limit (60/min per IP; the Stripe webhook is exempt — it authenticates by signature) → public routes (`/api/health`, `/api/ready`, Stripe webhook, Oura OAuth callback)
6. `requireAuth` — JWT verified locally against Supabase JWKS (`jose`); remote fallback only for legacy tokens; 503 (not a hang) if auth is unreachable
7. **Ownership guard** — any `userId`/`user_id` in query or body must equal the token's `sub`
8. Feature routers; AI routes additionally pass `checkAndIncrementUsage` (usage gate → spend guard) and log every call via `trackCost`
9. Sentry error handler, then the responding error handler
10. Process level: `unhandledRejection` → Sentry, keep serving; `uncaughtException` → Sentry, flush, exit; `SIGTERM`/`SIGINT` drain with a 60 s grace

## Layout

```
routes/       one router per feature (35)
services/     spend-guard, usage-gates, cost-tracker, context-builder (cached snapshot),
              rag, embeddings, eventIngestion, ai-fetch (per-attempt timeout + retry inside a 45 s budget), ai-limiters,
              ai-validators (Zod), prompts (canonical wellness system prompt), oauth-state
middleware/   requireAuth / requireSelf
db/           shared service-role Supabase client (15 s request timeout)
utils/        sendError (Sentry capture + response), dates (day strings in 'utc' | 'local' | an IANA zone)
supabase/     schema-baseline.sql (full schema) + seed/ (reference rows) + migrations/ (history)
tests/        unit/ (no network) · security.test.js (integration, needs .env.test)
```

## Tests

```bash
npm test               # 74 unit tests — no env, no network
npm run test:integration   # 20 auth / ownership / consent tests against a real project (.env.test)
npm run lint
```

## Cost control

Every model call is gated by `checkAndIncrementUsage(userId, feature)`:

1. `checkSpendGuard` sums the calendar month from `api_cost_log` via the `sum_ai_spend` Postgres function (never a row scan). Global cap → deny, **fails closed** on error. Per-user cap → deny.
2. Premium (active subscription / unexpired trial) bypasses counts, never the spend guard.
3. Free-tier counters increment through the atomic `increment_usage` RPC.

Caps: `MAX_USER_MONTHLY_USD` (5) · `MAX_USER_MONTHLY_USD_PREMIUM` (50) · `MAX_GLOBAL_MONTHLY_USD` (250). An explicit `0` is honoured as a kill switch (parsed with `envNumber`, not `Number(x) || default`). Routes validate the request *before* consuming a daily gate (`custom-correlation`, `biomarker-scan`), so a 400 never burns quota.

## Environment

`.env.example` is the template. Beyond the Supabase / OpenAI / Anthropic keys:

| Variable | Purpose |
|---|---|
| `FRONTEND_URL` | Comma-separated CORS allow-list |
| `API_PUBLIC_URL` | Public origin of this API; builds OAuth redirect URIs |
| `OAUTH_STATE_SECRET` | HMAC secret for signed OAuth `state`; falls back to a hash of the service-role key |
| `MAX_*_MONTHLY_USD` | Spend caps above; `0` stops spend |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_EMAIL` | Web push (`/api/push/*`) and the 8 pm local-time reminder sender (`services/push-reminders.js`, once per user per day); optional — unset disables both |
| `OURA_CLIENT_ID`, `OURA_CLIENT_SECRET` | Wearable sync; optional |
| `SENTRY_DSN` | Error capture (health data stripped in `beforeSend`) |
| `ENABLE_EXPERIMENTAL_ROUTES` | `true` mounts practitioner sharing + genomics; default off |

`.env.test` (git-ignored, placeholders only) feeds the integration suite.

## Schema

`supabase/schema-baseline.sql` reproduces the whole database on an empty project (39 tables, RLS on every one, policies, functions, sequences `OWNED BY` their columns). Rebuild = baseline **+** `supabase/seed/additive_classifications.sql` (28 reference rows; without it every additive scores `unknown`). `supabase/migrations/` is the applied history — see its `README.md`.
