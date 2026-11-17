// Real preflight/DANFSe server logic. Synthetic database, credentials and HTTP; no external request.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),require=createRequire(import.meta.url),{build}=require(path.join(process.env.UI_TOOLS_DIR,'esbuild'));
const temporary=await mkdtemp(path.join(tmpdir(),'rex-production-documents-'));
const contract=JSON.parse(await readFile(path.join(root,'integrations/nfse/contracts/sefin-homologation-v1.structural.json'),'utf8'));
const danfse={paths:{'/{chaveAcesso}':{get:{parameters:[{name:'chaveAcesso',in:'path',required:true,schema:{type:'string'}}],responses:{'200':{}}}}}},key='2'.repeat(50);
const pdf=Buffer.from('%PDF-1.7\n'+'SYNTHETIC ONLY '.repeat(12)+'\n%%EOF\n');
function reset(){
 const h={calls:[],http:[],loaded:[],allowed:true,environment:1,holder:'11222333000181',contractStored:true,danfseStored:true,captureAllowed:true,pdfStatus:200,lookupError:false,cache:null,cacheHash:null,tenant:'tenant-a',record:true,material:{pfx:Buffer.from('SYNTHETIC ONLY'),password:'SYNTHETIC ONLY',metadata:{subject_cnpj:'11222333000181'}},context:{tenantId:'tenant-a',companyId:'company-a',certificateId:'cert-a',cnpj:'11222333000181',profileHash:'a'.repeat(64),profile:{issuerMunicipality:'3550308',series:'1'}}};
 h.admin={async rpc(name,args){h.calls.push({name,args});
  if(name==='reserve_production_check'){assert.deepEqual(args,{p_actor:'actor-a',p_company:'company-a'});return {data:h.allowed?h.context:null};}
  if(name==='fiscal_contract_record')return {data:h.contractStored?{sha256:'b'.repeat(64),contract}:null};
  if(name==='danfse_contract')return {data:h.danfseStored?{sha256:'c'.repeat(64),contract:danfse}:null};
  if(name==='store_official_nfse_contract'||name==='store_official_danfse_contract'){assert.equal(args.p_environment,'production');return {data:null};}
  if(name==='record_production_readiness'){assert.equal(args.p_http,404);assert.equal(args.p_actor,'actor-a');return {data:h.record};}
  if(name==='danfse_document_source'){assert.deepEqual(args,{p_actor:'actor-a',p_document:'document-a'});return {data:{...h.context,tenantId:h.tenant,environment:'production',accessKey:key,pdf:h.cache,sha256:h.cacheHash}};}
  if(name==='store_fiscal_danfse'){assert.equal(args.p_environment,'production');assert.equal(args.p_access_key,key);assert.equal(Buffer.from(args.p_pdf,'base64').compare(pdf),0);return {data:true};}
  throw new Error('Unexpected mutation '+name);
 }};globalThis.productionDocuments=h;return h;
}
try{
 const built=await build({stdin:{contents:'export {checkProductionAccess} from "./src/lib/production-access.ts";export {loadOfficialDanfse} from "./src/lib/danfse-server.ts";',resolveDir:root},bundle:true,platform:'node',format:'esm',write:false,tsconfig:path.join(root,'tsconfig.json'),plugins:[{name:'synthetic-boundaries',setup(b){
  const http=`export const NFSE_BASES={production:'https://sefin.nfse.gov.br/SefinNacional'};export const DANFSE_BASES={production:'https://adn.nfse.gov.br/danfse'};export async function nfseGet(env,url){const h=globalThis.productionDocuments;h.http.push({env,url});if(url.startsWith(DANFSE_BASES.production+'/'))return {status:h.pdfStatus,contentType:'application/pdf',body:Buffer.from(${JSON.stringify(pdf.toString())})};if(h.lookupError)throw Object.assign(new Error('PRIVATE SYNTHETIC FAILURE'),{code:'ETIMEDOUT'});return {status:404,contentType:'application/json',body:Buffer.from(JSON.stringify({tipoAmbiente:h.environment,erro:{codigo:'E2404'}}))};}`;
  const virtual={'server-only':'','@/lib/supabase/admin':'export function createAdminClient(){return globalThis.productionDocuments.admin;}',
   '@/lib/certificate-material':'export async function loadCertificateMaterial(context,purpose){const h=globalThis.productionDocuments;h.loaded.push({context,purpose});h.material.metadata.subject_cnpj=h.holder;return h.material;}',
   '@/lib/nfse/http':http,'./http.ts':http,
   '@/lib/nfse/contract':`export async function discoverOfficialContract(env,material,deadline,request,report,service){const h=globalThis.productionDocuments;if(!h.captureAllowed){report?.({stage:'canonical_index',status:503,format:'html',outcome:'received'});report?.({stage:'schema_direct',status:503,format:'html',outcome:'received'});return null;}const dan=service==='danfse';return {url:dan?'https://adn.nfse.gov.br/danfse/swagger/v1/swagger.json':'https://sefin.nfse.gov.br/SefinNacional/swagger/docs/v1',sha256:'d'.repeat(64),contract:dan?${JSON.stringify(danfse)}:${JSON.stringify(contract)}};}`};
  b.onResolve({filter:/.*/},a=>Object.hasOwn(virtual,a.path)?{path:a.path,namespace:'boundary'}:undefined);b.onLoad({filter:/.*/,namespace:'boundary'},a=>({contents:virtual[a.path],loader:'js'}));
 }}]});const modulePath=path.join(temporary,'documents.mjs');await writeFile(modulePath,built.outputFiles[0].text);const {checkProductionAccess,loadOfficialDanfse}=await import(modulePath);
 let h=reset();let result=await checkProductionAccess('actor-a','company-a');assert.equal(result.verified,true);assert.equal(h.http.length,1);assert.equal(h.loaded[0].purpose,'access_check');assert.ok(h.material.pfx.every(x=>x===0));assert.ok(!result.details.includes('11222333000181'));assert.ok(!result.details.includes('SYNTHETIC ONLY'));
 for(const env of [0,2,undefined]){h=reset();h.environment=env;result=await checkProductionAccess('actor-a','company-a');assert.equal(result.verified,false);assert.ok(!h.calls.some(c=>c.name==='record_production_readiness'));}
 h=reset();h.allowed=false;assert.equal((await checkProductionAccess('actor-a','company-a')).verified,false);assert.equal(h.http.length,0);assert.equal(h.loaded.length,0);
 h=reset();h.holder='11444777000161';assert.equal((await checkProductionAccess('actor-a','company-a')).verified,false);assert.equal(h.http.length,0);assert.ok(h.material.pfx.every(x=>x===0));
 h=reset();h.contractStored=false;h.danfseStored=false;assert.equal((await checkProductionAccess('actor-a','company-a')).verified,true);assert.ok(h.calls.some(c=>c.name==='store_official_danfse_contract'));assert.ok(h.calls.some(c=>c.name==='store_official_nfse_contract'));
 h=reset();h.danfseStored=false;h.captureAllowed=false;result=await checkProductionAccess('actor-a','company-a');assert.equal(result.verified,false);assert.equal(h.http.length,1,'SEFIN own GET must be checked even while DANFSe documentation is unavailable');assert.ok(result.details.includes('Consulta SEFIN compatível com produção: sim'));assert.ok(result.details.includes('schema_direct · HTTP 503'));assert.ok(result.message.includes('DANFS-e retornou HTTP 503'));assert.ok(!h.calls.some(c=>c.name==='record_production_readiness'),'no readiness without official DANFSe contract');
 h=reset();h.environment=0;h.danfseStored=false;h.captureAllowed=false;result=await checkProductionAccess('actor-a','company-a');assert.equal(result.verified,false);assert.ok(result.details.includes('Consulta SEFIN compatível com produção: não'));assert.ok(result.details.includes('Contrato DANFS-e de produção: não confirmado'));assert.ok(!h.calls.some(c=>c.name==='record_production_readiness'));
 h=reset();h.lookupError=true;result=await checkProductionAccess('actor-a','company-a');assert.equal(result.verified,false);assert.ok(result.details.includes('transporte timeout'));assert.ok(!result.details.includes('PRIVATE SYNTHETIC FAILURE'));assert.ok(h.material.pfx.every(x=>x===0));
 const context={actorId:'actor-a',tenantId:'tenant-a',documentId:'document-a'};
 h=reset();result=await loadOfficialDanfse(context);assert.equal(result.bytes.compare(pdf),0);assert.equal(h.loaded[0].purpose,'reconcile');assert.equal(h.http.length,1);assert.ok(h.http[0].url.endsWith('/'+key));assert.ok(h.calls.some(c=>c.name==='store_fiscal_danfse'));assert.ok(h.material.pfx.every(x=>x===0));
 h=reset();h.cache=pdf.toString('base64');h.cacheHash=createHash('sha256').update(pdf).digest('hex');result=await loadOfficialDanfse(context);assert.equal(result.bytes.compare(pdf),0);assert.equal(h.loaded.length,0);assert.equal(h.http.length,0);
 h=reset();h.cache=pdf.toString('base64');h.cacheHash='f'.repeat(64);await assert.rejects(loadOfficialDanfse(context));assert.equal(h.http.length,0);
 h=reset();h.tenant='tenant-b';await assert.rejects(loadOfficialDanfse(context));assert.equal(h.loaded.length,0);assert.equal(h.http.length,0);
 h=reset();h.pdfStatus=404;await assert.rejects(loadOfficialDanfse(context));assert.ok(!h.calls.some(c=>c.name==='store_fiscal_danfse'));assert.ok(h.material.pfx.every(x=>x===0));
 console.log('Production preflight and DANFSe: GET only, owner/holder/environment/source/hash binding, actual HTTP proof, protected material zeroing, immutable cache and unavailable-PDF guard. All HTTP/A1/DB boundaries synthetic.');
}finally{delete globalThis.productionDocuments;await rm(temporary,{recursive:true,force:true});}
