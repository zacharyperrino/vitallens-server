-- Migration: 20260704182738_get_user_id_by_email_rpc

-- Resolve a user id from their email for the practitioner-invite flow.
-- security definer so it can read auth.users; locked down to service_role
-- so it cannot be used for email enumeration from anon/authenticated clients.
create or replace function public.get_user_id_by_email(p_email text)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1;
$$;

revoke all on function public.get_user_id_by_email(text) from public;
grant execute on function public.get_user_id_by_email(text) to service_role;
