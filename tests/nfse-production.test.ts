import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {executeFiscalJob,type FiscalJob} from '../src/lib/nfse/execute.ts';
import {supportedNfseContract,verifiedSefinLookup} from '../src/lib/nfse/api-contract.ts';
import {inspectOwnSefinTransport,ownSefinLookupId,productionDpsAvailability} from '../src/lib/nfse/transport-proof.ts';
import {validateFiscalSchema} from '../src/lib/nfse/schema.ts';
import {signDps} from '../src/lib/nfse/signature.ts';
import {verifyOfficialNfseContents} from '../src/lib/nfse/receipt.ts';
import {selectedFiscalEnvironment,fiscalEnvironmentEnabled} from '../src/lib/nfse/environment.ts';
import {identity,signedDps,fiscalProfile,recipient,nfseFixture} from './helpers/fiscal-fixture.ts';

// Synthetic keys, HTTP and queue boundaries; these tests never reach a fiscal service.
const holder=identity(),service=identity(),signed=signedDps(holder,'production'),key='1'.repeat(50);
const raw=JSON.parse(readFileSync(new URL('../integrations/nfse/contracts/sefin-homologation-v1.structural.json',import.meta.url),'utf8'));
type Dependencies=Parameters<typeof executeFiscalJob>[1];
function scenario(mode:'prepare'|'reconcile'='prepare'){
 const events:string[]=[],pfx=Buffer.from('SYNTHETIC ONLY');let original=signed.xml;
 const job:FiscalJob={id:'00000000-0000-4000-8000-000000000001',tenant_id:'00000000-0000-4000-8000-000000000002',company_id:'00000000-0000-4000-8000-000000000003',lease_token:'00000000-0000-4000-8000-000000000004',mode,environment:'production',issuer_cnpj:'11222333000181',profile_snapshot:fiscalProfile,competence_date:'2026-10-31',amount:'11.01',foreign_amount:null,dps_number:mode==='reconcile'?'1':null,dps_id:mode==='reconcile'?signed.id:null,recipient,intermediary:null,signed_dps_xml:mode==='reconcile'?signed.xml:null,holder_certificate_pem:mode==='reconcile'?holder.certificatePem:null};
 const deps:Dependencies={productionEnabled:true,contract:supportedNfseContract(raw)!,remainingMs:()=>45_000,
  loadMaterial:async()=>{events.push('A1');return {...holder,pfx,password:'synthetic',certificateId:'00000000-0000-4000-8000-000000000005'};},
  identity:async()=>{events.push('reserve');return {id:signed.id,number:'1'};},
  productionIdentity:async()=>{events.push('unused');return 'unused';},sign:signDps,
  validate:xml=>validateFiscalSchema(xml,'DPS','production-20260209'),
  begin:async(_material,xml)=>{events.push('intent');original=xml;assert.match(xml,/<tpAmb>1<\/tpAmb>/);assert.ok(!xml.includes('<finNFSe>'));return true;},
  release:async reason=>{events.push('release:'+reason);},
  request:async(method,url)=>{events.push(method);assert.ok(url.startsWith('https://sefin.nfse.gov.br/SefinNacional/'));
   return {status:method==='POST'?201:200,body:Buffer.from(JSON.stringify(url.includes('/dps/')?{tipoAmbiente:1,chaveAcesso:key}:{tipoAmbiente:1,chaveAcesso:key,nfseXmlGZipB64:gzipSync(Buffer.from(nfseFixture(original,service,key))).toString('base64')}))};},
  receipt:(xml,accessKey,signedDps,holderCert,dpsId)=>verifyOfficialNfseContents(xml,{accessKey,signedDps,holderCert,dpsId,issuerCnpj:job.issuer_cnpj,environment:'production'}),
  finish:async outcome=>{events.push('finish:'+outcome);}};
 return {job,deps,events,pfx};
}
test('produção exige flag própria e verificação de identidade antes de abrir A1 ou transmitir',async()=>{
 assert.equal(selectedFiscalEnvironment({NFSE_HOMOLOGATION_ENABLED:'true'}),'homologation');
 assert.equal(fiscalEnvironmentEnabled('production',{NFSE_HOMOLOGATION_ENABLED:'true'}),false);
 for(const flag of [undefined,false]){const s=scenario();s.deps.productionEnabled=flag;await executeFiscalJob(s.job,s.deps);assert.deepEqual(s.events,['release:transmission_disabled']);}
 const s=scenario();delete s.deps.productionIdentity;await executeFiscalJob(s.job,s.deps);assert.deepEqual(s.events,['release:transmission_disabled']);
});
test('produção usa XML de produção, prova identidade livre, um POST após intenção e valida recibo completo',async()=>{
 const s=scenario();await executeFiscalJob(s.job,s.deps);
 assert.deepEqual(s.events,['A1','reserve','unused','intent','POST','finish:authorized']);assert.ok(s.pfx.every(x=>x===0));
 for(const availability of ['used','unverified'] as const){const blocked=scenario();blocked.deps.productionIdentity=async()=>availability;await executeFiscalJob(blocked.job,blocked.deps);assert.ok(!blocked.events.includes('intent'));assert.ok(!blocked.events.includes('POST'));assert.ok(blocked.events.includes('release:'+(availability==='used'?'identity_in_use':'production_not_ready')));}
});
test('produção reconcilia somente com GET mesmo com emissão desativada; não aceita envelope de outro ambiente',async()=>{
 const s=scenario('reconcile');s.deps.productionEnabled=false;await executeFiscalJob(s.job,s.deps);assert.deepEqual(s.events,['A1','GET','GET','finish:authorized']);
 for(const value of [{tipoAmbiente:2},{tipoAmbiente:0},{tipoAmbiente:1,idDPS:'FOREIGN'},{}]){
  const bad=scenario('reconcile');bad.deps.request=async()=>{bad.events.push('GET');return {status:200,body:Buffer.from(JSON.stringify({...value,chaveAcesso:key}))};};await executeFiscalJob(bad.job,bad.deps);assert.deepEqual(bad.events,['A1','GET','finish:uncertain']);
 }
});
test('POST de produção com rejeição de outro ambiente fica incerto sem repetir envio',async()=>{
 for(const environment of [0,2,undefined]){const s=scenario();s.deps.request=async()=>{s.events.push('POST');return {status:400,body:Buffer.from(JSON.stringify({tipoAmbiente:environment,idDPS:signed.id,erros:[{codigo:'E0008'}]}))};};await executeFiscalJob(s.job,s.deps);assert.equal(s.events.filter(x=>x==='POST').length,1);assert.ok(s.events.includes('finish:uncertain'));}
});
test('prova SEFIN produção exige ambiente 1; exceção zero/E2404 permanece exclusiva da homologação',async()=>{
 const id=ownSefinLookupId(fiscalProfile.issuerMunicipality,'11222333000181','1');
 for(const environment of [0,2,undefined,'1'])assert.equal(verifiedSefinLookup(404,Buffer.from(JSON.stringify({tipoAmbiente:environment,erro:{codigo:'E2404'}})),id,raw,'production'),false);
 assert.equal(verifiedSefinLookup(404,Buffer.from('{"tipoAmbiente":0,"erro":{"codigo":"E2404"}}'),id,raw),true);
 assert.equal(verifiedSefinLookup(404,Buffer.from('{"tipoAmbiente":1,"erro":{"codigo":"E2404"}}'),id,raw,'production'),true);
 const result=await inspectOwnSefinTransport({municipality:fiscalProfile.issuerMunicipality,cnpj:'11222333000181',holderCnpj:'11222333000181',series:'1'},{pfx:Buffer.from('synthetic'),password:'synthetic'},raw,async(env,url)=>{assert.equal(env,'production');assert.equal(url,'https://sefin.nfse.gov.br/SefinNacional/dps/'+id);return {status:404,contentType:'application/json',body:Buffer.from('{"tipoAmbiente":1,"erro":{"codigo":"E2404"}}')};},'production');
 assert.deepEqual(result,{verified:true,http:404});
 assert.equal(productionDpsAvailability(404,Buffer.from('{"tipoAmbiente":1,"erro":{"codigo":"E2404"}}'),id,raw),'unused');
 assert.equal(productionDpsAvailability(200,Buffer.from('{}'),id,raw),'used');
 for(const value of [{tipoAmbiente:1,erro:{codigo:'E0002'}},{tipoAmbiente:0,erro:{codigo:'E2404'}},{tipoAmbiente:1,erro:{codigo:'E2404'},idDPS:'FOREIGN'},{tipoAmbiente:1,erro:{codigo:'E2404'},chaveAcesso:key}])assert.equal(productionDpsAvailability(404,Buffer.from(JSON.stringify(value)),id,raw),'unverified');
});
test('recibo assinado e estruturalmente válido de produção não autoriza ambiente diferente',async()=>{
 const xml=nfseFixture(signed.xml,service,key),expected={accessKey:key,signedDps:signed.xml,holderCert:holder.certificatePem,dpsId:signed.id,issuerCnpj:'11222333000181'};
 assert.ok(await verifyOfficialNfseContents(xml,{...expected,environment:'production'}));
 assert.equal(await verifyOfficialNfseContents(xml,{...expected,environment:'homologation'}),null);
});
