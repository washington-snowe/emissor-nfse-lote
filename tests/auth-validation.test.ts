import assert from "node:assert/strict";
import { test } from "node:test";
import { validateCredentials, validateSignupPhone } from "../src/lib/auth-validation.ts";

test("cadastro exige telefone com DDD e normaliza números para o perfil", () => {
  assert.equal(validateSignupPhone("(11) 99999-9999"), "+5511999999999");
  assert.equal(validateSignupPhone("11 2345-6789"), "+551123456789");
  assert.equal(validateSignupPhone("+1 (212) 555-0123"), "+12125550123");
  for (const value of [null, "", "99999-9999", "telefone", "(00) 99999-9999", "12345678901234567890"]) {
    assert.equal(validateSignupPhone(value), null);
  }
});

test("valida tipos e campos ausentes na fronteira do formulário", () => {
  assert.equal(validateCredentials(null, null).valid, false);
  assert.equal(
    validateCredentials(new Blob(["file"]), "password").valid,
    false,
  );
  for (const email of [
    "",
    "no-at-sign",
    "x@",
    "a b@site.example",
    `${"x".repeat(255)}@site.example`,
  ]) {
    assert.ok(validateCredentials(email, "password").fields.email);
  }
});

test("cadastro exige 12 caracteres e limita entradas excessivas", () => {
  assert.ok(
    validateCredentials("test@site.example", "a".repeat(11), true).fields
      .password,
  );
  assert.equal(
    validateCredentials("test@site.example", "a".repeat(12), true).valid,
    true,
  );
  assert.ok(
    validateCredentials("test@site.example", "a".repeat(129)).fields.password,
  );
});

test("login não aplica retrospectivamente o mínimo do cadastro e preserva senha", () => {
  const result = validateCredentials(" user@site.example ", " old password ");
  assert.equal(result.valid, true);
  assert.equal(result.email, "user@site.example");
  assert.equal(result.password, " old password ");
  assert.equal(validateCredentials("user@site.example", "short").valid, true);
});
