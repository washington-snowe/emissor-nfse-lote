import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { diagnoseSefinAccess, sefinEnvironmentDiagnostic } from "../src/lib/nfse/sefin-diagnostic.ts";
import { NfseTransportError } from "../src/lib/nfse/transport-error.ts";

const official=JSON.parse(readFileSync(new URL("../integrations/nfse/contracts/sefin-homologation-v1.structural.json",import.meta.url),"utf8"));
const identity={cnpj:"11222333000181",municipality:"3550308",series:"1"};
const sensitive="PRIVATE_RAW_BODY_password_token_11222333000181_https://private.example";
function fixture(body: string, status=404) {
  const material={pfx:Buffer.from("SYNTHETIC ONLY"),password:"SYNTHETIC ONLY",metadata:{subject_cnpj:identity.cnpj}};
  const calls:string[]=[];
  const deps={load:async()=>{calls.push("load");return material;},contract:async()=>official as unknown,
    get:async(url:string)=>{calls.push(url);return {status,body:Buffer.from(body)};}};
  return {material,calls,deps};
}
test("diagnóstico SEFIN usa o mesmo GET de identidade própria, sanitiza e zera A1 sem reservar nem transmitir",async()=>{
  const h=fixture(JSON.stringify({tipoAmbiente:2,erro:{codigo:"E0002",descricao:sensitive}}));
  const {result,details}=await diagnoseSefinAccess(identity,h.deps,"abcdef123456");
  assert.deepEqual(result,{code:"sefin_verified",http:404});
  assert.match(details,/nfse-sefin-v3 \(abcdef1\)/);
  assert.match(details,/HTTP 404 · JSON/);
  assert.match(details,/Ambiente declarado: homologação/);
  assert.match(details,/Códigos fiscais: E0002/);
  assert.match(details,/compatível com o contrato: sim/);
  assert.match(details,/Nenhuma nota foi enviada/);
  assert.ok(!details.includes(sensitive));assert.ok(!details.includes(identity.cnpj));
  assert.deepEqual(h.calls,["load","https://sefin.producaorestrita.nfse.gov.br/SefinNacional/dps/DPS355030821122233300018100001000000000000001"]);
  assert.ok(h.material.pfx.every(byte=>byte===0));
});
test("representação distingue enum textual, nulo e zero; somente 404/E2404 admite compatibilidade de acesso",async()=>{
  for(const [value,expected] of [[0,'número 0'],[1,'número 1 (produção)'],[2,'número 2 (homologação)'],['2','texto: 2'],['PRODUCAO_RESTRITA','texto: PRODUCAO_RESTRITA'],[null,'nulo'],[sensitive,'outro texto (valor omitido)'],[11222333000181,'outro número (valor omitido)'],[{},'objeto'],[[],'lista'],[false,'booleano']] as const){
    assert.equal(sefinEnvironmentDiagnostic(value),expected);
    const h=fixture(JSON.stringify({tipoAmbiente:value,erro:{codigo:'E2404'}}));
    const diagnostic=await diagnoseSefinAccess(identity,h.deps);
    assert.ok(diagnostic.details.includes(`Representação do ambiente: ${expected}`));
    assert.ok(!diagnostic.details.includes(sensitive));assert.ok(!diagnostic.details.includes(identity.cnpj));
    assert.equal(diagnostic.result.code,value===2||value===0?'sefin_verified':'sefin_unavailable');
    if(value===0){
      assert.match(diagnostic.details,/Resposta compatível com o contrato: não/);
      assert.match(diagnostic.details,/Critério de acesso: compatibilidade restrita GET DPS · 404\/E2404 · ambiente 0/);
    }
  }
});
test("404 genérico, HTML e ambiente incorreto continuam bloqueados sem copiar corpo ou mensagens",async()=>{
  for(const [body,format,environment,generic] of [
    [JSON.stringify({Message:sensitive}),"JSON","ausente","presente"],
    [`<html>${sensitive}</html>`,"HTML","ausente","ausente"],
    [JSON.stringify({tipoAmbiente:1,erro:{codigo:"E0002",descricao:sensitive}}),"JSON","produção","ausente"],
    [JSON.stringify({tipoAmbiente:"2",erro:{codigo:"E0002"}}),"JSON","não reconhecido","ausente"],
    ["","vazio","ausente","ausente"],
    [JSON.stringify([sensitive]),"JSON","ausente","ausente"],
  ]){
    const h=fixture(body),diagnostic=await diagnoseSefinAccess(identity,h.deps,sensitive);
    assert.equal(diagnostic.result.code,"sefin_unavailable");
    assert.ok(diagnostic.details.includes(`HTTP 404 · ${format}`));
    assert.ok(diagnostic.details.includes(`Ambiente declarado: ${environment}`));
    assert.ok(diagnostic.details.includes(`Mensagem genérica da API: ${generic}`));
    assert.ok(!diagnostic.details.includes(sensitive));assert.match(diagnostic.details,/\(local\)/);
    assert.ok(h.material.pfx.every(byte=>byte===0));
  }
});
test("códigos são limitados a Edddd, sem aceitar schema divergente ou exportar chaves desconhecidas",async()=>{
  const h=fixture(JSON.stringify({tipoAmbiente:2,errors:[{code:sensitive},{code:"E0002"},{code:"E0002"},...Array.from({length:20},(_,i)=>({code:`E${String(i+10).padStart(4,"0")}`}))]}));
  const diagnostic=await diagnoseSefinAccess(identity,h.deps);
  assert.equal(diagnostic.result.code,"sefin_unavailable");assert.match(diagnostic.details,/Estrutura de erro: lista/);
  assert.ok(!diagnostic.details.includes(sensitive));
  assert.equal(diagnostic.details.match(/E\d{4}/g)?.length,10);
});
test("diagnóstico distingue falhas locais e de transporte sem vazar exceções ou fazer GET indevido",async()=>{
  const invalid=fixture("{}");
  assert.equal((await diagnoseSefinAccess({...identity,municipality:"bad"},invalid.deps)).result.code,"company_incomplete");
  assert.deepEqual(invalid.calls,[]);
  const failed=fixture("{}");failed.deps.load=async()=>{throw new Error(sensitive);};
  const load=await diagnoseSefinAccess(identity,failed.deps);
  assert.equal(load.result.code,"certificate_unavailable");assert.match(load.details,/carregamento não concluído/);assert.ok(!load.details.includes(sensitive));assert.deepEqual(failed.calls,[]);
  const missing=fixture("{}");missing.deps.contract=async()=>null;
  assert.equal((await diagnoseSefinAccess(identity,missing.deps)).result.code,"contract_missing");assert.deepEqual(missing.calls,["load"]);assert.ok(missing.material.pfx.every(x=>x===0));
  const transport=fixture("{}");transport.deps.get=async()=>{throw new NfseTransportError("timeout");};
  const timeout=await diagnoseSefinAccess(identity,transport.deps);
  assert.equal(timeout.result.code,"service_unavailable");assert.match(timeout.details,/Transporte: timeout/);assert.ok(transport.material.pfx.every(x=>x===0));
});
