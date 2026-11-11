import assert from "node:assert/strict";
import { test } from "node:test";
import { serviceKey } from "../src/lib/server-config.ts";
import { validWorkerAuthorization } from "../src/lib/worker-auth.ts";

test("chave privilegiada só existe em configuração de servidor e rejeita chaves públicas", () => {
  const jwt = (role: string) => `e30.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.signature`;
  for (const key of [undefined, "", "sb_publishable_test", jwt("anon"), "malformed", "sb_secret_short"])
    assert.equal(serviceKey({ SUPABASE_SERVICE_ROLE_KEY: key }), null);
  assert.equal(serviceKey({ SUPABASE_SERVICE_ROLE_KEY: jwt("service_role") }), jwt("service_role"));
  assert.equal(serviceKey({ SUPABASE_SERVICE_ROLE_KEY: "sb_secret_" + "x".repeat(40) }), "sb_secret_" + "x".repeat(40));
  assert.equal(serviceKey({ NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY: jwt("service_role") }), null);
});

test("processador recusa cron sem segredo forte, token incorreto ou autenticação ausente", () => {
  const secret = "test-only-" + "x".repeat(40);
  assert.ok(validWorkerAuthorization(`Bearer ${secret}`, secret));
  for (const [header, key] of [[null, secret], [`Bearer ${secret}`, undefined], ["Bearer short", "short"], [`Bearer ${secret}x`, secret], [`Bearer ${secret.slice(0,-1)}y`, secret]])
    assert.equal(validWorkerAuthorization(header ?? null, key ?? undefined), false);
});
