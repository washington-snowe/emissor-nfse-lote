import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { automaticAffiliateDraft, AUTOMATIC_AFFILIATE_EVIDENCE } from "../src/lib/nfse/automatic-affiliate.ts";
import { automaticCertificateCheck } from "../src/lib/nfse/automatic-certificate-check.ts";
import { certificateVerificationMessage } from "../src/lib/certificate-verification-state.ts";
import { validateFiscalSchema } from "../src/lib/nfse/schema.ts";
import { buildDps } from "../src/lib/nfse/dps.ts";

const official = JSON.parse(readFileSync(new URL("../integrations/nfse/contracts/sefin-homologation-v1.structural.json",import.meta.url),"utf8"));
const company={cnpj:"11222333000181",tax_regime:"mei",address:{municipality_code:"3550308"},opened_on:"2025-06-10"};
const identity={cnpj:company.cnpj,municipality:"3550308",series:"1"};
const validMissing=Buffer.from('{"tipoAmbiente":2,"erro":{"codigo":"E0002"}}');

test("MEI ganha modelo automático e data cadastral, sem fingir confirmação do titular ou opção histórica",async()=>{
  const result=automaticAffiliateDraft(company,"2026-11-12");
  assert.ok(result.profile);
  assert.equal(result.validFrom,"2025-06-10");
  assert.equal(result.profile.nationalTaxCode,"170601");
  assert.equal(result.profile.issRate,undefined);
  assert.equal(result.profile.issWithholding,"1");
  assert.ok(!AUTOMATIC_AFFILIATE_EVIDENCE.includes("confirmadas pelo titular"));
  const probe=buildDps({environment:"homologation",issuerCnpj:company.cnpj,profile:result.profile,dpsNumber:"1",amount:"1.00",competenceDate:"2026-10-31",emissionTime:"2026-11-12T12:00:00+00:00",recipient:{kind:"cnpj",country:"BR",document:company.cnpj,legalName:"Teste sintético"}});
  assert.ok(await validateFiscalSchema(probe.xml,"DPS"));
  assert.equal(automaticAffiliateDraft({...company,opened_on:null},"2026-11-12").validFrom,"2026-11-12");
});
test("ME/EPP recebe serviço pré-configurado e pendência honesta, sem inventar percentual de apuração",()=>{
  const result=automaticAffiliateDraft({...company,tax_regime:"simples"},"2026-11-12");
  assert.equal(result.reason,"simples_data_required");
  assert.equal(result.profile,undefined);
  assert.equal(result.common?.nationalTaxCode,"170601");
  assert.ok(!JSON.stringify(result).includes('"percent"'));
  assert.equal(automaticAffiliateDraft({...company,tax_regime:"normal"},"2026-11-12").reason,"unsupported_regime");
  assert.equal(automaticAffiliateDraft({...company,address:{}},"2026-11-12").reason,"company_incomplete");
});
function dependencies() {
  const material={pfx:Buffer.from("SYNTHETIC ONLY"),password:"NOT A REAL PASSWORD",metadata:{subject_cnpj:company.cnpj}};
  const calls:string[]=[];
  return {material,calls,deps:{load:async()=>{calls.push("load");return material;},contract:async()=>official as unknown,
    get:async(url:string)=>{calls.push(url);return {status:404,body:validMissing};}}};
}
test("verificação automática consulta SEFIN com identidade própria e não envia DPS nem exige botão",async()=>{
  const {deps,material,calls}=dependencies();
  const result=await automaticCertificateCheck(identity,deps);
  assert.deepEqual(result,{code:"sefin_verified",http:404});
  assert.equal(calls.length,2);
  assert.match(calls[1],/^https:\/\/sefin\.producaorestrita\.nfse\.gov\.br\/SefinNacional\/dps\/DPS355030821122233300018100001000000000000001$/);
  assert.ok(material.pfx.every(x=>x===0));
});
test("HTML 404, ADN, erro de autenticação e timeout não viram conexão verificada",async()=>{
  for(const [status,body] of [[404,Buffer.from('<html>404</html>')],[200,Buffer.from('{"parametrosConvenio":{}}')],[401,validMissing],[403,validMissing],[503,validMissing],[404,Buffer.from('{"tipoAmbiente":1,"erro":{"codigo":"E0002"}}')]] as const){
    const {deps,material}=dependencies();deps.get=async()=>({status,body});
    assert.equal((await automaticCertificateCheck(identity,deps)).code,"sefin_unavailable");
    assert.ok(material.pfx.every(x=>x===0));
  }
  const {deps,material}=dependencies();deps.get=async()=>{throw new Error("DO NOT EXPOSE RAW SERVICE ERROR");};
  assert.deepEqual(await automaticCertificateCheck(identity,deps),{code:"service_unavailable",http:0});
  assert.ok(material.pfx.every(x=>x===0));
});
test("certificado estrangeiro, município inválido e contrato ausente falham sem consulta fiscal",async()=>{
  const foreign=dependencies();foreign.material.metadata.subject_cnpj="11444777000161";
  assert.equal((await automaticCertificateCheck(identity,foreign.deps)).code,"certificate_unavailable");
  assert.deepEqual(foreign.calls,["load"]);
  assert.ok(foreign.material.pfx.every(x=>x===0));
  const invalid=dependencies();
  assert.equal((await automaticCertificateCheck({...identity,municipality:"invalid"},invalid.deps)).code,"company_incomplete");
  assert.deepEqual(invalid.calls,[]);
  for(const contract of [null,{}]){
    const d=dependencies();d.deps.contract=async()=>contract;
    assert.equal((await automaticCertificateCheck(identity,d.deps)).code,contract ? "contract_unsupported" : "contract_missing");
    assert.deepEqual(d.calls,["load"]);assert.ok(d.material.pfx.every(x=>x===0));
  }
});
test("mensagens distinguem acesso mTLS de autorização e não prometem tentativas esgotadas",()=>{
  const base={status:"verified",result_code:"sefin_verified",http_status:404,updated_at:"2026-11-12T12:00:00Z",verified_at:"2026-11-12T12:00:00Z",next_attempt:null};
  assert.match(certificateVerificationMessage(base),/Cada nota ainda passa/);
  assert.ok(!certificateVerificationMessage({...base,status:"attention",result_code:"contract_missing"}).includes("agendada"));
  assert.match(certificateVerificationMessage({...base,status:"attention",result_code:"sefin_unavailable",next_attempt:"2026-11-12T12:05:00Z"}),/agendada/);
});
