-- Spinoff schema. Applied on startup when DATABASE_URL is set; safe to run repeatedly.

-- Fetched App Store data plus the passes that don't depend on the audience.
create table if not exists app_cache (
  app_id text not null,
  country text not null default 'us',
  listing_json jsonb,
  reviews_json jsonb,
  analysis_json jsonb not null default '{}'::jsonb,
  fetched_at timestamptz,
  reviews_fetched_at timestamptz,
  primary key (app_id, country)
);

-- Saved ideas. v1 keeps ideas on the device (localStorage, same shape).
-- device_id / user_id are here so syncing and accounts can be added later.
create table if not exists ideas (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source_app_id text not null,
  audience text not null,
  output_json jsonb not null,
  device_id text,
  user_id text
);
create index if not exists ideas_user_id_idx on ideas (user_id, created_at desc);
