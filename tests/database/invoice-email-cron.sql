-- Runs ONLY inside the disposable harness. Cron/HTTP/Vault boundaries below are synthetic.
create schema vault;
create table vault.decrypted_secrets(name text primary key,decrypted_secret text);
create schema net;
create temporary table email_test_http(url text,headers jsonb,body jsonb,timeout_milliseconds integer);
create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language plpgsql as $$ begin
 insert into email_test_http values(url,headers,body,timeout_milliseconds);return 1;end $$;
create schema cron;
create temporary table email_test_cron(name text primary key,schedule text,command text);
create function cron.schedule(job_name text,job_schedule text,job_command text) returns bigint language plpgsql as $$ begin
 insert into email_test_cron values(job_name,job_schedule,job_command) on conflict(name) do update set schedule=excluded.schedule,command=excluded.command;return 1;end $$;
