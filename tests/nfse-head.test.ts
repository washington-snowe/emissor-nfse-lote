import assert from 'node:assert/strict';
import {test,mock} from 'node:test';
import {readFileSync} from 'node:fs';
import {EventEmitter} from 'node:events';
import https from 'node:https';
import type {ClientRequest,IncomingMessage} from 'node:http';
import {supportedDpsHeadPath,verifiedSefinLookup} from '../src/lib/nfse/api-contract.ts';
import {documentedDpsHeadResult,inspectOwnProductionSefinTransport,ownSefinLookupId} from '../src/lib/nfse/transport-proof.ts';
import {nfseHead,nfseRequest,NFSE_BASES} from '../src/lib/nfse/http.ts';

const contract=JSON.parse(readFileSync(new URL('../integrations/nfse/contracts/sefin-homologation-v1.structural.json',import.meta.url),'utf8'));
const input={municipality:'3550308',cnpj:'11222333000181',holderCnpj:'11222333000181',series:'1'},id=ownSefinLookupId(input.municipality,input.cnpj,input.series);
const credentials={pfx:Buffer.from('SYNTHETIC ONLY'),password:'synthetic-only'};
test('HEAD exige método e status200/404 declarados no contrato capturado',()=>{
 assert.equal(supportedDpsHeadPath(contract),'/dps/{id}');
 for(const change of ['missing','no404','no200','wrongParameter','extraRequired']){
  const changed=structuredClone(contract),operation=changed.paths['/dps/{id}'].head;
  if(change==='missing')delete changed.paths['/dps/{id}'].head;
  if(change==='no404')delete operation.responses['404'];if(change==='no200')delete operation.responses['200'];
  if(change==='wrongParameter')operation.parameters[0].name='foreign';
  if(change==='extraRequired')operation.parameters.push({in:'query',name:'unknown',required:true,type:'string'});
  assert.equal(supportedDpsHeadPath(changed),null);
 }
});
test('HEAD vazio distingue identidade livre/ocupada; não aceita erro genérico ou corpo JSON de GET',()=>{
 assert.equal(documentedDpsHeadResult(404,Buffer.alloc(0),'',contract),'unused');
 assert.equal(documentedDpsHeadResult(200,Buffer.alloc(0),'application/json',contract),'used');
 for(const status of [201,204,301,302,307,400,401,403,429,500,503])assert.equal(documentedDpsHeadResult(status,Buffer.alloc(0),'application/json',contract),'unverified');
 for(const mime of ['text/html','text/plain','application/octet-stream'])assert.equal(documentedDpsHeadResult(404,Buffer.alloc(0),mime,contract),'unverified');
 assert.equal(documentedDpsHeadResult(404,Buffer.from('{"tipoAmbiente":0,"erro":{"codigo":"E2404"}}'),'application/json',contract),'unverified');
 assert.equal(verifiedSefinLookup(404,Buffer.from('{"tipoAmbiente":0,"erro":{"codigo":"E2404"}}'),id,contract,'production'),false,'GET environment0 remains incompatible; it is never converted');
});
test('prova HEAD usa somente identidade do titular e produção oficial, sem reservar número',async()=>{
 let calls=0;
 const result=await inspectOwnProductionSefinTransport(input,credentials,contract,async(environment,url,passed)=>{calls++;assert.equal(environment,'production');assert.equal(url,NFSE_BASES.production+'/dps/'+id);assert.equal(passed,credentials);return {status:404,body:Buffer.alloc(0),contentType:''};});
 assert.deepEqual(result,{verified:true,http:404});assert.equal(calls,1);
 assert.deepEqual(await inspectOwnProductionSefinTransport({...input,holderCnpj:'11444777000161'},credentials,contract,async()=>{throw new Error('Must not query a foreign holder');}),{verified:false,http:0});
 const missing=structuredClone(contract);delete missing.paths['/dps/{id}'].head;
 assert.deepEqual(await inspectOwnProductionSefinTransport(input,credentials,missing,async()=>{throw new Error('Must not guess an absent HEAD');}),{verified:false,http:0});
});
test('transporte HEAD fixa método, TLS e caminho DPS; recusas não fazem requisição externa',async()=>{
 let calls=0;
 const replacement=((url:URL,options:https.RequestOptions,callback:(response:IncomingMessage)=>void)=>{
  calls++;assert.equal(url.href,NFSE_BASES.production+'/dps/'+id);assert.equal(options.method,'HEAD');assert.equal(options.rejectUnauthorized,true);assert.equal(options.minVersion,'TLSv1.2');assert.equal((options.headers as Record<string,string>).Accept,'application/json');
  const request=Object.assign(new EventEmitter(),{end(){queueMicrotask(()=>{const response=Object.assign(new EventEmitter(),{statusCode:404,headers:{}});callback(response as IncomingMessage);response.emit('end');});},destroy(error:Error){request.emit('error',error);}});
  return request as unknown as ClientRequest;
 }) as typeof https.request;
 const mocked=mock.method(https,'request',replacement);
 try{
  assert.equal((await nfseHead('production',NFSE_BASES.production+'/dps/'+id,credentials)).status,404);
  for(const url of [NFSE_BASES.homologation+'/dps/'+id,NFSE_BASES.production+'/nfse',NFSE_BASES.production+'/docs/index',NFSE_BASES.production+'/dps/foreign',NFSE_BASES.production+'/dps/'+id+'?url=foreign','https://example.invalid/dps/'+id,'https://adn.nfse.gov.br/danfse/'+ '1'.repeat(50)])await assert.rejects(nfseHead('production',url,credentials),/Invalid fiscal destination/);
  await assert.rejects(nfseRequest('production','HEAD',NFSE_BASES.production+'/dps/'+id,credentials,Buffer.from('{}')),/Invalid fiscal destination/);
  assert.equal(calls,1,'rejected targets never open a network connection');
 }finally{mocked.mock.restore();}
});
