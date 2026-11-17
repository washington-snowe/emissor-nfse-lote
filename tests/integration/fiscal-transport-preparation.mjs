// Real fiscal worker, lookup adapter and execution state machine. Synthetic DB/A1/HTTP/signature boundaries.
// HTTP and signatures remain synthetic; no external request or real certificate is used.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {fiscalProfile,recipient} from '../helpers/fiscal-fixture.ts';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),require=createRequire(import.meta.url);
const {build}=require(path.join(process.env.UI_TOOLS_DIR,'esbuild'));
const temporary=await mkdtemp(path.join(tmpdir(),'fiscal-transport-preparation-'));
const contract=JSON.parse(await readFile(path.join(root,'integrations/nfse/contracts/sefin-homologation-v1.structural.json'),'utf8'));
const previous=process.env.NFSE_HOMOLOGATION_ENABLED,previousProduction=process.env.NFSE_PRODUCTION_ENABLED,originalInfo=console.info;
function reset(){
 const h={events:[],observations:[],allowSend:false,full:false,candidateUsed:false,headStatus:404,headMime:"application/json",diagnosticsReady:true,schemaReady:true,proof:true,body:JSON.stringify({tipoAmbiente:0,erro:{codigo:'E2404'}}),material:{pfx:Buffer.from('SYNTHETIC'),password:'SYNTHETIC',privateKeyPem:'SYNTHETIC',certificatePem:'SYNTHETIC',metadata:{subject_cnpj:'11222333000181'}},job:{id:'synthetic-operation',tenant_id:'synthetic-tenant',company_id:'synthetic-company',lease_token:'synthetic-lease',mode:'prepare',environment:'homologation',issuer_cnpj:'11222333000181',profile_snapshot:fiscalProfile,competence_date:'2026-10-31',amount:'1.00',foreign_amount:null,dps_number:null,dps_id:null,recipient,intermediary:null,signed_dps_xml:null,holder_certificate_pem:null}};
 h.admin={async rpc(name,args){h.events.push(name);
  if(name==='fiscal_production_schema_ready')return {data:h.full};
  if(name==='fiscal_contract')return {data:contract};
  if(name==='fiscal_diagnostics_ready')return {data:h.diagnosticsReady};
  if(name==='fiscal_schema_diagnostics_ready')return h.schemaReady?{data:true}:{error:{code:'PGRST202'}};
    if(name==='claim_fiscal_jobs_for_environment'&&args.p_environment!==h.job.environment)return {data:[]};
  if(name==='claim_fiscal_jobs'||name==='claim_fiscal_jobs_for_environment'){assert.equal(args.p_tenant,'synthetic-tenant');return {data:args.p_reconcile_only?[]:[h.job]};}
  if(name==='fiscal_processing_certificate')return {data:'synthetic-certificate'};
  if(name==='record_fiscal_environment_transport'){assert.equal(args.p_http,404);return {data:h.proof};}
  if(name==='record_fiscal_transport'){assert.ok(h.events.includes('GET'));assert.deepEqual(args,{p_operation:h.job.id,p_token:h.job.lease_token,p_certificate:'synthetic-certificate'});return {data:h.proof};}
  if(name==='reserve_fiscal_identity'){assert.ok(h.events.indexOf(h.full?'record_fiscal_environment_transport':'record_fiscal_transport')<h.events.indexOf(name));assert.equal(h.proof,true);return {data:{id:'DPS355030821122233300018100001000000000000001',number:'1'}};}
  if(name==='begin_fiscal_send_traced')return {data:h.allowSend};
  if(name==='finish_fiscal_attempt_traced'){h.outcome=args.p_outcome;h.persisted=args.p_diagnostics[0].data;return {data:true};}
  if(name==='release_fiscal_preparation'){h.reason=args.p_reason;return {data:true};}
  throw new Error('Unexpected RPC: '+name);
 }};globalThis.fiscalTransportHarness=h;return h;
}
try{
 const built=await build({entryPoints:[path.join(root,'src/lib/fiscal-jobs.ts')],bundle:true,platform:'node',format:'esm',write:false,tsconfig:path.join(root,'tsconfig.json'),plugins:[{name:'synthetic-fiscal-boundaries',setup(b){
  const http=`export const NFSE_BASES={homologation:'https://sefin.producaorestrita.nfse.gov.br/SefinNacional',production:'https://sefin.nfse.gov.br/SefinNacional'};export async function nfseGet(env,url,material,timeout){const h=globalThis.fiscalTransportHarness;h.events.push('GET');if(env!==h.job.environment||url!==NFSE_BASES[env]+'/dps/DPS355030821122233300018100001000000000000001'||material.pfx!==h.material.pfx||timeout!==5000)throw new Error('Invalid GET');return {status:h.candidateUsed&&h.events.filter(x=>x==='GET').length>1?200:404,body:Buffer.from(h.body)};}export async function nfseHead(env,url,material,timeout){const h=globalThis.fiscalTransportHarness;h.events.push('HEAD');if(env!=='production'||url!==NFSE_BASES.production+'/dps/DPS355030821122233300018100001000000000000001'||material.pfx!==h.material.pfx||timeout!==5000)throw new Error('Invalid HEAD');return {status:h.candidateUsed&&h.events.filter(x=>x==='HEAD').length>1?200:h.headStatus,body:Buffer.alloc(0),contentType:h.headMime};};export async function nfseRequest(env,method,url,material,body,timeout){const h=globalThis.fiscalTransportHarness;if(method==='GET')return nfseGet(env,url,material,timeout);if(!h.allowSend||env!==h.job.environment||method!=='POST'||!body||timeout<=5000||timeout>20000)throw new Error('Invalid simulated transmission');h.events.push('POST');h.timeout=timeout;return {status:400,body:Buffer.from(JSON.stringify({tipoAmbiente:h.job.environment==='production'?1:2,idDPS:null,erros:[{codigo:'E1235',descricao:"Element 'cTribNac' invalid SYNTHETIC_PRIVATE_RESPONSE"}]}))};}`;
  const virtual={'server-only':'','@/lib/supabase/admin':'export function createAdminClient(){return globalThis.fiscalTransportHarness.admin;}',
   '@/lib/certificate-material':`export async function loadCertificateMaterial(identity,purpose){const h=globalThis.fiscalTransportHarness;h.events.push('load');if(identity.tenantId!==h.job.tenant_id||identity.companyId!==h.job.company_id||identity.certificateId!=='synthetic-certificate'||purpose!=='emit')throw new Error('Invalid material context');return h.material;}`,
   '@/lib/nfse/http':http,'./http.ts':http,
   '@/lib/nfse/signature':'export function signDps(xml){return xml;}',
   '@/lib/nfse/schema':'export async function validateFiscalSchema(){return true;}',
   '@/lib/nfse/receipt':'export async function verifyOfficialNfseContents(){throw new Error("Unexpected receipt");}'};
  b.onResolve({filter:/.*/},a=>Object.hasOwn(virtual,a.path)?{path:a.path,namespace:'boundary'}:undefined);
  b.onLoad({filter:/.*/,namespace:'boundary'},a=>({contents:virtual[a.path],loader:'js'}));
 }}]});
 const modulePath=path.join(temporary,'worker.mjs');await writeFile(modulePath,built.outputFiles[0].text);const {processFiscalJobs}=await import(modulePath);
 console.info=value=>globalThis.fiscalTransportHarness.observations.push(JSON.parse(value));
 delete process.env.NFSE_PRODUCTION_ENABLED;process.env.NFSE_HOMOLOGATION_ENABLED='true';let h=reset();await processFiscalJobs('synthetic-tenant');
 assert.ok(h.events.includes('reserve_fiscal_identity'));assert.equal(h.reason,'configuration_changed');assert.ok(h.material.pfx.every(x=>x===0));
 h=reset();h.body=JSON.stringify({tipoAmbiente:0,erro:{codigo:'E0002'}});await processFiscalJobs('synthetic-tenant');assert.equal(h.reason,'certificate_unavailable');assert.ok(!h.events.includes('record_fiscal_transport'));assert.ok(!h.events.includes('reserve_fiscal_identity'));assert.ok(h.material.pfx.every(x=>x===0));
 h=reset();h.proof=false;await processFiscalJobs('synthetic-tenant');assert.equal(h.reason,'certificate_unavailable');assert.ok(!h.events.includes('reserve_fiscal_identity'));assert.ok(h.material.pfx.every(x=>x===0));
 h=reset();h.material.metadata.subject_cnpj='11444777000161';await processFiscalJobs('synthetic-tenant');assert.equal(h.reason,'certificate_unavailable');assert.ok(!h.events.includes('GET'));assert.ok(!h.events.includes('reserve_fiscal_identity'));
 h=reset();h.allowSend=true;await processFiscalJobs('synthetic-tenant');assert.equal(h.outcome,'rejected');assert.equal(h.events.filter(x=>x==='POST').length,1);assert.ok(h.timeout>5000&&h.timeout<=20000);assert.equal(h.persisted.http,400);assert.equal(h.observations[1].http,400);assert.deepEqual(h.observations[1].codes,['E1235']);assert.equal(h.persisted.dpsIdentity,'null');assert.deepEqual(h.persisted.xsdFields,['cTribNac']);assert.ok(!JSON.stringify(h.observations).includes('SYNTHETIC_PRIVATE_RESPONSE'));
 h=reset();h.allowSend=true;h.schemaReady=false;await processFiscalJobs('synthetic-tenant');assert.equal(h.outcome,'rejected');assert.ok(!Object.hasOwn(h.persisted,'xsdFields'));assert.ok(!Object.hasOwn(h.persisted,'dpsIdentity'));
 h=reset();h.diagnosticsReady=false;await processFiscalJobs('synthetic-tenant');assert.ok(!h.events.includes('load'));assert.ok(!h.events.includes('POST'));
 process.env.NFSE_PRODUCTION_ENABLED='true';h=reset();h.full=true;h.allowSend=true;h.job.environment='production';h.body=JSON.stringify({tipoAmbiente:1,erro:{codigo:'E2404'}});await processFiscalJobs('synthetic-tenant');assert.equal(h.outcome,'rejected');assert.equal(h.events.filter(x=>x==='HEAD').length,2,'own access and exact candidate queried separately with HEAD before POST');assert.equal(h.events.filter(x=>x==='POST').length,1);assert.ok(h.events.includes('record_fiscal_environment_transport'));
 h=reset();h.full=true;h.allowSend=true;h.candidateUsed=true;h.job.environment='production';h.body=JSON.stringify({tipoAmbiente:1,erro:{codigo:'E2404'}});await processFiscalJobs('synthetic-tenant');assert.equal(h.reason,'identity_in_use');assert.ok(!h.events.includes('begin_fiscal_send_traced'));assert.ok(!h.events.includes('POST'));
 h=reset();h.full=true;h.allowSend=true;h.headMime='text/html';h.job.environment='production';await processFiscalJobs('synthetic-tenant');assert.equal(h.reason,'certificate_unavailable');assert.ok(!h.events.includes('reserve_fiscal_identity'));assert.ok(!h.events.includes('POST'));
 h=reset();h.full=true;h.allowSend=true;h.headStatus=503;h.job.environment='production';await processFiscalJobs('synthetic-tenant');assert.equal(h.reason,'certificate_unavailable');assert.ok(!h.events.includes('reserve_fiscal_identity'));assert.ok(!h.events.includes('POST'));
 console.log('Fiscal preparation: homologation uses its own GET; production uses two documented HEAD queries before a single POST. Transport proof persists before reservation; occupied, HTML and503 HEAD responses block. All external boundaries synthetic.');
}finally{if(previousProduction===undefined)delete process.env.NFSE_PRODUCTION_ENABLED;else process.env.NFSE_PRODUCTION_ENABLED=previousProduction;console.info=originalInfo;delete globalThis.fiscalTransportHarness;if(previous===undefined)delete process.env.NFSE_HOMOLOGATION_ENABLED;else process.env.NFSE_HOMOLOGATION_ENABLED=previous;await rm(temporary,{recursive:true,force:true});}
