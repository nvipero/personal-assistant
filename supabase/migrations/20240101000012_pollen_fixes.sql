-- Indeksi kyselysuorituskykyä varten
create index if not exists pollen_bulletin_date_idx on pollen_bulletin (bulletin_date desc);

-- Authenticated-käyttäjät voivat lukea (Edge Functions käyttävät service_role, mutta koska
-- pollen_bulletin on osana projektin tietoarkkitehtuuria, lisätään read-oikeus)
create policy "authenticated users can read pollen"
  on pollen_bulletin for select
  to authenticated
  using (true);

grant select on public.pollen_bulletin to authenticated;

-- Päivitä cron-ajastus: 03:30 UTC on riittävän aikaisin aamuyhteenvedolle
-- (siitepölytiedote päivittyy edellisenä iltapäivänä/illalla)
select cron.unschedule('fetch-pollen-bulletin');
select cron.schedule('fetch-pollen-daily', '30 3 * * *', $$select public.trigger_fetch_pollen();$$);
