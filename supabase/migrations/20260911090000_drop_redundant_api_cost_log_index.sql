-- (user_id, logged_at) is covered by the pre-existing (user_id, logged_at DESC)
-- index — a btree scans either direction. Advisor 0005 flagged both as unused.
-- Applied live 2026-09-11.
drop index if exists public.api_cost_log_user_logged_idx;
