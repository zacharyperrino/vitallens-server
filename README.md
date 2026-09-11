# VitalLens API

Express backend for [VitalLens](../README.md), a personal wellness journal. Single process, ESM, Node 20+.

## Run

```bash
cp .env.example .env     # fill in Supabase, OpenAI, Anthropic keys
npm install
npm start                # http://localhost:3001
```

`GET /api/health` — liveness · `GET /api/ready` — readiness (probes the database).

## Request pipeline (`server.js`)

1. `env.js` loads `.env` before any other module evaluates
2. Sentry (`instrument.js`) with a `beforeSend` that strips request bodies, headers, and cookies
3. CORS allow-list (`FRONTEND_URL`), Helmet, JSON limit, `trust proxy`
4. Production 5xx sanitizer (never leaks internals)
5. Global rate limit → public routes (`/api/health`, Stripe webhook, Oura OAuth callback)
6. `requireAuth` — JWT verified locally against Supabase JWKS (`jose`); remote fallback only for legacy tokens; 503 (not a hang) if auth is unreachable
7. **Ownership guard** — any `userId`/`user_id` in query or body must equal the token's `sub`
8. Feature routers; AI routes additionally pass `checkAndIncrementUsage` (usage gate → spend guard) and log every call via `trackCost`
9. Sentry error handler, then the responding error handler

## Layout

```
routes/       one router per feature (36)
services/     spend-guard, usage-gates, cost-tracker, context-builder (cached snapshot),
              rag, embeddings, eventIngestion, ai-fetch (retry w/ time budget), ai-limiters,
              ai-validators (Zod), prompts (canonical wellness system prompt), oauth-state
middleware/   requireAuth / requireSelf
db/           shared service-role Supabase client
utils/        sendError (Sentry capture + response)
supabase/     schema-baseline.sql (full schema) + migrations/ (history)
tests/        unit/ (no network) · security.test.js (integration, needs .env.test)
```

## Tests

```bash
npm test               # unit — no env, no network
npm run test:integration   # 20 auth / ownership / consent tests against a real project (.env.test)
npm run lint
```

## Cost control

Every model call is gated by `checkAndIncrementUsage(userId, feature)`:

1. `checkSpendGuard` sums the calendar month from `api_cost_log` via the `sum_ai_spend` Postgres function (never a row scan). Global cap → deny, **fails closed** on error. Per-user cap → deny.
2. Premium (active subscription / unexpired trial) bypasses counts, never the spend guard.
3. Free-tier counters increment through the atomic `increment_usage` RPC.

Caps: `MAX_USER_MONTHLY_USD` (5) · `MAX_USER_MONTHLY_USD_PREMIUM` (50) · `MAX_GLOBAL_MONTHLY_USD` (250).
