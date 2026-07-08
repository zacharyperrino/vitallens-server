-- Migration: 20260704190851_fix_match_health_events_overload

-- Resolve the ambiguous RPC overload: drop the accidental 3-arg duplicate,
-- keep the canonical 5-arg version that matches server/db/rag_schema.sql.
drop function if exists public.match_health_events(vector, uuid, integer);

create or replace function public.match_health_events(
    query_embedding   vector(1536),
    match_user_id     uuid,
    match_count       int  default 10,
    match_threshold   float default 0.3,
    days_back         int  default 90
)
returns table (
    id          uuid,
    event_type  text,
    description text,
    metadata    jsonb,
    event_at    timestamptz,
    similarity  float
)
language plpgsql
set search_path = public, extensions
as $$
begin
    return query
    select
        he.id,
        he.event_type,
        he.description,
        he.metadata,
        he.event_at,
        1 - (he.embedding <=> query_embedding) as similarity
    from health_events he
    where
        he.user_id = match_user_id
        and he.embedding is not null
        and (days_back = 0 or he.event_at >= now() - (days_back || ' days')::interval)
        and 1 - (he.embedding <=> query_embedding) > match_threshold
    order by he.embedding <=> query_embedding
    limit match_count;
end;
$$;
