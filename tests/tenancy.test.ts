import assert from "node:assert/strict";
import { test } from "node:test";
import { getTenantContext } from "../src/lib/tenancy.ts";

const tenantId = "00000000-0000-4000-8000-000000000001";
const user = { id: "00000000-0000-4000-8000-000000000002" };

test("não resolve tenant sem identidade validada no servidor", async () => {
  for (const auth of [
    { data: { user: null }, error: null },
    { data: { user }, error: { code: "bad_jwt" } },
  ]) {
    let calls = 0;
    const result = await getTenantContext({
      auth: { getUser: async () => auth },
      rpc: async () => {
        calls++;
        return { data: tenantId, error: null };
      },
    });
    assert.equal(result.status, "unauthenticated");
    assert.equal(calls, 0);
  }
});

test("tenant vem da RPC sem aceitar identificador ou dono do navegador", async () => {
  const result = await getTenantContext({
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    rpc: async (...args) => {
      assert.deepEqual(args, ["ensure_tenant"]);
      return { data: tenantId, error: null };
    },
  });
  assert.deepEqual(result, { status: "ready", user, tenantId });
});

test("migração ausente, erro de transporte ou resposta inválida falham fechados", async () => {
  for (const tenant of [
    { data: null, error: { code: "PGRST202" } },
    { data: tenantId, error: { code: "42501" } },
    { data: "untrusted-id", error: null },
    { data: null, error: null },
  ]) {
    const result = await getTenantContext({
      auth: { getUser: async () => ({ data: { user }, error: null }) },
      rpc: async () => tenant,
    });
    assert.equal(result.status, "unavailable");
    assert.ok(!("tenantId" in result));
  }
  const result = await getTenantContext({
    auth: {
      getUser: async () => {
        throw new Error("network");
      },
    },
    rpc: async () => ({ data: tenantId, error: null }),
  });
  assert.equal(result.status, "unavailable");
});
