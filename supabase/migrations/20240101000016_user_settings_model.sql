alter table public.user_settings
  add column if not exists summary_model text not null default 'claude-haiku-4-5';
