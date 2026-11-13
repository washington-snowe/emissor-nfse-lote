-- Optional scheduler setup AFTER migration 17 and private configuration.
-- Enable pg_cron and pg_net in Supabase Extensions first. Secrets are created in Vault's UI.
begin;
create or replace function private.tick_invoice_email() returns void language plpgsql security definer set search_path='' as $$
declare endpoint text; worker_secret text;
begin
 if not public.invoice_email_ready(null) then return; end if;
 if exists(select 1 from public.invoice_email_deliveries e join private.invoice_email_execution x on x.delivery_id=e.id
 where e.status='processing' and x.lease_until>now()) then return; end if;
 select decrypted_secret into endpoint from vault.decrypted_secrets where name='nfse_email_worker_url';
 select decrypted_secret into worker_secret from vault.decrypted_secrets where name='nfse_email_worker_secret';
 if endpoint is null or endpoint !~ '^https://[a-z0-9][a-z0-9.-]+/api/jobs/email$' or worker_secret is null or length(worker_secret)<32 then return; end if;
 perform net.http_post(url:=endpoint,headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||worker_secret),body:='{}'::jsonb,timeout_milliseconds:=5000);
end $$;
revoke all on function private.tick_invoice_email() from public,anon,authenticated,service_role;
-- Named schedule replaces its own prior configuration; no duplicate jobs.
select cron.schedule('rex-invoice-email-worker','30 seconds','select private.tick_invoice_email()');
commit;
