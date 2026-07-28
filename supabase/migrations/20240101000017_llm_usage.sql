-- Osa 2: LLM-kutsujen token- ja kustannuslogitus.
-- Jokaisesta aamuyhteenvedon LLM-kutsusta (tai sen fallbackista) tallennetaan
-- token-käyttö ja arvioitu hinta, jotta mallivertailu on mitattavissa.
--
-- Huom: prompt_version_id on uuid (prompt_versions.id on uuid, ei bigint).
create table public.llm_usage (
  id                          bigint generated always as identity primary key,
  created_at                  timestamptz not null default now(),
  function_name               text not null,
  model                       text not null,
  prompt_version_id           uuid references public.prompt_versions(id),
  user_id                     uuid,
  run_id                      uuid,
  input_tokens                integer not null default 0,
  output_tokens               integer not null default 0,
  cache_creation_input_tokens integer not null default 0,
  cache_read_input_tokens     integer not null default 0,
  estimated_cost_usd          numeric(10,6),
  status                      text not null,          -- 'ok' | 'error' | 'fallback'
  error_message               text
);

create index on public.llm_usage (created_at desc);
create index on public.llm_usage (model, created_at desc);

-- Vain service_role kirjoittaa ja lukee (kuten prompt_versions / google_oauth_tokens).
-- RLS päällä ilman policya = ei käyttäjäpääsyä, service_role ohittaa RLS:n.
alter table public.llm_usage enable row level security;
