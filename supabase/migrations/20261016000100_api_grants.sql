-- Explicit Data API grants, so the app works even when the project was created
-- with "Automatically expose new tables" turned off. RLS still limits every row
-- to its owner; anonymous (not signed in) requests get nothing.
grant usage on schema public to authenticated, service_role;

grant select, insert, update, delete on public.batches, public.invoices, public.exports to authenticated;
grant select on public.profiles, public.usage_counters to authenticated;

grant all on all tables in schema public to service_role;
grant execute on function public.consume_scan(uuid, integer), public.refund_scan(uuid) to service_role;

revoke all on public.google_connections from anon, authenticated;
