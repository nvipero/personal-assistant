-- Luo user_settings-rivi automaattisesti kun uusi käyttäjä rekisteröityy

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.user_settings (user_id, summary_time, timezone, push_enabled)
  values (new.id, '07:00', 'Europe/Helsinki', true)
  on conflict (user_id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
