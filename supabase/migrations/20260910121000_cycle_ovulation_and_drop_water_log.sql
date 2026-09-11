-- 1. Cycle log: allow the 'ovulation' self-report the form offers.
alter table public.cycle_log drop constraint if exists cycle_log_event_type_check;
alter table public.cycle_log add constraint cycle_log_event_type_check
  check (event_type = any (array['period_start','period_end','symptom','ovulation']));

-- 2. water_log was a second, never-used write path for water (0 rows; the
--    habits form already records water_glasses per day). Removed with its
--    route so there is one source of truth. Applied live 2026-09-10.
drop table if exists public.water_log cascade;
