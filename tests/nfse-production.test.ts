import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {executeFiscalJob,type FiscalJob} from '../src/lib/nfse/execute.ts';
import {supportedNfseContract,verifiedSefinLookup} from '../src/lib/nfse/api-contract.ts';
import {inspectOwnSefinTransport,ownSefinLookupId} from '../src/lib/nfse/transport-proof.ts';
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
test('201 de produção 1.6.0 consulta a DPS original sem usar a identidade, chave ou XML do primeiro envelope',async()=>{
 const s=scenario(),request=s.deps.request,foreignKey='9'.repeat(50),urls:string[]=[];
 s.deps.request=async(method,url,material,body)=>{
  urls.push(url);
  if(method==='POST'){
   s.events.push(method);
   return {status:201,body:Buffer.from(JSON.stringify({tipoAmbiente:1,versaoAplicativo:'SefinNacional_1.6.0',idDPS:'DPS'+'9'.repeat(42),chaveAcesso:foreignKey,nfseXmlGZipB64:'untrusted'}))};
  }
  return request(method,url,material,body);
 };
 await executeFiscalJob(s.job,s.deps);
 assert.deepEqual(s.events,['A1','reserve','unused','intent','POST','GET','GET','finish:authorized']);
 assert.deepEqual(urls,['https://sefin.nfse.gov.br/SefinNacional/nfse','https://sefin.nfse.gov.br/SefinNacional/dps/'+signed.id,'https://sefin.nfse.gov.br/SefinNacional/nfse/'+key]);
 assert.ok(s.pfx.every(x=>x===0));
});
test('consulta após 201 não autoriza 404, ambiente ou identidade contraditórios; preserva um único POST',async()=>{
 for(const lookup of [
  {status:404,data:{tipoAmbiente:0,erro:{codigo:'E2404'}}},
  ...[{}, {tipoAmbiente:0},{tipoAmbiente:2},{tipoAmbiente:'1'},{tipoAmbiente:1,idDPS:'FOREIGN'},
   {tipoAmbiente:1,idDps:signed.id,idDPS:'FOREIGN'},{tipoAmbiente:1,idDPS:null},{tipoAmbiente:1,chaveAcesso:'bad'}]
   .map(data=>({status:200,data:{chaveAcesso:key,...data}})),
 ]){
  const s=scenario();s.deps.request=async(method)=>{
   s.events.push(method);
   return {status:method==='POST'?201:lookup.status,body:Buffer.from(JSON.stringify(method==='POST'?{tipoAmbiente:1,versaoAplicativo:'SefinNacional_1.6.0',idDPS:'FOREIGN'}:lookup.data))};
  };
  await executeFiscalJob(s.job,s.deps);
  assert.deepEqual(s.events.filter(x=>x==='POST'||x==='GET'),['POST','GET']);
  assert.ok(s.events.includes('finish:'+(lookup.status===404?'not_found':'uncertain')));assert.ok(s.pfx.every(x=>x===0));
 }
});
test('201 seguido de consultas exige XML íntegro da mesma DPS e ambiente; retorno 200 sozinho não autoriza',async()=>{
 for(const invalid of ['xml','signature','dps','environment','key','envelope'] as const){
  const s=scenario(),request=s.deps.request;
  s.deps.request=async(method,url,material,body)=>{
   if(method==='POST'){s.events.push(method);return {status:201,body:Buffer.from('{"tipoAmbiente":1,"versaoAplicativo":"SefinNacional_1.6.0","idDPS":"FOREIGN"}')};}
   const response=await request(method,url,material,body);
   if(url.includes('/dps/'))return response;
   const json=JSON.parse(response.body.toString());
   if(invalid==='xml')json.nfseXmlGZipB64='not-gzip';
   if(invalid==='signature')json.nfseXmlGZipB64=gzipSync(Buffer.from(nfseFixture(signed.xml,service,key).replace('<vLiq>11.01</vLiq>','<vLiq>99.99</vLiq>'))).toString('base64');
   if(invalid==='dps')json.nfseXmlGZipB64=gzipSync(Buffer.from(nfseFixture(signed.xml,service,key))).toString('base64');
   if(invalid==='environment')json.nfseXmlGZipB64=gzipSync(Buffer.from(nfseFixture(signedDps(holder,'homologation').xml,service,key))).toString('base64');
   if(invalid==='key')json.chaveAcesso='9'.repeat(50);
   if(invalid==='envelope')json.idDPS='FOREIGN';
   return {...response,body:Buffer.from(JSON.stringify(json))};
  };
  await executeFiscalJob(s.job,s.deps);
  assert.deepEqual(s.events.filter(x=>x==='POST'||x==='GET'),['POST','GET','GET']);
  assert.ok(s.events.includes('finish:uncertain'),invalid);assert.ok(!s.events.includes('finish:authorized'));assert.ok(s.pfx.every(x=>x===0));
 }
});
test('consulta imediata após 201 respeita orçamento e não interpreta outros status, versões ou ambientes como autorização',async()=>{
 const exhausted=scenario();let sent=false;
 exhausted.deps.remainingMs=()=>sent?19_999:45_000;
 exhausted.deps.request=async(method)=>{exhausted.events.push(method);sent=true;return {status:201,body:Buffer.from('{"tipoAmbiente":1,"versaoAplicativo":"SefinNacional_1.6.0","idDPS":"FOREIGN"}')};};
 await executeFiscalJob(exhausted.job,exhausted.deps);
 assert.deepEqual(exhausted.events.filter(x=>x==='POST'||x==='GET'),['POST']);assert.ok(exhausted.events.includes('finish:uncertain'));
 for(const response of [
  {status:201,tipoAmbiente:2,versaoAplicativo:'SefinNacional_1.6.0'},
  {status:201,tipoAmbiente:0,versaoAplicativo:'SefinNacional_1.6.0'},
  {status:201,tipoAmbiente:1,versaoAplicativo:'unknown'},
  {status:400,tipoAmbiente:1,versaoAplicativo:'SefinNacional_1.6.0'},
  {status:500,tipoAmbiente:1,versaoAplicativo:'SefinNacional_1.6.0'},
 ]){
  const s=scenario();s.deps.request=async(method)=>{s.events.push(method);return {status:response.status,body:Buffer.from(JSON.stringify({...response,idDPS:'FOREIGN'}))};};
  await executeFiscalJob(s.job,s.deps);assert.deepEqual(s.events.filter(x=>x==='POST'||x==='GET'),['POST']);assert.ok(s.events.includes('finish:uncertain'));
 }
});
test('erro fiscal em GET após 201 não vira rejeição do primeiro POST nem libera reenvio',async()=>{
 const s=scenario(),request=s.deps.request;
 s.deps.request=async(method,url,material,body)=>{
  if(method==='POST'){s.events.push(method);return {status:201,body:Buffer.from('{"tipoAmbiente":1,"versaoAplicativo":"SefinNacional_1.6.0"}')};}
  if(url.includes('/dps/'))return request(method,url,material,body);
  s.events.push(method);return {status:400,body:Buffer.from(JSON.stringify({tipoAmbiente:1,idDPS:signed.id,erros:[{codigo:'E0008'}]}))};
 };
 await executeFiscalJob(s.job,s.deps);
 assert.deepEqual(s.events.filter(x=>x==='POST'||x==='GET'),['POST','GET','GET']);
 assert.ok(s.events.includes('finish:uncertain'));assert.ok(!s.events.includes('finish:rejected'));
});
test('POST de produção com rejeição de outro ambiente fica incerto sem repetir envio',async()=>{
 for(const environment of [0,2,undefined]){const s=scenario();s.deps.request=async()=>{s.events.push('POST');return {status:400,body:Buffer.from(JSON.stringify({tipoAmbiente:environment,idDPS:signed.id,erros:[{codigo:'E0008'}]}))};};await executeFiscalJob(s.job,s.deps);assert.equal(s.events.filter(x=>x==='POST').length,1);assert.ok(s.events.includes('finish:uncertain'));}
});
test('GET SEFIN produção exige ambiente 1; exceção zero/E2404 permanece exclusiva da homologação',async()=>{
 const id=ownSefinLookupId(fiscalProfile.issuerMunicipality,'11222333000181','1');
 for(const environment of [0,2,undefined,'1'])assert.equal(verifiedSefinLookup(404,Buffer.from(JSON.stringify({tipoAmbiente:environment,erro:{codigo:'E2404'}})),id,raw,'production'),false);
 assert.equal(verifiedSefinLookup(404,Buffer.from('{"tipoAmbiente":0,"erro":{"codigo":"E2404"}}'),id,raw),true);
 assert.equal(verifiedSefinLookup(404,Buffer.from('{"tipoAmbiente":1,"erro":{"codigo":"E2404"}}'),id,raw,'production'),true);
 const result=await inspectOwnSefinTransport({municipality:fiscalProfile.issuerMunicipality,cnpj:'11222333000181',holderCnpj:'11222333000181',series:'1'},{pfx:Buffer.from('synthetic'),password:'synthetic'},raw,async(env,url)=>{assert.equal(env,'production');assert.equal(url,'https://sefin.nfse.gov.br/SefinNacional/dps/'+id);return {status:404,contentType:'application/json',body:Buffer.from('{"tipoAmbiente":1,"erro":{"codigo":"E2404"}}')};},'production');
 assert.deepEqual(result,{verified:true,http:404});

});
test('recibo assinado e estruturalmente válido de produção não autoriza ambiente diferente',async()=>{
 const xml=nfseFixture(signed.xml,service,key),expected={accessKey:key,signedDps:signed.xml,holderCert:holder.certificatePem,dpsId:signed.id,issuerCnpj:'11222333000181'};
 assert.ok(await verifyOfficialNfseContents(xml,{...expected,environment:'production'}));
 assert.equal(await verifyOfficialNfseContents(xml,{...expected,environment:'homologation'}),null);
});
