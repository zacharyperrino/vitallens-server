-- ─── VitalLens RAG Schema ────────────────────────────────────
-- Run this in your Supabase SQL editor (Dashboard → SQL Editor).
--
-- Prerequisites:
--   1. Enable pgvector: Extensions → search "vector" → enable
--   2. Run this entire script

-- ── Enable pgvector ───────────────────────────────────────────
create extension if not exists vector;

-- ── health_events — the RAG backbone ─────────────────────────
-- Every logged data point becomes an embedded vector here.
-- This is what powers semantic similarity search and root
-- cause analysis across your entire health history.

create table if not exists health_events (
    id              uuid primary key default gen_random_uuid(),
    user_id         uuid not null references auth.users(id) on delete cascade,

    -- Source info — which module wrote this event
    event_type      text not null,  -- 'meal' | 'body_scan' | 'hr_reading' | 'exercise'
                                    -- | 'sleep' | 'lab_result' | 'habit' | 'product_scan'
                                    -- | 'stool_scan' | 'symptom'
    source_id       uuid,           -- FK to the originating table row (optional)

    -- Human-readable description that gets embedded
    -- e.g. "Lunch: grilled chicken 180g, brown rice 160g. Calories: 520, protein: 42g."
    description     text not null,

    -- Structured data snapshot (for result rendering without re-querying source table)
    metadata        jsonb not null default '{}',

    -- The embedding vector (text-embedding-3-small = 1536 dims)
    embedding       vector(1536),

    -- Timestamp of the actual health event (not insertion time)
    event_at        timestamptz not null default now(),

    created_at      timestamptz not null default now()
);

-- ── Indexes ───────────────────────────────────────────────────

-- Cosine similarity index (IVFFlat — good for <1M rows)
-- Increase lists value as your dataset grows (sqrt of row count is a good rule)
create index if not exists health_events_embedding_idx
    on health_events
    using ivfflat (embedding vector_cosine_ops)
    with (lists = 100);

-- Filter by user before similarity search
create index if not exists health_events_user_id_idx
    on health_events (user_id);

-- Filter by event type
create index if not exists health_events_type_idx
    on health_events (user_id, event_type);

-- Filter by time range (for longitudinal queries)
create index if not exists health_events_event_at_idx
    on health_events (user_id, event_at desc);

-- ── Row Level Security ────────────────────────────────────────
alter table health_events enable row level security;

create policy "Users can read own health events"
    on health_events for select
    using (auth.uid() = user_id);

create policy "Users can insert own health events"
    on health_events for insert
    with check (auth.uid() = user_id);

create policy "Users can delete own health events"
    on health_events for delete
    using (auth.uid() = user_id);

-- ── match_health_events — RPC for similarity search ──────────
-- Called by the /api/correlate endpoint.
-- Returns the k most similar events to a query embedding,
-- filtered to a single user and optional time window.

create or replace function match_health_events(
    query_embedding   vector(1536),
    match_user_id     uuid,
    match_count       int  default 10,
    match_threshold   float default 0.3,
    days_back         int  default 90   -- 0 = no time limit
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