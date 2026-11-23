import assert from "node:assert/strict";
import { test } from "node:test";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { isSessionCookie, sessionCookieOptions } from "../src/lib/supabase/session-cookies.ts";

test("Supabase writes a server-only cookie when a password sign-in succeeds", async () => {
  const url = "https://synthetic-project.invalid";
  const written: Array<{ name: string; value: string; options: CookieOptions }> = [];
  const client = createServerClient(url, "sb_publishable_synthetic_fixture", {
    cookieOptions: sessionCookieOptions,
    cookies: {
      getAll: () => [],
      setAll: values => { written.push(...values); },
    },
    global: {
      fetch: async input => {
        const request = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
        assert.equal(request.pathname, "/auth/v1/token");
        assert.equal(request.searchParams.get("grant_type"), "password");
        return Response.json({
          access_token: "synthetic-access-token",
          refresh_token: "synthetic-refresh-token",
          expires_in: 3600,
          token_type: "bearer",
          user: { id: "00000000-0000-4000-8000-000000000001", email: "fixture@example.invalid" },
        });
      },
    },
  });
  const result = await client.auth.signInWithPassword({ email: "fixture@example.invalid", password: "synthetic password" });
  assert.equal(result.error, null);
  assert.ok(written.some(cookie => isSessionCookie(cookie.name, url) && cookie.value.length > 0));
  assert.ok(written.every(cookie => cookie.options.httpOnly && cookie.options.sameSite === "lax" &&
    cookie.options.path === "/" && cookie.options.secure === (process.env.NODE_ENV === "production")));
  assert.equal(isSessionCookie("sb-synthetic-project-auth-token.1", url), true);
  assert.equal(isSessionCookie("sb-synthetic-project-auth-token-code-verifier", url), false);
  assert.equal(isSessionCookie("sb-other-auth-token", url), false);
});
