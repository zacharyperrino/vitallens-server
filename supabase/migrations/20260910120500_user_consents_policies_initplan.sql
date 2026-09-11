-- Supabase advisor 0003 (auth_rls_initplan): evaluate auth.uid() once per
-- query, not once per row. Same semantics as before. Applied live 2026-09-10.
drop policy if exists "own consents select" on public.user_consents;
create policy "own consents select" on public.user_consents
  for select using ((select auth.uid()) = user_id);
drop policy if exists "own consents insert" on public.user_consents;
create policy "own consents insert" on public.user_consents
  for insert with check ((select auth.uid()) = user_id);
