-- Migration: 20260704190559_harden_functions_from_advisors

-- 1. Lock down get_user_id_by_email to service_role only.
revoke execute on function public.get_user_id_by_email(text) from anon, authenticated, public;
grant execute on function public.get_user_id_by_email(text) to service_role;

-- 2. Pin match_health_events' search_path (was mutable / unset).
-- (Superseded by 20260704190851 which drops this 3-arg overload.)
create or replace function public.match_health_events(
  query_embedding vector(1536),
  match_user_id uuid,
  match_count int default 8
)
returns table (id uuid, description text, event_type text, event_at timestamptz, similarity float)
language sql stable
set search_path = public, extensions
as $$
  select he.id, he.description, he.event_type, he.event_at,
         1 - (he.embedding <=> query_embedding) as similarity
  from health_events he
  where he.user_id = match_user_id and he.embedding is not null
  order by he.embedding <=> query_embedding
  limit match_count;
$$;
