-- Migration: 20260704190008_add_goal_weight_kg_to_health_profile

alter table public.health_profile add column if not exists goal_weight_kg numeric;
