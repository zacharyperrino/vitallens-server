-- Migration: drop_dead_environmental_log
-- environmental_log was an accidental twin of environment_logs (the live
-- table). It had zero rows and no code references beyond the export list.
drop table if exists public.environmental_log;
