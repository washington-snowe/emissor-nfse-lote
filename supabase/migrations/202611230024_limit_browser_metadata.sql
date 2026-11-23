begin;

-- The certificate status page reads status and timing, never the worker lease.
revoke select on public.certificate_verifications from authenticated;
grant select (certificate_id, tenant_id, status, result_code, http_status, updated_at, verified_at, next_attempt)
  on public.certificate_verifications to authenticated;

-- The application loads the captured contract and these markers on the server.
revoke execute on function public.nfse_contract_status() from anon, authenticated;
revoke execute on function public.fiscal_production_schema_ready(), public.fiscal_local_danfse_ready() from authenticated;

notify pgrst, 'reload schema';
commit;
