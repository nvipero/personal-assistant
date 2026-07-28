-- Osa 3: template-fallback + ylläpitäjän tunnistus.
--
-- generated_by: erottaa LLM:n tuottamat yhteenvedot template-fallbackista,
-- jotta fallback-ajot ovat jälkikäteen tunnistettavissa.
alter table public.daily_summaries
  add column if not exists generated_by text not null default 'llm';  -- 'llm' | 'template'

-- is_admin: fallback-hälytys lähetetään vain ylläpitäjälle, ei kaikille käyttäjille.
alter table public.user_settings
  add column if not exists is_admin boolean not null default false;
