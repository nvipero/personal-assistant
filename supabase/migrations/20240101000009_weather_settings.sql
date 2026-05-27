alter table user_settings
  add column if not exists weather_enabled boolean not null default true,
  add column if not exists weather_place text not null default 'helsinki';
