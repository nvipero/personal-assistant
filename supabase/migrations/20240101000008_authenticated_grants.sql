-- authenticated-rooli tarvitsee taulutason oikeudet RLS-policyjen lisäksi

grant select, insert, update on public.user_settings to authenticated;
grant select on public.daily_summaries to authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant select, insert, update, delete on public.user_memory to authenticated;
grant select, insert, update on public.summary_feedback to authenticated;
