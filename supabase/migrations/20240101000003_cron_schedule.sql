-- pg_cron -ajastus: aamuyhteenvedon triggerointi
-- Ajo UTC-aamuikkunassa 03:00-07:30, puolen tunnin välein
-- Kattaa Europe/Helsinki talvi- ja kesäajan (UTC+2 / UTC+3)

create or replace function public.trigger_due_summaries() returns void as $$
declare
  rec record;
  edge_url text := current_setting('app.edge_url');
  service_key text := current_setting('app.service_role_key');
begin
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
$$ language plpgsql security definer;

-- Ajastettu ajo: puolen tunnin välein UTC-aamuikkunassa
-- talvi: 05:00-09:30 EET | kesä: 06:00-10:30 EEST
select cron.schedule(
  'trigger-due-summaries',
  '0,30 3-7 * * *',
  $$select public.trigger_due_summaries();$$
);

-- HUOM: Seuraavat komennot tulee ajaa kerran manuaalisesti Supabasen SQL Editorissa
-- kun migraatio on ajettu (korvaa xxxxx oikeilla arvoilla):
--
-- ALTER DATABASE postgres SET app.edge_url = 'https://xxxxx.supabase.co';
-- ALTER DATABASE postgres SET app.service_role_key = 'eyJ...service_role_key...';
