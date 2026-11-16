// Actual server action and strict GET pipeline; synthetic Auth/DB/Vault/HTTP boundaries only.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const require=createRequire(import.meta.url),{build}=require(path.join(process.env.UI_TOOLS_DIR,'esbuild'));
const temporary=await mkdtemp(path.join(tmpdir(),'certificate-sefin-diagnostic-'));
const ids={actor:'00000000-0000-4000-8000-000000000001',tenant:'00000000-0000-4000-8000-000000000002',company:'00000000-0000-4000-8000-000000000003',certificate:'00000000-0000-4000-8000-000000000004'};
const contract=JSON.parse(await readFile(path.join(root,'integrations/nfse/contracts/sefin-homologation-v1.structural.json'),'utf8'));
function reset(){
  const h={authenticated:true,tenant:ids.tenant,quota:true,loadFails:false,reads:[],calls:[],loads:[],gets:[],body:JSON.stringify({Message:'SYNTHETIC_PRIVATE_BODY'}),material:{pfx:Buffer.from('SYNTHETIC ONLY'),password:'SYNTHETIC ONLY',metadata:{subject_cnpj:'11222333000181'}},rows:{company_certificates:[{id:ids.certificate,company_id:ids.company,tenant_id:ids.tenant,status:'active'}],companies:[{id:ids.company,tenant_id:ids.tenant,cnpj:'11222333000181',address:{municipality_code:'3550308'}}],company_fiscal_profiles:[{company_id:ids.company,tenant_id:ids.tenant,configuration:{series:'1'}}]}};
  h.client={from(table){const filters=[];return {select(){return this;},eq(key,value){filters.push([key,value]);return this;},order(){return this;},limit(){return this;},async maybeSingle(){h.reads.push({table,filters});return {data:h.rows[table].find(row=>filters.every(([key,value])=>row[key]===value))??null,error:null};}};}};
  h.admin={async rpc(name,args){h.calls.push({name,args});if(name==='reserve_company_operation'){assert.deepEqual(args,{p_actor:ids.actor,p_company:ids.company,p_operation:'fiscal_access_check'});return {data:h.quota};}if(name==='fiscal_contract'){assert.deepEqual(args,{p_environment:'homologation'});return {data:contract};}throw new Error('Unexpected privileged RPC: '+name);}};
  globalThis.sefinHarness=h;return h;
}
try{
  const result=await build({stdin:{contents:'export {diagnoseCertificateSefin} from "./src/app/painel/certificados/actions.ts";',resolveDir:root},bundle:true,platform:'node',format:'esm',write:false,tsconfig:path.join(root,'tsconfig.json'),plugins:[{name:'synthetic-boundaries',setup(b){
    const virtual={
      'server-only':'','next/cache':'export function revalidatePath(){throw new Error("Unexpected cache mutation");}',
      'next/server':'export function after(){throw new Error("Unexpected job scheduling");}',
      '@/lib/tenancy-server':`export async function requireWorkspace(){const h=globalThis.sefinHarness;if(!h.authenticated)throw new Error('AUTH_REQUIRED');return {client:h.client,context:{tenantId:h.tenant,user:{id:'${ids.actor}'}}};}`,
      '@/lib/supabase/admin':'export function createAdminClient(){return globalThis.sefinHarness.admin;}',
      '@/lib/certificate-material':`export async function loadCertificateMaterial(identity,purpose){const h=globalThis.sefinHarness;h.loads.push({identity,purpose});if(h.loadFails)throw new Error('SYNTHETIC_PRIVATE_FAILURE');return h.material;}`,
      '@/lib/nfse/http':`export async function nfseGet(environment,url,credentials,timeout){const h=globalThis.sefinHarness;h.gets.push({environment,url,timeout});if(credentials!==h.material)throw new Error('Unexpected credential');return {status:404,body:Buffer.from(h.body)};}`,
      '@/lib/automatic-fiscal-setup':'export async function ensureAutomaticFiscalSetup(){throw new Error("Unexpected setup mutation");}',
      '@/lib/certificate-check-jobs':'export async function processCertificateChecks(){throw new Error("Unexpected worker");}',
    };
    b.onResolve({filter:/.*/},a=>Object.hasOwn(virtual,a.path)?{path:a.path,namespace:'boundary'}:undefined);
    b.onLoad({filter:/.*/,namespace:'boundary'},a=>({contents:virtual[a.path],loader:'js'}));
  }}]});
  const modulePath=path.join(temporary,'action.mjs');await writeFile(modulePath,result.outputFiles[0].text);const {diagnoseCertificateSefin}=await import(modulePath);
  let h=reset();const diagnostic=await diagnoseCertificateSefin(ids.certificate);
  assert.match(diagnostic.details,/sefin_unavailable/);assert.match(diagnostic.details,/HTTP 404 · JSON/);assert.ok(!JSON.stringify(diagnostic).includes('SYNTHETIC_PRIVATE_BODY'));
  assert.deepEqual(h.loads,[{identity:{tenantId:ids.tenant,companyId:ids.company,certificateId:ids.certificate},purpose:'access_check'}]);
  assert.deepEqual(h.gets,[{environment:'homologation',url:'https://sefin.producaorestrita.nfse.gov.br/SefinNacional/dps/DPS355030821122233300018100001000000000000001',timeout:5000}]);assert.ok(h.material.pfx.every(x=>x===0));
  assert.ok(h.reads.every(read=>read.filters.some(([key,value])=>key==='tenant_id'&&value===ids.tenant)));
  assert.deepEqual(h.calls.map(call=>call.name),['reserve_company_operation','fiscal_contract']);
  h=reset();h.body=JSON.stringify({tipoAmbiente:0,erro:{codigo:'E2404'}});
  const compatible=await diagnoseCertificateSefin(ids.certificate);
  assert.match(compatible.details,/Resultado: sefin_verified/);assert.match(compatible.details,/Resposta compatível com o contrato: não/);assert.match(compatible.details,/compatibilidade restrita GET DPS/);
  assert.deepEqual(h.calls.map(call=>call.name),['reserve_company_operation','fiscal_contract'],'transport compatibility must not write proof or enqueue invoices from a diagnostic');assert.equal(h.gets.length,1);
  h=reset();h.tenant='00000000-0000-4000-8000-000000000099';assert.ok((await diagnoseCertificateSefin(ids.certificate)).error);assert.equal(h.calls.length+h.loads.length+h.gets.length,0);
  h=reset();h.rows.companies[0].tenant_id='foreign';assert.ok((await diagnoseCertificateSefin(ids.certificate)).error);assert.equal(h.calls.length+h.loads.length+h.gets.length,0);
  h=reset();h.rows.company_certificates[0].status='revoked';assert.ok((await diagnoseCertificateSefin(ids.certificate)).error);assert.equal(h.calls.length+h.loads.length+h.gets.length,0);
  h=reset();h.authenticated=false;await assert.rejects(diagnoseCertificateSefin(ids.certificate),/AUTH_REQUIRED/);assert.equal(h.calls.length+h.loads.length+h.gets.length,0);
  h=reset();assert.ok((await diagnoseCertificateSefin('invalid')).error);assert.equal(h.reads.length+h.calls.length+h.loads.length+h.gets.length,0);
  h=reset();h.quota=false;assert.ok((await diagnoseCertificateSefin(ids.certificate)).error);assert.equal(h.loads.length+h.gets.length,0);
  h=reset();h.loadFails=true;const failed=await diagnoseCertificateSefin(ids.certificate);assert.match(failed.details,/certificate_unavailable/);assert.ok(!JSON.stringify(failed).includes('SYNTHETIC_PRIVATE_FAILURE'));assert.equal(h.gets.length,0);
  console.log('SEFIN diagnostic action: session/tenant/certificate ownership, revoked certificate, quota and material guards passed; GET only, no fiscal mutation or private response disclosure. All external boundaries synthetic.');
}finally{delete globalThis.sefinHarness;await rm(temporary,{recursive:true,force:true});}
