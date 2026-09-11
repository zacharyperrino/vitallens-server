-- Migration: unify user_id to uuid, real FK cascades, hot-path indexes, atomic RPCs
--
-- Before this: 9 tables stored user_id as TEXT (and scan_history as VARCHAR),
-- so they could not reference auth.users and were skipped by account deletion
-- (GDPR erasure gap). usage_tracking had no unique key, so a race produced
-- duplicate rows and permanently disabled the gate. The spend guard summed
-- rows client-side and silently broke past PostgREST's 1,000-row cap.

-- ── 1. Drop policies that depend on the text columns ─────────────────────
drop policy if exists biomarker_scans_owner     on public.biomarker_scans;
drop policy if exists environment_logs_owner    on public.environment_logs;
drop policy if exists health_correlations_owner on public.health_correlations;
drop policy if exists health_predictions_owner  on public.health_predictions;
drop policy if exists health_profile_owner      on public.health_profile;
drop policy if exists supplement_logs_owner     on public.supplement_logs;
drop policy if exists tcm_profile_owner         on public.tcm_profile;
drop policy if exists user_goals_owner          on public.user_goals;
drop policy if exists weekly_reports_owner      on public.weekly_reports;
drop policy if exists user_isolation            on public.scan_history;

-- ── 2. Remove rows that can never be attributed to a real account ─────────
-- (non-uuid ids from an old client bug, and orphans left by deleted test users)
delete from public.scan_history
  where user_id is null
     or user_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or user_id::uuid not in (select id from auth.users);
delete from public.biomarker_scans     where user_id::uuid not in (select id from auth.users);
delete from public.environment_logs    where user_id::uuid not in (select id from auth.users);
delete from public.health_correlations where user_id::uuid not in (select id from auth.users);
delete from public.health_predictions  where user_id::uuid not in (select id from auth.users);
delete from public.health_profile      where user_id::uuid not in (select id from auth.users);
delete from public.supplement_logs     where user_id::uuid not in (select id from auth.users);
delete from public.tcm_profile         where user_id::uuid not in (select id from auth.users);
delete from public.user_goals          where user_id::uuid not in (select id from auth.users);
delete from public.weekly_reports      where user_id::uuid not in (select id from auth.users);
delete from public.usage_tracking      where user_id not in (select id from auth.users);
delete from public.hygiene_scans       where user_id not in (select id from auth.users);

-- ── 3. Convert column types ──────────────────────────────────────────────
alter table public.biomarker_scans     alter column user_id type uuid using user_id::uuid;
alter table public.environment_logs    alter column user_id type uuid using user_id::uuid;
alter table public.health_correlations alter column user_id type uuid using user_id::uuid;
alter table public.health_predictions  alter column user_id type uuid using user_id::uuid;
alter table public.health_profile      alter column user_id type uuid using user_id::uuid;
alter table public.supplement_logs     alter column user_id type uuid using user_id::uuid;
alter table public.tcm_profile         alter column user_id type uuid using user_id::uuid;
alter table public.user_goals          alter column user_id type uuid using user_id::uuid;
alter table public.weekly_reports      alter column user_id type uuid using user_id::uuid;
alter table public.scan_history        alter column user_id type uuid using user_id::uuid,
                                       alter column user_id set not null;

-- ── 4. Foreign keys with cascade so deleting the auth user erases everything
alter table public.biomarker_scans     add constraint biomarker_scans_user_id_fkey     foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.environment_logs    add constraint environment_logs_user_id_fkey    foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.health_correlations add constraint health_correlations_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.health_predictions  add constraint health_predictions_user_id_fkey  foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.health_profile      add constraint health_profile_user_id_fkey      foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.supplement_logs     add constraint supplement_logs_user_id_fkey     foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.tcm_profile         add constraint tcm_profile_user_id_fkey         foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.user_goals          add constraint user_goals_user_id_fkey          foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.weekly_reports      add constraint weekly_reports_user_id_fkey      foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.scan_history        add constraint scan_history_user_id_fkey        foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.usage_tracking      add constraint usage_tracking_user_id_fkey      foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.hygiene_scans       add constraint hygiene_scans_user_id_fkey       foreign key (user_id) references auth.users(id) on delete cascade;
-- two existing FKs lacked ON DELETE CASCADE
alter table public.portion_corrections drop constraint if exists portion_corrections_user_id_fkey;
alter table public.portion_corrections add constraint portion_corrections_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.meal_memory         drop constraint if exists meal_memory_user_id_fkey;
alter table public.meal_memory         add constraint meal_memory_user_id_fkey         foreign key (user_id) references auth.users(id) on delete cascade;

