import assert from "node:assert/strict";
import { test } from "node:test";

const origin = process.env.SMOKE_BASE_URL;
test(
  "servidor real entrega páginas, protege painel e falha fechado sem configuração",
  { skip: !origin },
  async () => {
    const home = await fetch(`${origin}/`);
    assert.equal(home.status, 200);
    assert.equal(home.headers.get("x-content-type-options"), "nosniff");
    assert.equal(home.headers.get("x-frame-options"), "DENY");
    assert.match(await home.text(), /Explorar valores/);
    for (const path of ["/entrar", "/criar-conta", "/recuperar-senha"]) {
      const response = await fetch(`${origin}${path}`);
      assert.equal(response.status, 200);
      const html = await response.text();
      assert.match(html, /Acesso em preparação/);
      assert.doesNotMatch(html, /name="password"/);
    }
    for (const path of ["/painel", "/prototipo?tela=admin"]) {
      const panel = await fetch(`${origin}${path}`, { redirect: "manual" });
      assert.equal(panel.status, 307);
      assert.equal(panel.headers.get("location"), "/entrar");
    }
    const reset = await fetch(`${origin}/recuperar-senha/nova`, { redirect: "manual" });
    assert.equal(reset.status, 307);
    assert.equal(reset.headers.get("location"), "/recuperar-senha?status=link-invalido");
    const callback = await fetch(
      `${origin}/auth/callback?code=invalid&next=https://evil.example`,
      { redirect: "manual" },
    );
    assert.equal(callback.status, 503);
    assert.equal((await fetch(`${origin}/pagina-inexistente`)).status, 404);
  },
);
