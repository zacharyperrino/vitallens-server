-- Migration: optimize_session_rls_policies
-- Perf: wrap auth.uid() in a scalar subquery so it's evaluated once per query
-- (initplan) instead of once per row. Semantically identical.

-- ── 13 owner policies ──
-- uuid user_id
drop policy if exists api_cost_log_owner on public.api_cost_log;
create policy api_cost_log_owner on public.api_cost_log for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists food_corrections_owner on public.food_corrections;
create policy food_corrections_owner on public.food_corrections for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists meal_memory_owner on public.meal_memory;
create policy meal_memory_owner on public.meal_memory for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists portion_corrections_owner on public.portion_corrections;
create policy portion_corrections_owner on public.portion_corrections for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
-- text user_id
drop policy if exists biomarker_scans_owner on public.biomarker_scans;
create policy biomarker_scans_owner on public.biomarker_scans for all
  using ((select auth.uid())::text = user_id) with check ((select auth.uid())::text = user_id);
drop policy if exists environment_logs_owner on public.environment_logs;
create policy environment_logs_owner on public.environment_logs for all
  using ((select auth.uid())::text = user_id) with check ((select auth.uid())::text = user_id);
drop policy if exists health_correlations_owner on public.health_correlations;
create policy health_correlations_owner on public.health_correlations for all
  using ((select auth.uid())::text = user_id) with check ((select auth.uid())::text = user_id);
drop policy if exists health_predictions_owner on public.health_predictions;
create policy health_predictions_owner on public.health_predictions for all
  using ((select auth.uid())::text = user_id) with check ((select auth.uid())::text = user_id);
drop policy if exists health_profile_owner on public.health_profile;
create policy health_profile_owner on public.health_profile for all
  using ((select auth.uid())::text = user_id) with check ((select auth.uid())::text = user_id);
drop policy if exists supplement_logs_owner on public.supplement_logs;
create policy supplement_logs_owner on public.supplement_logs for all
  using ((select auth.uid())::text = user_id) with check ((select auth.uid())::text = user_id);
drop policy if exists tcm_profile_owner on public.tcm_profile;
create policy tcm_profile_owner on public.tcm_profile for all
  using ((select auth.uid())::text = user_id) with check ((select auth.uid())::text = user_id);
drop policy if exists user_goals_owner on public.user_goals;
create policy user_goals_owner on public.user_goals for all
  using ((select auth.uid())::text = user_id) with check ((select auth.uid())::text = user_id);
drop policy if exists weekly_reports_owner on public.weekly_reports;
create policy weekly_reports_owner on public.weekly_reports for all
  using ((select auth.uid())::text = user_id) with check ((select auth.uid())::text = user_id);

-- ── feature tables (uuid user_id) ──
drop policy if exists "cycle own select" on public.cycle_log;
drop policy if exists "cycle own insert" on public.cycle_log;
drop policy if exists "cycle own update" on public.cycle_log;
drop policy if exists "cycle own delete" on public.cycle_log;
create policy "cycle own select" on public.cycle_log for select using ((select auth.uid()) = user_id);
create policy "cycle own insert" on public.cycle_log for insert with check ((select auth.uid()) = user_id);
create policy "cycle own update" on public.cycle_log for update using ((select auth.uid()) = user_id);
create policy "cycle own delete" on public.cycle_log for delete using ((select auth.uid()) = user_id);

drop policy if exists "meds own select" on public.medication_log;
drop policy if exists "meds own insert" on public.medication_log;
drop policy if exists "meds own update" on public.medication_log;
drop policy if exists "meds own delete" on public.medication_log;
create policy "meds own select" on public.medication_log for select using ((select auth.uid()) = user_id);
create policy "meds own insert" on public.medication_log for insert with check ((select auth.uid()) = user_id);
create policy "meds own update" on public.medication_log for update using ((select auth.uid()) = user_id);
create policy "meds own delete" on public.medication_log for delete using ((select auth.uid()) = user_id);

drop policy if exists "geno own select" on public.genomics_traits;
drop policy if exists "geno own insert" on public.genomics_traits;
drop policy if exists "geno own update" on public.genomics_traits;
drop policy if exists "geno own delete" on public.genomics_traits;
create policy "geno own select" on public.genomics_traits for select using ((select auth.uid()) = user_id);
create policy "geno own insert" on public.genomics_traits for insert with check ((select auth.uid()) = user_id);
create policy "geno own update" on public.genomics_traits for update using ((select auth.uid()) = user_id);
create policy "geno own delete" on public.genomics_traits for delete using ((select auth.uid()) = user_id);

drop policy if exists "water own" on public.water_log;
create policy "water own" on public.water_log for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- ── practitioner_links: consolidate duplicate permissive policies + initplan ──
drop policy if exists "prac sees own links" on public.practitioner_links;
drop policy if exists "client sees own links" on public.practitioner_links;
drop policy if exists "client creates invite" on public.practitioner_links;
drop policy if exists "prac accepts links" on public.practitioner_links;
drop policy if exists "client revokes links" on public.practitioner_links;
create policy practitioner_links_select on public.practitioner_links for select
  using ((select auth.uid()) = practitioner_id or (select auth.uid()) = client_id);
create policy practitioner_links_insert on public.practitioner_links for insert
  with check ((select auth.uid()) = client_id);
create policy practitioner_links_update on public.practitioner_links for update
  using ((select auth.uid()) = practitioner_id or (select auth.uid()) = client_id);

-- ── index the client_id foreign key ──
create index if not exists practitioner_links_client_id_idx on public.practitioner_links (client_id);
