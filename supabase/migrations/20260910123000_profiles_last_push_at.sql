-- When the evening web-push reminder last went to this user (services/push-reminders.js sends at most once per local day). Applied live 2026-09-10.
alter table public.profiles add column if not exists last_push_at timestamptz;
