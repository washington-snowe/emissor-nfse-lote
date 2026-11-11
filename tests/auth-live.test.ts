import assert from "node:assert/strict";
import { test } from "node:test";

const origin = process.env.AUTH_LIVE_BASE_URL?.replace(/\/+$/, "");
const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const enabled = Boolean(origin);

// Explicit opt-in: these checks only read deployed endpoints and never create users or send mail.
test(
  "Auth real aceita a chave pública e exige confirmação de e-mail",
  { skip: !enabled },
  async () => {
    assert.ok(
      supabase && key,
      "Configure URL e publishable key no ambiente de teste.",
    );
    const response = await fetch(`${supabase}/auth/v1/settings`, {
      headers: { apikey: key },
      signal: AbortSignal.timeout(15000),
    });
    assert.equal(response.status, 200);
    const settings = await response.json();
    assert.equal(settings.disable_signup, false);
    assert.equal(settings.external.email, true);
    assert.equal(settings.mailer_autoconfirm, false);
  },
);

test(
  "produção oferece os formulários de cadastro e login configurados",
  { skip: !enabled },
  async () => {
    for (const path of ["/entrar", "/criar-conta"]) {
      const response = await fetch(`${origin}${path}`, {
        redirect: "manual",
        signal: AbortSignal.timeout(15000),
      });
      assert.equal(response.status, 200, path);
      const html = await response.text();
      assert.ok(
        html.includes('name="email"'),
        `Campo de e-mail ausente em ${path}`,
      );
      assert.ok(
        html.includes('name="password"'),
        `Campo de senha ausente em ${path}`,
      );
      assert.ok(
        !html.includes("Acesso em preparação"),
        `Auth indisponível em ${path}`,
      );
    }
  },
);

test(
  "painel de produção bloqueia visitante sem sessão e não permite cache compartilhado",
  { skip: !enabled },
  async () => {
    const response = await fetch(`${origin}/painel`, {
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
    });
    assert.equal(response.status, 307);
    const location = response.headers.get("location");
    assert.ok(location);
    assert.equal(new URL(location, origin).href, `${origin}/entrar`);
    assert.match(response.headers.get("cache-control") ?? "", /private/);
    assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  },
);

test(
  "callback de produção mantém o usuário na origem correta e ignora destino fornecido por terceiros",
  { skip: !enabled },
  async () => {
    const response = await fetch(
      `${origin}/auth/callback?next=https://untrusted.example`,
      {
        redirect: "manual",
        signal: AbortSignal.timeout(15000),
      },
    );
    assert.equal(response.status, 307);
    const location = response.headers.get("location");
    assert.ok(location);
    const destination = new URL(location, origin);
    assert.equal(
      destination.origin,
      origin,
      "NEXT_PUBLIC_SITE_URL deve corresponder à origem publicada.",
    );
    assert.equal(destination.pathname, "/entrar");
    assert.equal(destination.searchParams.get("status"), "confirmation-error");
    assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  },
);

test(
  "Supabase usa a origem pública e permite o callback de confirmação",
  { skip: !enabled },
  async () => {
    assert.ok(supabase && key);
    for (const callback of [undefined, `${origin}/auth/callback`]) {
      const url: URL = new URL(`${supabase}/auth/v1/verify`);
      // A deliberately invalid token cannot confirm a user or consume a real confirmation link.
      url.searchParams.set("token", "invalid-token");
      url.searchParams.set("type", "signup");
      if (callback) url.searchParams.set("redirect_to", callback);
      const response: Response = await fetch(url, {
        headers: { apikey: key },
        redirect: "manual",
        signal: AbortSignal.timeout(15000),
      });
      assert.ok([302, 303].includes(response.status));
      const location: string | null = response.headers.get("location");
      assert.ok(location);
      const destination: URL = new URL(location);
      assert.equal(
        destination.origin,
        origin,
        "Confira Site URL e Redirect URLs no Supabase.",
      );
      assert.equal(destination.pathname, callback ? "/auth/callback" : "/");
      assert.equal(
        new URLSearchParams(destination.hash.slice(1)).get("error_code"),
        "otp_expired",
      );
    }
  },
);
