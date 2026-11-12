"""Exercise the real migration in an isolated PostgreSQL; never connects to the hosted project."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import os
import re
import secrets
import subprocess
import time
import uuid

ROOT = Path(__file__).resolve().parents[2]
IMAGE = "postgres@sha256:665dc7b37ac52a17e298511414c21d23ffa4e6a6ef6225b3e5d59c7afb35e994"
DOCKER = ["docker", "--host=unix:///var/run/docker.sock"]
CONTAINER = "nfse-tenancy-test-" + uuid.uuid4().hex[:12]
env = dict(os.environ)
for name in ["DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_TLS", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH"]:
    env.pop(name, None)


def docker(*args, source=None, check=True):
    result = subprocess.run(DOCKER + list(args), input=source, text=True, capture_output=True, env=env, timeout=120)
    if check and result.returncode:
        raise RuntimeError(result.stderr.strip() or "Docker command failed")
    return result


def sql(source, user="postgres"):
    return docker("exec", "-i", CONTAINER, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", user, "-d", "postgres", source=source).stdout


started = False
try:
    docker("info", "--format", "{{.ServerVersion}}")
    if docker("image", "inspect", IMAGE, check=False).returncode:
        docker("pull", IMAGE)
    env["POSTGRES_PASSWORD"] = secrets.token_urlsafe(32)
    docker("run", "--detach", "--name", CONTAINER, "--network", "none", "-e", "POSTGRES_PASSWORD", IMAGE)
    started = True
    env.pop("POSTGRES_PASSWORD", None)
    for attempt in range(30):
        if not docker("exec", CONTAINER, "pg_isready", "-h", "127.0.0.1", "-U", "postgres", check=False).returncode:
            break
        time.sleep(1)
    else:
        raise RuntimeError("PostgreSQL did not become ready")

    print("PostgreSQL", sql("show server_version;").strip())
    sql((ROOT / "tests/database/bootstrap.sql").read_text())
    for migration in sorted((ROOT / "supabase/migrations").glob("*.sql")):
        sql(migration.read_text())
    output = sql((ROOT / "tests/database/tenancy.sql").read_text(), "tenant_test_client")
    match = re.search(r"^ASSERTIONS=(\d+)$", output, re.M)
    assert match and int(match[1]) >= 25, "Isolation assertions did not complete"
    print(f"RLS/privileges/identity: {match[1]} assertions passed")
    companies = sql((ROOT / "tests/database/companies.sql").read_text(), "tenant_test_client")
    company_count = re.search(r"^COMPANY_ASSERTIONS=(\d+)$", companies, re.M)
    assert company_count and int(company_count[1]) >= 18, "Company isolation assertions did not complete"
    print(f"Companies/lookup quota: {company_count[1]} assertions passed")
    imports = sql((ROOT / "tests/database/imports.sql").read_text())
    import_count = re.search(r"^IMPORT_ASSERTIONS=(\d+)$", imports, re.M)
    assert import_count and int(import_count[1]) >= 25, "Import workflow assertions did not complete"
    print(f"Imports/queue/fencing: {import_count[1]} assertions passed")
    certificates = sql((ROOT / "tests/database/certificates.sql").read_text())
    certificate_count = re.search(r"^CERTIFICATE_ASSERTIONS=(\d+)$", certificates, re.M)
    assert certificate_count and int(certificate_count[1]) >= 13, "Certificate privilege assertions did not complete"
    print(f"Certificate metadata/privileges: {certificate_count[1]} assertions passed (live Vault not tested)")
    fiscal_access = sql((ROOT / "tests/database/fiscal-access.sql").read_text())
    access_count = re.search(r"^FISCAL_ACCESS_ASSERTIONS=(\d+)$", fiscal_access, re.M)
    assert access_count and int(access_count[1]) >= 9, "Fiscal metadata privilege assertions did not complete"
    print(f"Fiscal access metadata: {access_count[1]} assertions passed (no live fiscal request)")
    profiles = sql((ROOT / "tests/database/fiscal-profiles.sql").read_text())
    profile_count = re.search(r"^PROFILE_ASSERTIONS=(\d+)$", profiles, re.M)
    assert profile_count and int(profile_count[1]) >= 17, "Fiscal profile assertions did not complete"
    print(f"Fiscal profiles/versioning/isolation: {profile_count[1]} assertions passed")
    reviews = sql((ROOT / "tests/database/report-reviews.sql").read_text())
    review_count = re.search(r"^REVIEW_ASSERTIONS=(\d+)$", reviews, re.M)
    assert review_count and int(review_count[1]) >= 20, "Report review assertions did not complete"
    print(f"Report reviews/confirmation/integrity: {review_count[1]} assertions passed")
    mfa = sql((ROOT / "tests/database/mfa.sql").read_text())
    mfa_count = re.search(r"^MFA_ASSERTIONS=(\d+)$", mfa, re.M)
    assert mfa_count and int(mfa_count[1]) >= 10, "MFA policy assertions did not complete"
    print(f"MFA policy: {mfa_count[1]} assertions passed (Auth gateway claims simulated)")

    # Only in the disposable test database: slow concurrent INSERTs to expose uniqueness races.
    sql("""
      create function public.test_slow_insert() returns trigger language plpgsql as $$
      begin perform pg_sleep(0.3); return new; end; $$;
      create trigger test_slow_insert before insert on public.tenants
        for each row execute function public.test_slow_insert();
    """)

    def bootstrap(_):
        output = sql("""
          set role authenticated;
          set request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}';
          select public.ensure_tenant();
        """, "tenant_test_client")
        return output.strip()

    with ThreadPoolExecutor(max_workers=8) as pool:
        ids = list(pool.map(bootstrap, range(8)))
    assert len(set(ids)) == 1 and re.fullmatch(r"[0-9a-f-]{36}", ids[0]), "Concurrent calls produced different tenants"
    assert sql("select count(*) from public.tenants where owner_user_id='00000000-0000-4000-8000-000000000003';").strip() == "1"
    print("Concurrency: 8 simultaneous bootstraps, 1 tenant")

    company = sql("""
      set role authenticated;
      set request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000003"}';
      insert into public.companies(cnpj,legal_name,tax_regime) values('12ABC34501DE35','Import concurrency fixture','mei') returning id;
    """, "tenant_test_client").strip()
    assert re.fullmatch(r"[0-9a-f-]{36}", company)

    def register_import(_):
        return sql(f"""
          set role service_role;
          select public.register_report('00000000-0000-4000-8000-000000000003','{company}','concurrency.csv','Y29uY3VycmVudA==')->>'id';
        """).strip()

    with ThreadPoolExecutor(max_workers=8) as pool:
        imported = list(pool.map(register_import, range(8)))
    assert len(set(imported)) == 1 and re.fullmatch(r"[0-9a-f-]{36}", imported[0]), "Concurrent source registrations duplicated imports"
    assert sql(f"select count(*) from public.work_jobs where import_id='{imported[0]}';").strip() == "1"
    assert sql(f"select requests from private.operation_limits where tenant_id='{ids[0]}' and operation='register_report';").strip() == "1"
    print("Import concurrency: 8 registrations, 1 source, 1 job, 1 quota unit")

    def claim_import(_):
        return sql(f"set role service_role; select count(*) from public.claim_report_jobs('{ids[0]}',1);").strip()

    with ThreadPoolExecutor(max_workers=8) as pool:
        claimed = list(pool.map(claim_import, range(8)))
    assert claimed.count("1") == 1 and claimed.count("0") == 7, "Concurrent workers claimed the same active lease"
    print("Queue concurrency: 8 workers, 1 exclusive lease")

    def save_profile(_):
        result = docker("exec", "-i", CONTAINER, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", source=f"""
          set role service_role;
          select public.save_fiscal_profile('00000000-0000-4000-8000-000000000003','{company}',0,
            '{{"simplesOption":"2","issuerMunicipality":"3550308","series":"00001"}}','synthetic concurrency test','2026-01-01')->>'version';
        """, check=False)
        if result.returncode:
            assert 'Fiscal profile changed' in result.stderr, "Unexpected concurrent profile failure"
            return "stale"
        return result.stdout.strip()

    with ThreadPoolExecutor(max_workers=8) as pool:
        versions = list(pool.map(save_profile, range(8)))
    assert versions.count("1") == 1 and versions.count("stale") == 7, "Concurrent edits overwrote a profile version"
    assert sql(f"select count(*) from public.company_fiscal_profiles where company_id='{company}';").strip() == "1"
    print("Fiscal profile concurrency: 8 competing edits, 1 new version, 7 stale edits blocked")

    sql(f"""
      select public.finish_report_job(j.id,j.lease_token,jsonb_build_object('review',jsonb_build_object(
        'source',jsonb_build_object('fileSha256',r.file_sha256,'adapterId','shopee-seller-monthly-csv','adapterVersion','1'),
        'fiscalStatus','not_evaluated','rows','[{{"location":{{"row":2}},"currency":"BRL","amount":"1.00"}}]'::jsonb),
        'reportedSellers','[{{}}]'::jsonb)) from public.work_jobs j join public.report_imports r on r.id=j.import_id
        where r.id='{imported[0]}';
    """)
    profile_id = sql(f"select id from public.company_fiscal_profiles where company_id='{company}' order by version desc limit 1;").strip()
    review_snapshot = sql(f"""
      select jsonb_build_object('contractVersion',1,'environment','homologation','companyId',c.id,'issuerCnpj',c.cnpj,
        'importId',r.id,'fileSha256',r.file_sha256,'profileId',p.id,'profileSha256',p.configuration_sha256,'profileVersion',p.version,
        'competenceDate','2026-10-31','commissionType','Synthetic concurrency test','evidenceReference','Synthetic reference',
        'recipientRoleConfirmed',true,'recipientChoice','single_recipient','grouping','per_row','sourceRows',1,'currency','BRL','total','1.00',
        'groups',jsonb_build_array(jsonb_build_object('sourceRows','[2]'::jsonb,'sourceClaims',jsonb_build_array(repeat('e',64)),
          'allocations','[{{"row":2,"amount":"1.00"}}]'::jsonb,'amount','1.00','recipient','{{"kind":"cnpj","document":"11222333000181","country":"BR","legalName":"Synthetic concurrency fixture"}}'::jsonb)))
      from public.report_imports r join public.companies c on c.id=r.company_id join public.company_fiscal_profiles p on p.id='{profile_id}'
      where r.id='{imported[0]}';
    """).strip().replace("'", "''")

    def prepare_review(_):
        result = docker("exec", "-i", CONTAINER, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", source=f"""
          set role service_role;
          select public.save_report_review('00000000-0000-4000-8000-000000000003','{imported[0]}','{profile_id}',0,'{review_snapshot}')->>'version';
        """, check=False)
        if result.returncode:
            assert 'Review changed' in result.stderr, "Unexpected concurrent review failure"
            return "stale"
        return result.stdout.strip()

    with ThreadPoolExecutor(max_workers=8) as pool:
        prepared = list(pool.map(prepare_review, range(8)))
    assert prepared.count("1") == 1 and prepared.count("stale") == 7, "Concurrent preparation overwrote a review"
    review_id, review_hash = sql(f"select id||'|'||snapshot_sha256 from public.report_reviews where import_id='{imported[0]}';").strip().split('|')

    def confirm_review(_):
        return sql(f"set role service_role; select public.confirm_report_review('00000000-0000-4000-8000-000000000003','{review_id}','{review_hash}');").strip()

    with ThreadPoolExecutor(max_workers=8) as pool:
        confirmations = list(pool.map(confirm_review, range(8)))
    assert len(set(confirmations)) == 1 and re.fullmatch(r"[0-9a-f-]{36}", confirmations[0]), "Repeated confirmation created different proof records"
    assert sql(f"select count(*) from public.review_confirmations where review_id='{review_id}';").strip() == "1"
    print("Review concurrency: 8 competing preparations, 1 version; 8 confirmations, 1 proof record")

    def lookup(_):
        return sql("""
          set role authenticated;
          set request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}';
          select public.consume_cnpj_lookup();
        """, "tenant_test_client").strip()
    with ThreadPoolExecutor(max_workers=8) as pool:
        decisions = list(pool.map(lookup, range(16)))
    assert decisions.count("t") == 10 and decisions.count("f") == 6, "Concurrent requests bypassed quota"
    print("Lookup quota concurrency: 16 requests, 10 accepted, 6 denied")

    sql("""
      do $$ begin
        begin
          delete from auth.users where id='00000000-0000-4000-8000-000000000001';
          raise exception 'Owner deletion silently removed fiscal ownership';
        exception when foreign_key_violation then null; end;
      end $$;
    """)
    print("Retention: owner deletion blocked by foreign key")
finally:
    env.pop("POSTGRES_PASSWORD", None)
    if started:
        docker("rm", "--force", "--volumes", CONTAINER)
