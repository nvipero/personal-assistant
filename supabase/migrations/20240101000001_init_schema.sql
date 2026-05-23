-- Extensions
create extension if not exists pgcrypto;
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ----------------------------------------
-- user_settings
-- ----------------------------------------
create table public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  summary_time time not null default '07:00',
  timezone text not null default 'Europe/Helsinki',
  push_enabled boolean not null default true,
  needs_google_reauth boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.tg_set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger user_settings_updated_at
  before update on public.user_settings
  for each row execute function public.tg_set_updated_at();

-- ----------------------------------------
-- google_oauth_tokens
-- ----------------------------------------
create table public.google_oauth_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  encrypted_refresh_token bytea not null,
  scopes text[] not null,
  google_email text not null,
  connected_at timestamptz not null default now(),
  last_refreshed_at timestamptz
);

-- ----------------------------------------
-- daily_summaries
-- ----------------------------------------
create table public.daily_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  summary_date date not null,
  summary_text text not null,
  email_ids text[] not null default '{}',
  event_ids text[] not null default '{}',
  input_tokens integer not null,
  output_tokens integer not null,
  model text not null,
  generated_at timestamptz not null default now(),
  unique(user_id, summary_date)
);

create index idx_daily_summaries_user_date
  on public.daily_summaries(user_id, summary_date desc);

-- ----------------------------------------
-- push_subscriptions
-- ----------------------------------------
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh_key text not null,
  auth_key text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  unique(user_id, endpoint)
);

create index idx_push_subs_user on public.push_subscriptions(user_id);

-- ----------------------------------------
-- prompt_versions
-- ----------------------------------------
create table public.prompt_versions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  version integer not null,
  content text not null,
  is_active boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  unique(name, version)
);

create index idx_prompt_versions_active
  on public.prompt_versions(name) where is_active = true;

-- ----------------------------------------
-- user_memory
-- ----------------------------------------
create table public.user_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('people', 'preferences', 'context', 'feedback')),
  content text not null,
  source text not null check (source in ('user_profile', 'feedback', 'manual_edit')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_user_memory_active
  on public.user_memory(user_id) where is_active = true;

create trigger user_memory_updated_at
  before update on public.user_memory
  for each row execute function public.tg_set_updated_at();

-- ----------------------------------------
-- summary_feedback
-- ----------------------------------------
create table public.summary_feedback (
  id uuid primary key default gen_random_uuid(),
  summary_id uuid not null references public.daily_summaries(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rating text check (rating in ('thumbs_up', 'thumbs_down')),
  comment text,
  generated_memory_suggestion text,
  suggestion_status text check (suggestion_status in ('pending', 'accepted', 'rejected', 'edited')),
  resulting_memory_id uuid references public.user_memory(id) on delete set null,
  created_at timestamptz not null default now()
);

create index idx_summary_feedback_user on public.summary_feedback(user_id, created_at desc);

-- ----------------------------------------
-- RLS
-- ----------------------------------------
alter table public.user_settings enable row level security;
alter table public.google_oauth_tokens enable row level security;
alter table public.daily_summaries enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.prompt_versions enable row level security;
alter table public.user_memory enable row level security;
alter table public.summary_feedback enable row level security;

-- user_settings
create policy "own_settings_select" on public.user_settings
  for select using (auth.uid() = user_id);
create policy "own_settings_insert" on public.user_settings
  for insert with check (auth.uid() = user_id);
create policy "own_settings_update" on public.user_settings
  for update using (auth.uid() = user_id);

-- google_oauth_tokens: ei policyä, vain service_role
-- prompt_versions: ei policyä, vain service_role

-- daily_summaries: käyttäjä saa lukea omat
create policy "own_summaries_select" on public.daily_summaries
  for select using (auth.uid() = user_id);

-- push_subscriptions
create policy "own_pushsub_select" on public.push_subscriptions
  for select using (auth.uid() = user_id);
create policy "own_pushsub_insert" on public.push_subscriptions
  for insert with check (auth.uid() = user_id);
create policy "own_pushsub_delete" on public.push_subscriptions
  for delete using (auth.uid() = user_id);

-- user_memory
create policy "own_memory_select" on public.user_memory
  for select using (auth.uid() = user_id);
create policy "own_memory_insert" on public.user_memory
  for insert with check (auth.uid() = user_id);
create policy "own_memory_update" on public.user_memory
  for update using (auth.uid() = user_id);
create policy "own_memory_delete" on public.user_memory
  for delete using (auth.uid() = user_id);

-- summary_feedback
create policy "own_feedback_select" on public.summary_feedback
  for select using (auth.uid() = user_id);
create policy "own_feedback_insert" on public.summary_feedback
  for insert with check (auth.uid() = user_id);
create policy "own_feedback_update" on public.summary_feedback
  for update using (auth.uid() = user_id);
