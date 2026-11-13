import assert from "node:assert/strict";
import {test} from "node:test";
import {automaticAffiliateDraft,AUTOMATIC_AFFILIATE_EVIDENCE} from "../src/lib/nfse/automatic-affiliate.ts";
import {MEI_AFFILIATE_EVIDENCE} from "../src/lib/nfse/mei-affiliate.ts";
import {initialMeiValidityRepair,canExtendProfileValidity,type SavedFiscalProfile} from "../src/lib/nfse/profile-validity.ts";
const company={cnpj:"11222333000181",tax_regime:"mei",address:{municipality_code:"3550308"},opened_on:"2020-02-10"};
const today="2026-11-13",competence="2026-10-31";
function profile():SavedFiscalProfile{return {id:"00000000-0000-4000-8000-000000000001",version:1,configuration:automaticAffiliateDraft(company,today).profile,configuration_sha256:"a".repeat(64),valid_from:"2026-11-12",evidence_reference:MEI_AFFILIATE_EVIDENCE,created_at:"2026-11-13T01:00:00Z"};}
test("modelo inicial datado no cadastro pode usar abertura real sem alterar competência ou parâmetros",()=>{
  const before=profile(),snapshot=structuredClone(before);
  const repair=initialMeiValidityRepair(company,before,competence,today);assert.ok(repair);assert.equal(repair.validFrom,"2020-02-10");assert.match(repair.evidence,/não comprova opção histórica/);assert.deepEqual(before,snapshot);
  assert.ok(initialMeiValidityRepair(company,{...before,evidence_reference:AUTOMATIC_AFFILIATE_EVIDENCE},competence,today));
  assert.equal(initialMeiValidityRepair(company,{...before,created_at:"2026-11-12T01:00:00Z"},competence,today),null,"creation day must be checked in São Paulo, not UTC");
});
test("correção automática não toma perfil personalizado, outra versão ou data intencional como padrão",()=>{
  const before=profile();
  for(const patch of [{version:2},{evidence_reference:"Orientação fiscal personalizada"},{valid_from:"2026-11-01"},{configuration:{...(before.configuration as object),series:"2"}},{configuration:{...(before.configuration as object),description:"Serviço diferente"}},{configuration:{...(before.configuration as object),unknownField:"preserve"}},{created_at:"invalid"},{configuration:null}]){
    assert.equal(initialMeiValidityRepair(company,{...before,...patch},competence,today),null);
  }
  for(const patch of [{tax_regime:"simples"},{opened_on:null},{opened_on:"2026-11-01"}])assert.equal(initialMeiValidityRepair({...company,...patch},before,competence,today),null);
  assert.equal(initialMeiValidityRepair(company,before,"2026-02-30",today),null);
});
test("ajuste explícito não dispensa data válida, regime suportado, abertura e limites do perfil",()=>{
  const before=profile();assert.equal(canExtendProfileValidity(company,before,competence,today),true);
  for(const value of ["2026-11-12","2026-11-14","2026-02-30","2019-12-31","2027-01-01"])assert.equal(canExtendProfileValidity(company,before,value,today),false);
  assert.equal(canExtendProfileValidity({...company,tax_regime:"normal"},before,competence,today),false);
  assert.equal(canExtendProfileValidity(company,{...before,valid_from:"invalid"},competence,today),false);
});
