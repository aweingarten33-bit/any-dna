-- Spinoff schema.

-- Fetched App Store data plus the passes that don't depend on the audience.
-- Only the edge functions (service role) read or write it.
create table if not exists public.app_cache (
  app_id text not null,
  country text not null default 'us',
  listing_json jsonb,
  reviews_json jsonb,
  analysis_json jsonb not null default '{}'::jsonb,
  fetched_at timestamptz,
  reviews_fetched_at timestamptz,
  primary key (app_id, country)
);
alter table public.app_cache enable row level security;

-- Saved ideas. v1 keeps ideas on the device (localStorage, same shape).
-- device_id / user_id are here so syncing and auth can be added without a migration of the data.
create table if not exists public.ideas (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source_app_id text not null,
  audience text not null,
  output_json jsonb not null,
  device_id text,
  user_id uuid references auth.users (id) on delete cascade
);
create index if not exists ideas_user_id_idx on public.ideas (user_id, created_at desc);
alter table public.ideas enable row level security;

-- When auth is added, people can manage only their own ideas:
create policy "own ideas" on public.ideas
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
