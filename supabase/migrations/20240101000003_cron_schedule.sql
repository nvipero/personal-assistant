-- pg_cron -ajastus: aamuyhteenvedon triggerointi
-- Ajo UTC-aamuikkunassa 03:00-07:30, puolen tunnin välein
-- Kattaa Europe/Helsinki talvi- ja kesäajan (UTC+2 / UTC+3)
--
-- Turvallisuusratkaisu: käytetään Supabase Vaultia tietokantaparametrien sijaan.
-- ALTER DATABASE postgres SET ei toimi Supabasen hosted-ympäristössä.
--
-- Ennen kuin cron toimii, aja SQL Editorissa (korvaa arvot):
--   select vault.create_secret('https://xxxxx.supabase.co', 'app_edge_url');
--   select vault.create_secret('eyJ...service_role_key...', 'app_service_role_key');

create or replace function public.trigger_due_summaries() returns void as $$
declare
  rec record;
  edge_url text;
  service_key text;
begin
  -- Hae arvot Supabase Vaultista
  select decrypted_secret into edge_url
  from vault.decrypted_secrets
  where name = 'app_edge_url';

  select decrypted_secret into service_key
  from vault.decrypted_secrets
  where name = 'app_service_role_key';

  if edge_url is null or service_key is null then
    raise warning 'trigger_due_summaries: Vault-arvot puuttuvat (app_edge_url tai app_service_role_key)';
    return;
  end if;

  for rec in
    select us.user_id
    from public.user_settings us
    where us.push_enabled = true
      and (now() at time zone us.timezone)::time >= us.summary_time
      and not exists (
        select 1 from public.daily_summaries ds
        where ds.user_id = us.user_id
          and ds.summary_date = (now() at time zone us.timezone)::date
      )
  loop
    perform net.http_post(
      url := edge_url || '/functions/v1/generate-summary',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_key
      ),
      body := jsonb_build_object('user_id', rec.user_id)
    );
  end loop;
end;
$$ language plpgsql security definer set search_path = public, extensions;

-- Ajastettu ajo: puolen tunnin välein UTC-aamuikkunassa
-- talvi: 05:00-09:30 EET | kesä: 06:00-10:30 EEST
select cron.schedule(
  'trigger-due-summaries',
  '0,30 3-7 * * *',
  $$select public.trigger_due_summaries();$$
);
