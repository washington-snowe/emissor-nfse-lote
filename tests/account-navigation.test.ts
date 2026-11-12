import assert from "node:assert/strict";
import { test } from "node:test";
import { chooseCompany, workspaceDestination } from "../src/lib/workspace-navigation.ts";
import { accountProfileInput, loginChangeInput, validReferralCode } from "../src/lib/account.ts";
import { mergeFiscalSection, profileFromForm, parseFiscalProfile } from "../src/lib/nfse/profile.ts";
import { limitedText } from "../src/lib/limited-body.ts";
test("empresa preferida só resolve entre empresas próprias; atalhos não aceitam destinos externos",()=>{
 const a={id:"00000000-0000-4000-8000-000000000001",legal_name:"Synthetic A",cnpj:"11222333000181"},b={...a,id:"00000000-0000-4000-8000-000000000002"};
 assert.equal(chooseCompany([a,b],b.id)?.id,b.id);assert.equal(chooseCompany([a],b.id)?.id,a.id);assert.equal(chooseCompany([],b.id),null);
 assert.equal(workspaceDestination("service",a.id),`/painel/empresas/${a.id}/fiscal?secao=servico`);assert.equal(workspaceDestination("imports",b.id),`/painel/importacoes?empresa=${b.id}`);assert.equal(workspaceDestination("https://evil.example",a.id),"/painel");assert.equal(workspaceDestination("companies","../foreign"),"/painel/empresas");
});
test("perfil e alterações de login validam entradas e exigem senha atual",()=>{
 const form=new FormData();form.set("display_name"," Synthetic owner ");form.set("phone","+55 (11) 0000-0000");assert.deepEqual(accountProfileInput(form),{name:"Synthetic owner",phone:"+55 (11) 0000-0000"});
 form.set("display_name","owner\u0000");assert.equal(accountProfileInput(form),null);
 const login=new FormData();login.set("kind","password");login.set("value","synthetic-new-password");login.set("confirm_password","synthetic-new-password");assert.equal(loginChangeInput(login),null);login.set("current_password","synthetic-current");assert.equal(loginChangeInput(login)?.kind,"password");login.set("confirm_password","mismatch");assert.equal(loginChangeInput(login),null);
 assert(validReferralCode("a".repeat(20)));assert(!validReferralCode("../foreign"));
});
test("edições de Serviço e Avançado preservam a outra seção a partir do perfil atual do servidor",()=>{
 const profile=parseFiscalProfile({issuerMunicipality:"3550308",series:"1",specialRegime:"0",serviceMunicipality:"3550308",nationalTaxCode:"010101",description:"Synthetic service",issTaxation:"1",issWithholding:"1",totals:{mode:"not_informed"}},"11222333000181","mei");assert(profile);
 const form=new FormData();for(const [key,value] of Object.entries({serviceMunicipality:"3550308",nationalTaxCode:"010101",description:"Edited synthetic service",issTaxation:"1",issWithholding:"1",series:"49999",version:"2",validFrom:"2026-01-01",evidence:"Synthetic"}))form.set(key,value);
 const merged=mergeFiscalSection(profile,form,"service"),parsed=parseFiscalProfile(profileFromForm(merged),"11222333000181","mei");assert(parsed);assert.equal(parsed.series,"1");assert.equal(parsed.description,"Edited synthetic service");assert.equal(merged.get("version"),"2");
});
test("limite do corpo vale para streaming sem Content-Length e preserva bytes UTF-8 válidos",async()=>{
 const body=new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode("ç"));controller.enqueue(new TextEncoder().encode("ão"));controller.close();}});
 assert.equal(await limitedText(body,10),"ção");
 const oversized=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(6));controller.enqueue(new Uint8Array(6));controller.close();}});await assert.rejects(()=>limitedText(oversized,10));
});
