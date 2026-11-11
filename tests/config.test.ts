import assert from "node:assert/strict";
import { test } from "node:test";
import { getSiteOrigin, getSupabaseConfig } from "../src/lib/config.ts";

test("ausência ou configuração incompleta desabilita autenticação", () => {
  assert.equal(getSupabaseConfig({}), null);
  assert.equal(
    getSupabaseConfig({
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
    }),
    null,
  );
});

test("URL Supabase exige HTTPS sem credenciais, caminho, query ou fragmento", () => {
  for (const url of [
    "javascript:alert(1)",
    "http://project.supabase.co",
    "https://user:password@project.supabase.co",
    "https://project.supabase.co/x",
    "https://project.supabase.co?token=secret",
    "https://project.supabase.co#x",
    "invalid",
  ]) {
    assert.equal(
      getSupabaseConfig({
        NEXT_PUBLIC_SUPABASE_URL: url,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
      }),
      null,
      url,
    );
  }
  assert.deepEqual(
    getSupabaseConfig({
      NEXT_PUBLIC_SUPABASE_URL: " https://project.supabase.co/ ",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
    }),
    { url: "https://project.supabase.co", key: "sb_publishable_test" },
  );
});

test("callbacks usam origem explícita segura sem confiar no Host da requisição", () => {
  for (const origin of [
    undefined,
    "//evil.example",
    "https://user@site.example",
    "https://site.example/redirect",
    "https://site.example?next=evil",
    "https://site.example/#evil",
    "http://site.example",
    "http://localhost:3000",
  ]) {
    assert.equal(
      getSiteOrigin({ NEXT_PUBLIC_SITE_URL: origin, NODE_ENV: "production" }),
      null,
      origin,
    );
  }
  assert.equal(
    getSiteOrigin({
      NEXT_PUBLIC_SITE_URL: "https://site.example/",
      NODE_ENV: "production",
    }),
    "https://site.example",
  );
  assert.equal(
    getSiteOrigin({
      NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
      NODE_ENV: "development",
    }),
    "http://localhost:3000",
  );
});

test("chaves privilegiadas são recusadas na configuração pública", () => {
  const jwt = (role: string) =>
    `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.signature`;
  for (const key of [
    "sb_secret_must_not_be_public",
    jwt("service_role"),
    "not-a-key",
  ]) {
    assert.equal(
      getSupabaseConfig({
        NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key,
      }),
      null,
    );
  }
  assert.ok(
    getSupabaseConfig({
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: jwt("anon"),
    }),
  );
});
