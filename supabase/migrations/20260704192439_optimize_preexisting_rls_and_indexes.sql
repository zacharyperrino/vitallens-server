-- Migration: optimize_preexisting_rls_and_indexes
-- Rewrite pre-existing RLS policies: auth.uid() -> (select auth.uid()).
-- Behavior-preserving; evaluates the auth call once per query (initplan).

-- Uniform user_isolation (ALL, user_id)
drop policy if exists user_isolation on public.body_scans;
create policy user_isolation on public.body_scans for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists user_isolation on public.chat_history;
create policy user_isolation on public.chat_history for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists user_isolation on public.daily_nutrition;
create policy user_isolation on public.daily_nutrition for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists user_isolation on public.environmental_log;
create policy user_isolation on public.environmental_log for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists user_isolation on public.exercise_log;
create policy user_isolation on public.exercise_log for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists user_isolation on public.habits;
create policy user_isolation on public.habits for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists user_isolation on public.health_insights;
create policy user_isolation on public.health_insights for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists user_isolation on public.hr_readings;
create policy user_isolation on public.hr_readings for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists user_isolation on public.hygiene_scans;
create policy user_isolation on public.hygiene_scans for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists user_isolation on public.lab_results;
create policy user_isolation on public.lab_results for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists user_isolation on public.meals;
create policy user_isolation on public.meals for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists user_isolation on public.product_scans;
create policy user_isolation on public.product_scans for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists user_isolation on public.sleep_log;
create policy user_isolation on public.sleep_log for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists user_isolation on public.stool_scans;
create policy user_isolation on public.stool_scans for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists user_isolation on public.usage_tracking;
create policy user_isolation on public.usage_tracking for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists user_isolation on public.wearable_connections;
create policy user_isolation on public.wearable_connections for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists user_isolation on public.weekly_scores;
create policy user_isolation on public.weekly_scores for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- profiles keys on id
drop policy if exists user_isolation on public.profiles;
create policy user_isolation on public.profiles for all using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- scan_history casts both sides to text
drop policy if exists user_isolation on public.scan_history;
create policy user_isolation on public.scan_history for all using (((select auth.uid())::text) = (user_id)::text) with check (((select auth.uid())::text) = (user_id)::text);

-- health_events: three separate command policies
drop policy if exists "Users can read own health events" on public.health_events;
create policy "Users can read own health events" on public.health_events for select using ((select auth.uid()) = user_id);
drop policy if exists "Users can insert own health events" on public.health_events;
create policy "Users can insert own health events" on public.health_events for insert with check ((select auth.uid()) = user_id);
drop policy if exists "Users can delete own health events" on public.health_events;
create policy "Users can delete own health events" on public.health_events for delete using ((select auth.uid()) = user_id);

-- products: insert requires a signed-in user
drop policy if exists authenticated_insert on public.products;
create policy authenticated_insert on public.products for insert with check ((select auth.uid()) is not null);

-- ── Drop duplicate indexes on api_cost_log ──
drop index if exists public.api_cost_log_logged_at_idx1;
drop index if exists public.api_cost_log_route_logged_at_idx1;
drop index if exists public.api_cost_log_user_id_logged_at_idx1;

-- ── Add covering indexes for the unindexed foreign keys ──
create index if not exists hr_readings_user_id_idx on public.hr_readings (user_id);
create index if not exists sleep_log_user_id_idx on public.sleep_log (user_id);
create index if not exists stool_scans_user_id_idx on public.stool_scans (user_id);
create index if not exists scan_history_barcode_idx on public.scan_history (barcode);
