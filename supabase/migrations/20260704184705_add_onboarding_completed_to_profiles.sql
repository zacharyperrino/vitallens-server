-- Migration: 20260704184705_add_onboarding_completed_to_profiles

alter table public.profiles add column if not exists onboarding_completed boolean not null default false;
