-- Lisätään google_email user_settings-tauluun, jotta frontend näkee yhteyden tilan
-- ilman suoraa pääsyä google_oauth_tokens-tauluun (vain service_role)

alter table public.user_settings
  add column if not exists google_email text default null;
