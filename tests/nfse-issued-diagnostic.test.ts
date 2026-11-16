import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {identity,signedDps,nfseFixture,contractFixture} from './helpers/fiscal-fixture.ts';
import {diagnoseIssuedNfse} from '../src/lib/nfse/issued-diagnostic.ts';
import {dpsIdentityReport} from '../src/lib/nfse/identity-diagnostic.ts';
import {hasStoredCreatedResponse} from '../src/lib/nfse/durable-report.ts';
import {NFSE_BASES} from '../src/lib/nfse/http.ts';
import {inspectOfficialNfseContents,verifyOfficialNfseContents} from '../src/lib/nfse/receipt.ts';

const holder=identity(),service=identity(),signed=signedDps(holder),key='1'.repeat(50),id='00000000-0000-4000-8000-000000000001';
function scenario(){
 const snapshot={...signed,sha256:createHash('sha256').update(signed.xml).digest('hex'),certificatePem:holder.certificatePem};
 const h={snapshot,paths:[] as string[],loads:0,subject:'11222333000181',lookup:{status:200,body:{tipoAmbiente:2,idDps:signed.id,chaveAcesso:key} as Record<string,unknown>},
  document:nfseFixture(signed.xml,service,key),pfx:Buffer.from('SYNTHETIC_PRIVATE_PFX'),throwGet:false};
 const run=()=>diagnoseIssuedNfse({operationId:id,dpsId:signed.id,issuerCnpj:'11222333000181',snapshot:h.snapshot},{contract:contractFixture(),
  load:async()=>{h.loads++;return {pfx:h.pfx,password:'SYNTHETIC_PASSWORD',metadata:{subject_cnpj:h.subject}};},
  get:async path=>{h.paths.push(path);if(h.throwGet)throw Object.assign(new Error('SYNTHETIC_PRIVATE_ERROR'),{code:'ETIMEDOUT'});
   return path.includes('/dps/')?{status:h.lookup.status,body:Buffer.from(JSON.stringify(h.lookup.body))}:{status:200,body:Buffer.from(JSON.stringify({nfseXmlGZipB64:gzipSync(h.document).toString('base64')}))};},
 },'7b2384b');
 return {h,run};
}
test('retorno 201 só habilita conferência explícita; diagnóstico faz dois GET próprios, não transmite nem devolve XML/chave',async()=>{
 assert.equal(hasStoredCreatedResponse([{stage:'submit',data:{phase:'response',http:201}}]),true);
 assert.equal(hasStoredCreatedResponse([{stage:'dps_lookup',data:{phase:'response',http:201}}]),false);
 assert.equal(hasStoredCreatedResponse([{stage:'submit',data:{phase:'response',http:400}}]),false);
 const {h,run}=scenario(),result=await run();assert.equal(result.verified,true);
 assert.deepEqual(h.paths,[NFSE_BASES.homologation+'/dps/'+signed.id,NFSE_BASES.homologation+'/nfse/'+key]);
 assert.ok(h.pfx.every(byte=>byte===0));assert.match(result.details,/Assinatura criptográfica da NFS-e: confere/);assert.match(result.details,/Estado da operação preservado/);
 for(const value of [signed.id,key,h.document,holder.certificatePem,service.certificatePem,'SYNTHETIC_PRIVATE','11222333000181','11.01'])assert.ok(!result.details.includes(value));
});
test('snapshot alterado ou titular alheio não permite consulta; identidade/chave/ambiente alheios não permitem buscar NFS-e',async()=>{
 let s=scenario();s.h.snapshot.sha256='0'.repeat(64);assert.equal((await s.run()).verified,false);assert.equal(s.h.loads,0);assert.equal(s.h.paths.length,0);
 s=scenario();s.h.subject='11444777000161';assert.equal((await s.run()).verified,false);assert.equal(s.h.paths.length,0);assert.ok(s.h.pfx.every(byte=>byte===0));
 for(const changed of [{idDps:'DPS'+'2'.repeat(42)},{chaveAcesso:'https://example.invalid'},{tipoAmbiente:1},{idDps:null}]){
  s=scenario();Object.assign(s.h.lookup.body,changed);const report=await s.run();assert.equal(report.verified,false);assert.equal(s.h.paths.length,1);assert.ok(s.h.pfx.every(byte=>byte===0));
 }
 s=scenario();s.h.lookup.status=404;assert.equal((await s.run()).verified,false);assert.equal(s.h.paths.length,1);
 s=scenario();s.h.throwGet=true;const failed=await s.run();assert.match(failed.details,/timeout/);assert.ok(!failed.details.includes('SYNTHETIC_PRIVATE_ERROR'));assert.ok(s.h.pfx.every(byte=>byte===0));
});
test('diagnóstico distingue XSD, status e integridade sem flexibilizar a validação fiscal',async()=>{
 let s=scenario();s.h.document=s.h.document.replace('<cTribNac>010101','<cTribNac>PRIVATE_BAD_VALUE');let result=await s.run();
 assert.equal(result.verified,false);assert.match(result.details,/XSD da NFS-e: estrutura recusada/);assert.ok(!result.details.includes('PRIVATE_BAD_VALUE'));
 s=scenario();s.h.document=nfseFixture(signed.xml,service,key,'103');result=await s.run();assert.equal(result.verified,false);assert.match(result.details,/Código fiscal cStat: 103/);
 s=scenario();s.h.document=s.h.document.replace('<vServ>11.01','<vServ>11.02');result=await s.run();assert.equal(result.verified,false);assert.match(result.details,/Referência da DPS retornada: não validado/);
 const expected={dpsId:signed.id,signedDps:signed.xml,holderCert:holder.certificatePem,issuerCnpj:'11222333000181',accessKey:key};
 const valid=nfseFixture(signed.xml,service,key);assert.ok(await verifyOfficialNfseContents(valid,expected,()=>{throw new Error('SYNTHETIC_LOGGER_FAILURE');}));
 const inspected=await inspectOfficialNfseContents(valid,expected);assert.ok(inspected.document);assert.match(inspected.checks.join('\n'),/RSA-SHA256/);
});
test('identidades são separadas por campo e componentes sem exportar valores ou normalizar para autorização',()=>{
 const body={idDps:signed.id,idDPS:''};let lines=dpsIdentityReport(body,signed.id).join('\n');assert.match(lines,/idDps.*corresponde exatamente/);assert.match(lines,/idDPS.*texto vazio/);assert.ok(!lines.includes(signed.id));
 lines=dpsIdentityReport({idDps:signed.id.slice(3)},signed.id).join('\n');assert.match(lines,/sem o literal DPS/);
 const different=signed.id.slice(0,-1)+'2';lines=dpsIdentityReport({idDps:different},signed.id).join('\n');assert.match(lines,/componentes diferentes: número/);assert.ok(!lines.includes(different));
 assert.ok(!dpsIdentityReport({idDps:'PRIVATE_ID'},signed.id).join('').includes('PRIVATE_ID'));
});
test('diferença de namespace é diagnosticada e assinatura da NFS-e ainda é conferida, sem aceitar conteúdo diferente',async()=>{
 const unsigned=signed.xml.replace(/<Signature\b[\s\S]*?<\/Signature>/,'');
 const namespaced=unsigned.replace('<infDPS ','<infDPS xmlns:extra="urn:SYNTHETIC_PRIVATE_NAMESPACE" ');
 let s=scenario();s.h.document=nfseFixture(namespaced,service,key);let result=await s.run();
 assert.equal(result.verified,false);assert.match(result.details,/Diferença canônica restrita ao contexto/);assert.match(result.details,/Assinatura criptográfica da NFS-e: confere/);assert.ok(!result.details.includes('SYNTHETIC_PRIVATE_NAMESPACE'));
 s=scenario();s.h.document=nfseFixture(namespaced.replace('<vServ>11.01','<vServ>11.02'),service,key);result=await s.run();
 assert.equal(result.verified,false);assert.ok(!result.details.includes('Diferença canônica restrita'));assert.match(result.details,/Assinatura criptográfica da NFS-e: confere/);
});
