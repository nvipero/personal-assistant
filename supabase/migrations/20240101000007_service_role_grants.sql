-- service_role tarvitsee eksplisiittiset oikeudet tauluihin joihin RLS on kytketty
-- anon ja authenticated saavat oikeudet RLS-policyjen kautta

grant select, insert, update on public.google_oauth_tokens to service_role;
grant select, insert, update, delete on public.user_settings to service_role;
grant select, insert, update on public.daily_summaries to service_role;
grant select, insert, update, delete on public.push_subscriptions to service_role;
grant select, insert, update, delete on public.user_memory to service_role;
grant select, insert, update on public.summary_feedback to service_role;
grant select on public.prompt_versions to service_role;
