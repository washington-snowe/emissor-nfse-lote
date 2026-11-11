import assert from "node:assert/strict";
import { test } from "node:test";
import { allowedNfseUrl, NFSE_BASES, nfseGet } from "../src/lib/nfse/http.ts";
import { structuralContract } from "../src/lib/nfse/contract.ts";

test("mTLS só aceita destinos oficiais do ambiente escolhido e não segue URLs de terceiros", async()=>{
  assert.ok(allowedNfseUrl("homologation",NFSE_BASES.homologation+"/nfse"));
  for (const url of ["http://sefin.producaorestrita.nfse.gov.br/API/SefinNacional/nfse",NFSE_BASES.production+"/nfse",NFSE_BASES.homologation+"/../outside","https://example.invalid/nfse","https://user:password@sefin.producaorestrita.nfse.gov.br/API/SefinNacional/nfse",NFSE_BASES.homologation+"/nfse#fragment"]) {
    assert.equal(allowedNfseUrl("homologation",url),null);
    await assert.rejects(nfseGet("homologation",url,{pfx:Buffer.from("synthetic"),password:"not-a-real-password"}),/Invalid fiscal destination/);
  }
});

test("documentação descoberta publica somente estrutura, sem exemplos ou descrições arbitrárias",()=>{
  // Structural OpenAPI fixture, not an official fiscal API contract or response.
  const fixture = {
    openapi: "3.0.1",
    info: { title: "fixture" },
    paths: {
      "/nfse": {
        post: {
          description: "PRIVATE-FIXTURE",
          requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/TestPayload" } } } },
          responses: {
            "200": {
              description: "PRIVATE-FIXTURE",
              content: { "application/json": { schema: { type: "object", properties: { testField: { type: "string", example: "PRIVATE-FIXTURE" } } } } },
            },
          },
        },
      },
    },
    components: {
      schemas: { TestPayload: { type: "object", properties: { testPayload: { type: "string", default: "PRIVATE-FIXTURE" } }, required: ["testPayload"] } },
    },
  };
  const result=structuralContract(fixture);
  assert.ok(result);
  assert.ok(!JSON.stringify(result).includes("PRIVATE-FIXTURE"));
  assert.ok(JSON.stringify(result).includes("testPayload"));
  assert.equal(structuralContract({}),null);
  assert.equal(structuralContract({swagger:"2.0",paths:{"/unrelated":{}}}),null);
});
