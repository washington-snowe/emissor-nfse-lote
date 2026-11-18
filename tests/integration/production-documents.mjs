// Real preflight, renderer and signature/XSD checks. Synthetic Auth/DB/A1/HEAD boundaries.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdtemp,writeFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {identity,signedDps,nfseFixture} from '../helpers/fiscal-fixture.ts';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),require=createRequire(import.meta.url),{build}=require(path.join(process.env.UI_TOOLS_DIR,'esbuild'));
const temporary=await mkdtemp(path.join(tmpdir(),'rex-production-documents-'));
const contract=JSON.parse(await readFile(path.join(root,'integrations/nfse/contracts/sefin-homologation-v1.structural.json'),'utf8'));
const key='2'.repeat(50),holder=identity(),service=identity(),signed=signedDps(holder,'production'),xml=nfseFixture(signed.xml,service,key);
const hash=value=>createHash('sha256').update(value).digest('hex');
const pdf=Buffer.from('%PDF-1.7\n'+'SYNTHETIC CACHE ONLY '.repeat(12)+'\n%%EOF\n');
function reset(){
 const h={calls:[],http:[],loaded:[],allowed:true,headStatus:404,headMime:'application/json',headBody:'',headSupported:true,holder:'11222333000181',contractStored:true,captureAllowed:true,lookupError:false,cache:null,cacheHash:null,tenant:'tenant-a',record:true,schema:true,xml,xmlHash:hash(xml),original:{id:signed.id,xml:signed.xml,sha256:hash(signed.xml),certificatePem:holder.certificatePem},generator:'nt008-1.02-rex-v1',material:{pfx:Buffer.from('SYNTHETIC ONLY'),metadata:{subject_cnpj:'11222333000181'}},context:{tenantId:'tenant-a',companyId:'company-a',certificateId:'cert-a',cnpj:'11222333000181',profileHash:'a'.repeat(64),profile:{issuerMunicipality:'3550308',series:'1'}}};
 h.admin={async rpc(name,args){h.calls.push({name,args});
  if(name==='reserve_production_check'){assert.deepEqual(args,{p_actor:'actor-a',p_company:'company-a'});return {data:h.allowed?h.context:null};}
  if(name==='fiscal_contract_record'){const value=structuredClone(contract);if(!h.headSupported)delete value.paths['/dps/{id}'].head;return {data:h.contractStored?{sha256:'b'.repeat(64),contract:value}:null};}
  if(name==='store_official_nfse_contract'){assert.equal(args.p_environment,'production');return {data:null};}
  if(name==='record_production_readiness_with_local_danfse'){assert.equal(args.p_http,h.headStatus);assert.equal(args.p_actor,'actor-a');assert.equal(args.p_spec_hash,'1265f403aedcdc5f08b3049dcc18a15c2bc155f51afccf3d12690fef2f4fb0ff');return h.schema?{data:h.record}:{error:{code:'PGRST202'}};}
  if(name==='danfse_document_source'){assert.equal(args.p_actor,'actor-a');assert.ok(['document-a','00000000-0000-4000-8000-000000000001'].includes(args.p_document));return {data:{...h.context,tenantId:h.tenant,environment:'production',accessKey:key,pdf:h.cache,sha256:h.cacheHash,xml:h.xml,xmlSha256:h.xmlHash,original:h.original,generator:h.generator}};}
  throw new Error('Unexpected mutation '+name);
 }};globalThis.productionDocuments=h;return h;
}
try{
 await symlink(path.join(root,'node_modules'),path.join(temporary,'node_modules'),'dir');
 const built=await build({stdin:{contents:'export {checkProductionAccess} from "./src/lib/production-access.ts";export {loadDanfse,inspectDanfse} from "./src/lib/danfse-server.ts";export {getDanfseDiagnostic} from "./src/app/painel/notas/danfse-diagnostic-actions.ts";',resolveDir:root},bundle:true,packages:'external',platform:'node',format:'esm',write:false,tsconfig:path.join(root,'tsconfig.json'),plugins:[{name:'synthetic-boundaries',setup(b){
  const virtual={'server-only':'','@/lib/supabase/admin':'export function createAdminClient(){return globalThis.productionDocuments.admin;}',
   '@/lib/tenancy-server':`export async function requireWorkspace(){
    const h=globalThis.productionDocuments;if(h.authenticated===false)throw new Error('AUTH_REQUIRED');
    return {context:{tenantId:'tenant-a',user:{id:'actor-a'}},client:{from(table){
     if(table!=='fiscal_documents')throw new Error('WRONG_TABLE');const filters=[];
     return {select(){return this;},eq(k,v){filters.push([k,v]);return this;},async maybeSingle(){h.ownershipFilters=filters;return {data:h.tenant==='tenant-a'?{id:'document-a'}:null};}};
    }}};
   }`,
   '@/lib/certificate-material':'export async function loadCertificateMaterial(context,purpose){const h=globalThis.productionDocuments;h.loaded.push({context,purpose});h.material.metadata.subject_cnpj=h.holder;return h.material;}',
   '@/lib/nfse/http':`export const NFSE_BASES={production:'https://sefin.nfse.gov.br/SefinNacional'};export async function nfseHead(env,url){const h=globalThis.productionDocuments;h.http.push({env,url,method:'HEAD'});if(h.lookupError)throw Object.assign(new Error('PRIVATE SYNTHETIC FAILURE'),{code:'ETIMEDOUT'});return {status:h.headStatus,contentType:h.headMime,body:Buffer.from(h.headBody)};}`,
   '@/lib/nfse/contract':`export async function discoverOfficialContract(){const h=globalThis.productionDocuments;return h.captureAllowed?{url:'https://sefin.nfse.gov.br/SefinNacional/swagger/docs/v1',sha256:'d'.repeat(64),contract:${JSON.stringify(contract)}}:null;}`};
  b.onResolve({filter:/.*/},a=>Object.hasOwn(virtual,a.path)?{path:a.path,namespace:'boundary'}:undefined);b.onLoad({filter:/.*/,namespace:'boundary'},a=>({contents:virtual[a.path],loader:'js'}));
 }}]});const modulePath=path.join(temporary,'documents.mjs');await writeFile(modulePath,built.outputFiles[0].text);const {checkProductionAccess,loadDanfse,inspectDanfse,getDanfseDiagnostic}=await import(modulePath);
 let h=reset();let result=await checkProductionAccess('actor-a','company-a');assert.equal(result.verified,true);assert.equal(h.http.length,1);assert.equal(h.http[0].method,'HEAD');assert.equal(h.loaded[0].purpose,'access_check');assert.ok(h.material.pfx.every(x=>x===0));assert.match(result.details,/nfse-production-v4/);assert.match(result.details,/Gerador local DANFS-e: conferido/);
 for(const status of [301,400,401,403,429,500,503]){h=reset();h.headStatus=status;result=await checkProductionAccess('actor-a','company-a');assert.equal(result.verified,false);assert.ok(!h.calls.some(c=>c.name==='record_production_readiness_with_local_danfse'));}
 h=reset();h.allowed=false;assert.equal((await checkProductionAccess('actor-a','company-a')).verified,false);assert.equal(h.http.length,0);assert.equal(h.loaded.length,0);
 h=reset();h.holder='11444777000161';assert.equal((await checkProductionAccess('actor-a','company-a')).verified,false);assert.equal(h.http.length,0);assert.ok(h.material.pfx.every(x=>x===0));
 h=reset();h.contractStored=false;assert.equal((await checkProductionAccess('actor-a','company-a')).verified,true);assert.ok(h.calls.some(c=>c.name==='store_official_nfse_contract'));
 h=reset();h.contractStored=false;h.captureAllowed=false;assert.equal((await checkProductionAccess('actor-a','company-a')).verified,false);assert.equal(h.http.length,0);
 h=reset();h.lookupError=true;result=await checkProductionAccess('actor-a','company-a');assert.equal(result.verified,false);assert.ok(result.details.includes('transporte timeout'));assert.ok(!result.details.includes('PRIVATE SYNTHETIC FAILURE'));assert.ok(h.material.pfx.every(x=>x===0));
 h=reset();h.headSupported=false;result=await checkProductionAccess('actor-a','company-a');assert.equal(result.verified,false);assert.equal(h.http.length,0);
 h=reset();h.headStatus=200;assert.equal((await checkProductionAccess('actor-a','company-a')).verified,true);
 h=reset();h.headBody='unexpected';assert.equal((await checkProductionAccess('actor-a','company-a')).verified,false);
 h=reset();h.schema=false;result=await checkProductionAccess('actor-a','company-a');assert.equal(result.verified,false);assert.match(result.message,/atualização 22/);
 const context={actorId:'actor-a',tenantId:'tenant-a',documentId:'document-a'};
 h=reset();result=await loadDanfse(context);assert.ok(result.bytes.subarray(0,5).equals(Buffer.from('%PDF-')));assert.equal(result.source,'local_nt008');assert.equal(h.loaded.length,0);assert.equal(h.http.length,0);assert.deepEqual(h.calls.map(c=>c.name),['danfse_document_source']);
 h=reset();result=await inspectDanfse(context);assert.equal(result.available,true);assert.ok(result.details.includes('nfse-danfse-v4'));assert.ok(result.details.includes('assinaturas: conferidos'));assert.ok(result.details.includes('Tipografia: '));assert.equal(h.http.length,0);assert.equal(h.loaded.length,0);
 for(const privateText of [key,holder.certificatePem,'11222333000181','<NFSe'])assert.ok(!result.details.includes(privateText));
 h=reset();h.cache=pdf.toString('base64');h.cacheHash=hash(pdf);result=await loadDanfse(context);assert.equal(result.bytes.compare(pdf),0);assert.equal(result.source,'official_cache');assert.equal(h.loaded.length,0);assert.equal(h.http.length,0);
 h=reset();h.cache=pdf.toString('base64');h.cacheHash='f'.repeat(64);await assert.rejects(loadDanfse(context));
 h=reset();h.tenant='tenant-b';await assert.rejects(loadDanfse(context));assert.equal(h.loaded.length,0);assert.equal(h.http.length,0);
 for(const tamper of [h=>h.xmlHash='f'.repeat(64),h=>h.original.sha256='f'.repeat(64),h=>h.original.certificatePem=service.certificatePem,h=>{h.xml=h.xml.replace('<vLiq>11.01','<vLiq>99.01');h.xmlHash=hash(h.xml);},h=>{h.original.xml=h.original.xml.replace('<vServ>11.01','<vServ>99.01');h.original.sha256=hash(h.original.xml);}]){
  h=reset();tamper(h);result=await inspectDanfse(context);assert.equal(result.available,false);assert.match(result.details,/document_invalid/);assert.equal(h.http.length,0);assert.equal(h.loaded.length,0);
 }
 h=reset();h.generator=undefined;result=await inspectDanfse(context);assert.equal(result.available,false);assert.match(result.details,/schema_update_required/);
 const documentId='00000000-0000-4000-8000-000000000001';
 h=reset();result=await getDanfseDiagnostic(documentId);assert.equal(result.available,true);assert.ok(h.ownershipFilters.some(([k,v])=>k==='tenant_id'&&v==='tenant-a'));
 h=reset();h.tenant='tenant-b';assert.ok((await getDanfseDiagnostic(documentId)).error);assert.equal(h.calls.length,0);
 h=reset();h.authenticated=false;await assert.rejects(getDanfseDiagnostic(documentId),/AUTH_REQUIRED/);assert.equal(h.calls.length,0);
 h=reset();assert.ok((await getDanfseDiagnostic('invalid')).error);assert.equal(h.calls.length,0);
 console.log('Production HEAD guards retained; local DANFSe uses real synthetic signature/XSD checks and PDF generation with no HTTP/private A1/state change. Owner binding, tampering, legacy cache and sanitized v4 diagnostic passed. No real fiscal submission.');
}finally{delete globalThis.productionDocuments;await rm(temporary,{recursive:true,force:true});}
