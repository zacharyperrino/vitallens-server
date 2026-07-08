-- Migration: create_user_consents
-- Versioned consent records: one row per user per document acceptance.
create table if not exists public.user_consents (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    document text not null check (document in (
        'terms_of_service', 'privacy_policy', 'health_data_processing', 'ai_processing'
    )),
    version text not null,
    accepted boolean not null default true,
    accepted_at timestamptz not null default now(),
    user_agent text
);

create index if not exists idx_user_consents_user on public.user_consents(user_id);
create unique index if not exists uq_user_consents_latest
    on public.user_consents(user_id, document, version);

alter table public.user_consents enable row level security;

-- Users may read and insert only their own consent records; no updates/deletes
-- (consent history is append-only and immutable).
drop policy if exists "own consents select" on public.user_consents;
create policy "own consents select" on public.user_consents
    for select using (auth.uid() = user_id);

drop policy if exists "own consents insert" on public.user_consents;
create policy "own consents insert" on public.user_consents
    for insert with check (auth.uid() = user_id);
