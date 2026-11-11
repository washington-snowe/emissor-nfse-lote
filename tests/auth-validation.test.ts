import assert from "node:assert/strict";
import { test } from "node:test";
import { validateCredentials } from "../src/lib/auth-validation.ts";

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
