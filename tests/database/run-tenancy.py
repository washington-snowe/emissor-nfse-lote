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
        if not docker("exec", CONTAINER, "pg_isready", "-U", "postgres", check=False).returncode:
            break
        time.sleep(1)
    else:
        raise RuntimeError("PostgreSQL did not become ready")

    print("PostgreSQL", sql("show server_version;").strip())
    sql((ROOT / "tests/database/bootstrap.sql").read_text())
    sql((ROOT / "supabase/migrations/202611110001_tenants.sql").read_text())
    output = sql((ROOT / "tests/database/tenancy.sql").read_text(), "tenant_test_client")
    match = re.search(r"^ASSERTIONS=(\d+)$", output, re.M)
    assert match and int(match[1]) >= 25, "Isolation assertions did not complete"
    print(f"RLS/privileges/identity: {match[1]} assertions passed")

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
