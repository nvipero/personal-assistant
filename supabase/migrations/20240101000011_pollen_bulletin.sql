create table pollen_bulletin (
  id bigint primary key generated always as identity,
  fetched_at timestamptz not null default now(),
  bulletin_date date not null,
  raw_text text not null,
  parsed jsonb not null,
  unique (bulletin_date)
);

alter table pollen_bulletin enable row level security;
create policy "service_role_all" on pollen_bulletin
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
grant select, insert, update on public.pollen_bulletin to service_role;

create or replace function public.trigger_fetch_pollen() returns void as $$
declare
  edge_url text;
  service_key text;
begin
  select decrypted_secret into edge_url from vault.decrypted_secrets where name = 'app_edge_url';
  select decrypted_secret into service_key from vault.decrypted_secrets where name = 'app_service_role_key';
  if edge_url is null or service_key is null then
    raise warning 'trigger_fetch_pollen: Vault-arvot puuttuvat';
    return;
  end if;
  perform net.http_post(
    url := edge_url || '/functions/v1/fetch-pollen',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body := '{}'::jsonb
  );
end;
$$ language plpgsql security definer set search_path = public, extensions;

select cron.schedule('fetch-pollen-bulletin', '0 6 * * *', $$select public.trigger_fetch_pollen();$$);
