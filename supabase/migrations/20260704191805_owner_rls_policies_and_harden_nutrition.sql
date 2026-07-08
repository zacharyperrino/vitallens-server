-- Migration: owner_rls_policies_and_harden_nutrition
-- Owner-only RLS policies for tables that had RLS enabled but no policy
-- (deny-all). Server keeps using the service-role key, which bypasses RLS;
-- these policies close the anon/authenticated gap and guarantee no
-- cross-user access. drop-if-exists makes this re-runnable.

-- uuid user_id tables
drop policy if exists api_cost_log_owner on public.api_cost_log;
create policy api_cost_log_owner on public.api_cost_log for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists food_corrections_owner on public.food_corrections;
create policy food_corrections_owner on public.food_corrections for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists meal_memory_owner on public.meal_memory;
create policy meal_memory_owner on public.meal_memory for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists portion_corrections_owner on public.portion_corrections;
create policy portion_corrections_owner on public.portion_corrections for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- text user_id tables (uuid stored as text → cast auth.uid())
drop policy if exists biomarker_scans_owner on public.biomarker_scans;
create policy biomarker_scans_owner on public.biomarker_scans for all
  using (auth.uid()::text = user_id) with check (auth.uid()::text = user_id);

drop policy if exists environment_logs_owner on public.environment_logs;
create policy environment_logs_owner on public.environment_logs for all
  using (auth.uid()::text = user_id) with check (auth.uid()::text = user_id);

drop policy if exists health_correlations_owner on public.health_correlations;
create policy health_correlations_owner on public.health_correlations for all
  using (auth.uid()::text = user_id) with check (auth.uid()::text = user_id);

drop policy if exists health_predictions_owner on public.health_predictions;
create policy health_predictions_owner on public.health_predictions for all
  using (auth.uid()::text = user_id) with check (auth.uid()::text = user_id);

drop policy if exists health_profile_owner on public.health_profile;
create policy health_profile_owner on public.health_profile for all
  using (auth.uid()::text = user_id) with check (auth.uid()::text = user_id);

drop policy if exists supplement_logs_owner on public.supplement_logs;
create policy supplement_logs_owner on public.supplement_logs for all
  using (auth.uid()::text = user_id) with check (auth.uid()::text = user_id);

drop policy if exists tcm_profile_owner on public.tcm_profile;
create policy tcm_profile_owner on public.tcm_profile for all
  using (auth.uid()::text = user_id) with check (auth.uid()::text = user_id);

drop policy if exists user_goals_owner on public.user_goals;
create policy user_goals_owner on public.user_goals for all
  using (auth.uid()::text = user_id) with check (auth.uid()::text = user_id);

drop policy if exists weekly_reports_owner on public.weekly_reports;
create policy weekly_reports_owner on public.weekly_reports for all
  using (auth.uid()::text = user_id) with check (auth.uid()::text = user_id);

-- Harden increment_daily_nutrition:
--  • drop the SECURITY DEFINER (text) overload — it bypassed RLS and let any
--    authenticated user write another user's nutrition (IDOR).
--  • keep the uuid SECURITY INVOKER version and pin its search_path.
drop function if exists public.increment_daily_nutrition(text, date, numeric, numeric, numeric, numeric, numeric);
alter function public.increment_daily_nutrition(uuid, date, numeric, numeric, numeric, numeric, numeric) set search_path = public;
