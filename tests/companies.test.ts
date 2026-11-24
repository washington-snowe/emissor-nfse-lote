import assert from "node:assert/strict";
import { test } from "node:test";
import {
  emptyCompany,
  formatCnpj,
  normalizeCnpj,
  validCnpj,
  normalizeRegistry,
  validateCompany,
} from "../src/lib/companies.ts";
import { fetchCnpj } from "../src/lib/cnpj-provider.ts";
import { assessCnpjEligibility } from "../src/lib/cnpj-eligibility.ts";

test("CNPJ valida dígitos numéricos e alfanuméricos sem descartar letras ou caracteres inválidos", () => {
  assert.equal(normalizeCnpj("12.abc.345/01de-35"), "12ABC34501DE35");
  for (const cnpj of ["11.222.333/0001-81", "12ABC34501DE35"])
    assert.equal(validCnpj(cnpj), true);
  for (const cnpj of [
    "00000000000000",
    "11111111111111",
    "11222333000182",
    "12ABC34501DE36",
    "11;222333000181",
    "１２ABC34501DE35",
  ])
    assert.equal(validCnpj(cnpj), false, cnpj);
});

test("máscara de CNPJ pontua da direita para a esquerda e preserva letras ao colar", () => {
  for (const [typed, expected] of [
    ["", ""], ["12", "12"], ["123", "1-23"], ["123456", "1234-56"],
    ["1234567", "1/2345-67"], ["1234567890", "1.234/5678-90"],
    [" 12.abc.345/01de-35 ", "12.ABC.345/01DE-35"],
    ["11222333000181000", "11.222.333/0001-81"],
  ]) assert.equal(formatCnpj(typed), expected);
});

test("normalização preenche dados disponíveis sem coletar sócios e sem inventar enquadramento", () => {
  const data = normalizeRegistry(
    {
      cnpj: "11222333000181",
      razao_social: "Empresa de teste",
      nome_fantasia: "Teste",
      codigo_municipio_ibge: 3550308,
      cnae_fiscal: 7319002,
      cnaes_secundarios: [{ codigo: 6201501, descricao: "Atividade" }],
      qsa: [{ cpf: "não coletar" }],
      opcao_pelo_mei: null,
      opcao_pelo_simples: null,
    },
    "11222333000181",
  );
  assert.ok(data);
  assert.equal(data.municipality_code, "3550308");
  assert.equal(data.main_cnae, "7319002");
  assert.equal(data.tax_regime, "");
  assert.equal(data.mei_option, null);
  const malformed = normalizeRegistry({ cnpj: "11222333000181", razao_social: "Teste", codigo_municipio_ibge: 123, cep: "Rua12ABC345678" }, "11222333000181");
  assert.equal(malformed?.municipality_code, "");
  assert.equal(malformed?.postal_code, "");
  assert.ok(!JSON.stringify(data).includes("não coletar"));
  assert.equal(
    normalizeRegistry(
      { cnpj: "12ABC34501DE35", razao_social: "Outro" },
      "11222333000181",
    ),
    null,
  );
});

test("validação de gravação limita campos, datas, regime e atividades no backend", () => {
  const input = {
    ...emptyCompany,
    cnpj: "11222333000181",
    legal_name: "Empresa de teste",
    tax_regime: "mei",
  };
  assert.ok(validateCompany(input).data);
  for (const patch of [
    { tax_regime: "normal" },
    { legal_name: "" },
    { legal_name: "x".repeat(201) },
    { opened_on: "2026-02-30" },
    { state: "XX" },
    { secondary_cnaes: [null] },
  ])
    assert.equal(validateCompany({ ...input, ...patch }).data, undefined);
  assert.ok(
    !("tenant_id" in validateCompany({ ...input, tenant_id: "forjado" }).data!),
  );
});

test("consulta confirma cobertura de MEI, ME e Simples e mantém a situação cadastral como próxima etapa", () => {
  const registry = {
    ...emptyCompany, city: "VÁRZEA DA PALMA", state: "MG",
    registration_status: "ATIVA", company_size: "DEMAIS", mei_option: false, simples_option: false,
  };
  assert.deepEqual(assessCnpjEligibility({ ...registry, mei_option: true, simples_option: true }), {
    status: "eligible", profile: "MEI", location: "VÁRZEA DA PALMA / MG", nextStep: "setup",
  });
  assert.deepEqual(assessCnpjEligibility({ ...registry, simples_option: true }), {
    status: "eligible", profile: "Simples Nacional", location: "VÁRZEA DA PALMA / MG", nextStep: "assisted",
  });
  assert.deepEqual(assessCnpjEligibility({ ...registry, company_size: "MICRO EMPRESA" }), {
    status: "eligible", profile: "Microempresa (ME)", location: "VÁRZEA DA PALMA / MG", nextStep: "assisted",
  });
  const microenterprise = normalizeRegistry({ cnpj: "11222333000181", razao_social: "Empresa de teste", codigo_porte: 1 }, "11222333000181");
  assert.ok(microenterprise);
  assert.equal(assessCnpjEligibility(microenterprise).status, "eligible");
  assert.equal(assessCnpjEligibility(registry).status, "unsupported");
  assert.equal(assessCnpjEligibility({ ...registry, simples_option: null }).status, "unconfirmed");
  assert.equal(assessCnpjEligibility({ ...registry, registration_status: "", mei_option: true }).status, "eligible");
  assert.deepEqual(assessCnpjEligibility({ ...registry, registration_status: "BAIXADA", mei_option: true }), {
    status: "eligible", profile: "MEI", location: "VÁRZEA DA PALMA / MG", nextStep: "regularize",
  });
  assert.equal(assessCnpjEligibility({ ...registry, registration_status: "BAIXADA" }).status, "inactive");
});

test("provedor recusa respostas trocadas e falhas e não consulta CNPJ inválido", async () => {
  let calls = 0;
  const mock = (status: number, data: unknown) =>
    (async () => {
      calls++;
      return new Response(JSON.stringify(data), { status });
    }) as typeof fetch;
  assert.ok((await fetchCnpj("invalid", mock(200, {}))).error);
  assert.equal(calls, 0);
  assert.ok(
    (
      await fetchCnpj(
        "11222333000181",
        mock(200, { cnpj: "12ABC34501DE35", razao_social: "Troca" }),
      )
    ).error,
  );
  for (const status of [404, 429, 500])
    assert.ok((await fetchCnpj("11222333000181", mock(status, {}))).error);
  assert.ok(
    (
      await fetchCnpj("11222333000181", (async () => {
        throw new Error("timeout");
      }) as typeof fetch)
    ).error,
  );
});
