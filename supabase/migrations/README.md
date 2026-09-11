# Database schema

- `../schema-baseline.sql` — the FULL schema (extensions, tables, constraints,
  indexes, RLS, policies, functions) captured from the live project on
  2026-09-10. Apply it to an empty Supabase project to reproduce the database.
- `./*.sql` — incremental migrations applied since 2026-07-04, in order.
  The baseline already includes their effects; they are kept as history.

To rebuild from scratch: run `schema-baseline.sql`, then nothing else is needed.
To evolve the schema: add a new timestamped file here and apply it via the
Supabase SQL editor or CLI, then refresh the baseline.
