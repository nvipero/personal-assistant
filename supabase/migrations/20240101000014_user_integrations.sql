create table user_integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  provider text not null,
  access_token bytea not null,
  scopes text[] not null default '{}',
  connected_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  unique (user_id, provider)
);

alter table user_integrations enable row level security;
create policy "users can read own integrations" on user_integrations
  for select to authenticated using (user_id = auth.uid());
grant select, insert, update on public.user_integrations to service_role;
grant select on public.user_integrations to authenticated;

create table oauth_states (
  state text primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  provider text not null,
  created_at timestamptz not null default now()
);

alter table oauth_states enable row level security;
grant select, insert, delete on public.oauth_states to service_role;

create or replace function public.cleanup_expired_oauth_states() returns void as $$
begin
  delete from public.oauth_states where created_at < now() - interval '10 minutes';
end;
$$ language plpgsql security definer set search_path = public;

select cron.schedule('cleanup-oauth-states', '*/10 * * * *', $$select public.cleanup_expired_oauth_states();$$);
