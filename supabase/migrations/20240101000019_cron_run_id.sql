-- Osa 2: run_id — yksi UUID per cron-ajo, jaettu kaikkien saman ajon
-- generate-summary-kutsujen kesken. Tekee "yhden aamun kustannus" -kyselystä
-- triviaalin (group by run_id).
--
-- Redefinoi trigger_due_summaries: generoi run_id kerran ja välittää sen
-- jokaisen käyttäjän generate-summary-kutsun bodyssä. Muu logiikka ennallaan.
create or replace function public.trigger_due_summaries() returns void as $$
declare
  rec record;
  edge_url text;
  service_key text;
  run_id uuid := gen_random_uuid();
begin
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
      body := jsonb_build_object('user_id', rec.user_id, 'run_id', run_id)
    );
  end loop;
end;
$$ language plpgsql security definer set search_path = public, extensions;
