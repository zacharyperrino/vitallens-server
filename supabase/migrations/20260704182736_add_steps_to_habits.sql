-- Migration: 20260704182736_add_steps_to_habits

alter table public.habits add column if not exists steps integer;