-- ── 5. Recreate owner policies without the text cast ─────────────────────
create policy biomarker_scans_owner     on public.biomarker_scans     for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy environment_logs_owner    on public.environment_logs    for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy health_correlations_owner on public.health_correlations for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy health_predictions_owner  on public.health_predictions  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy health_profile_owner      on public.health_profile      for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy supplement_logs_owner     on public.supplement_logs     for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy tcm_profile_owner         on public.tcm_profile         for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy user_goals_owner          on public.user_goals          for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy weekly_reports_owner      on public.weekly_reports      for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy user_isolation            on public.scan_history        for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- ── 6. usage_tracking: dedupe then enforce one row per (user, feature, window)
delete from public.usage_tracking a using public.usage_tracking b
  where a.user_id = b.user_id and a.feature = b.feature and a.window_start = b.window_start
    and (a.count < b.count or (a.count = b.count and a.id > b.id));
create unique index if not exists usage_tracking_user_feature_window_uidx
  on public.usage_tracking (user_id, feature, window_start);

-- ── 7. Hot-path composite indexes ────────────────────────────────────────
create index if not exists daily_nutrition_user_date_idx     on public.daily_nutrition (user_id, date);
create index if not exists meals_user_logged_at_idx          on public.meals (user_id, logged_at desc);
create index if not exists exercise_log_user_logged_at_idx   on public.exercise_log (user_id, logged_at desc);
create index if not exists biomarker_scans_user_scanned_idx  on public.biomarker_scans (user_id, scanned_at desc);
create index if not exists environment_logs_user_logged_idx  on public.environment_logs (user_id, logged_at desc);
create index if not exists hygiene_scans_user_scanned_idx    on public.hygiene_scans (user_id, scanned_at desc);
create index if not exists supplement_logs_user_active_idx   on public.supplement_logs (user_id, active);
create index if not exists lab_results_user_collected_idx    on public.lab_results (user_id, collected_at desc);
create index if not exists health_correlations_user_gen_idx  on public.health_correlations (user_id, generated_at desc);
create index if not exists health_predictions_user_gen_idx   on public.health_predictions (user_id, generated_at desc);
create index if not exists weekly_reports_user_week_idx      on public.weekly_reports (user_id, week_of desc);
create index if not exists habits_user_date_idx              on public.habits (user_id, date desc);
create index if not exists api_cost_log_user_logged_idx      on public.api_cost_log (user_id, logged_at);

-- ── 8. Atomic RPCs for the cost-control plane ────────────────────────────
-- Aggregate in Postgres: never SELECT rows to sum them (PostgREST caps at 1,000).
create or replace function public.sum_ai_spend(p_since timestamptz, p_user uuid default null)
returns numeric language sql stable security invoker set search_path = public as $$
  select coalesce(sum(cost_usd), 0)::numeric
  from public.api_cost_log
  where logged_at >= p_since and (p_user is null or user_id = p_user);
$$;
revoke execute on function public.sum_ai_spend(timestamptz, uuid) from anon, authenticated, public;
grant  execute on function public.sum_ai_spend(timestamptz, uuid) to service_role;

-- Increment-if-under-limit in one statement: no read-modify-write race.
create or replace function public.increment_usage(
  p_user uuid, p_feature text, p_window_start timestamptz, p_window_type text, p_limit int
) returns table(allowed boolean, current_count int)
language plpgsql security invoker set search_path = public as $$
declare v_count int;
begin
  insert into public.usage_tracking (user_id, feature, count, window_start, window_type)
  values (p_user, p_feature, 1, p_window_start, p_window_type)
  on conflict (user_id, feature, window_start) do update
    set count = usage_tracking.count + 1, updated_at = now()
    where usage_tracking.count < p_limit
  returning usage_tracking.count into v_count;

  if v_count is null then
    select ut.count into v_count from public.usage_tracking ut
      where ut.user_id = p_user and ut.feature = p_feature and ut.window_start = p_window_start;
    return query select false, coalesce(v_count, p_limit);
  else
    return query select true, v_count;
  end if;
end $$;
revoke execute on function public.increment_usage(uuid, text, timestamptz, text, int) from anon, authenticated, public;
grant  execute on function public.increment_usage(uuid, text, timestamptz, text, int) to service_role;

-- ── 9. Per-user timezone so "today" is the user's day, not the server's ──
alter table public.profiles add column if not exists timezone text;
