// Actual server action; synthetic Auth/admin/material/GET/inspection boundaries. No real A1 or HTTP.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),require=createRequire(import.meta.url),{build}=require(path.join(process.env.UI_TOOLS_DIR,'esbuild'));
const directory=await mkdtemp(path.join(tmpdir(),'fiscal-receipt-action-')),id='00000000-0000-4000-8000-000000000001';
function reset(){
 const h={authenticated:true,tenant:'own',reads:[],rpcCalls:[],loads:[],http:[],status:201,snapshot:{synthetic:true},
  operation:{id,tenant_id:'own',company_id:'own-company',issuer_cnpj:'11222333000181',environment:'homologation',dps_id:'DPS'+'1'.repeat(42),status:'uncertain',transmit_count:1}};
 h.client={from(table){assert.equal(table,'fiscal_operations');const filters=[];return {select(){return this;},eq(k,v){filters.push([k,v]);return this;},async maybeSingle(){h.reads.push(filters);return {data:filters.every(([k,v])=>h.operation[k]===v)?h.operation:null};}};},async rpc(name,args){assert.equal(name,'fiscal_transport_diagnostic_report');assert.deepEqual(args,{p_operation:id});return {data:[{stage:'submit',data:{phase:'response',http:h.status}}]};}};
 h.admin={async rpc(name,args){h.rpcCalls.push({name,args});
  if(name==='fiscal_xml_snapshot_for_diagnostic'){assert.deepEqual(args,{p_actor:'owner-user',p_operation:id});return {data:h.snapshot};}
  if(name==='fiscal_contract'){assert.deepEqual(args,{p_environment:'homologation'});return {data:{synthetic:true}};}
  if(name==='fiscal_processing_certificate'){assert.deepEqual(args,{p_operation:id});return {data:'own-certificate'};}
  throw new Error('Unexpected mutation/RPC '+name);
 }};globalThis.receiptActionHarness=h;return h;
}
try{
 const virtual={
  '@/lib/tenancy-server':'export async function requireWorkspace(){const h=globalThis.receiptActionHarness;if(!h.authenticated)throw new Error("AUTH_REQUIRED");return {client:h.client,context:{tenantId:h.tenant,user:{id:"owner-user"}}};}',
  '@/lib/supabase/admin':'export function createAdminClient(){return globalThis.receiptActionHarness.admin;}',
  '@/lib/certificate-material':'export async function loadCertificateMaterial(identity,purpose){const h=globalThis.receiptActionHarness;h.loads.push(identity);if(identity.tenantId!==h.tenant||identity.companyId!==h.operation.company_id||identity.certificateId!=="own-certificate"||purpose!=="reconcile")throw new Error("WRONG_MATERIAL_SCOPE");return {pfx:Buffer.from("SYNTHETIC"),metadata:{subject_cnpj:h.operation.issuer_cnpj}};}',
  '@/lib/nfse/http':'export async function nfseGet(env,url,material,timeout){const h=globalThis.receiptActionHarness;if(env!=="homologation"||timeout<=0||timeout>5000)throw new Error("WRONG_GET_SCOPE");h.http.push({method:"GET",url});return {status:200,body:Buffer.from("{}")};}',
  '@/lib/nfse/issued-diagnostic':'export async function diagnoseIssuedNfse(identity,deps){const h=globalThis.receiptActionHarness;if(identity.operationId!==h.operation.id||identity.dpsId!==h.operation.dps_id||identity.snapshot!==h.snapshot)throw new Error("WRONG_SNAPSHOT");const material=await deps.load();try{await deps.get("https://sefin.producaorestrita.nfse.gov.br/SefinNacional/dps/"+identity.dpsId,material);return {verified:false,details:"SYNTHETIC receipt inspection only"};}finally{material.pfx.fill(0);}}'
 };
 const result=await build({entryPoints:[path.join(root,'src/app/painel/notas/receipt-diagnostic-actions.ts')],bundle:true,platform:'node',format:'esm',write:false,tsconfig:path.join(root,'tsconfig.json'),plugins:[{name:'synthetic-boundaries',setup(b){b.onResolve({filter:/.*/},a=>Object.hasOwn(virtual,a.path)?{path:a.path,namespace:'boundary'}:undefined);b.onLoad({filter:/.*/,namespace:'boundary'},a=>({contents:virtual[a.path],loader:'js'}));}}]});
 const modulePath=path.join(directory,'action.mjs');await writeFile(modulePath,result.outputFiles[0].text);const {getFiscalReceiptDiagnostic}=await import(modulePath);
 let h=reset();assert.match((await getFiscalReceiptDiagnostic(id)).details,/SYNTHETIC receipt/);assert.equal(h.http.length,1);assert.equal(h.rpcCalls.length,3);assert.equal(h.loads.length,1);assert.ok(h.reads[0].some(([k,v])=>k==='tenant_id'&&v==='own'));
 h=reset();h.tenant='foreign';assert.ok((await getFiscalReceiptDiagnostic(id)).error);assert.equal(h.rpcCalls.length,0);assert.equal(h.loads.length,0);assert.equal(h.http.length,0);
 h=reset();h.authenticated=false;await assert.rejects(getFiscalReceiptDiagnostic(id),/AUTH_REQUIRED/);assert.equal(h.reads.length,0);
 h=reset();assert.ok((await getFiscalReceiptDiagnostic('invalid')).error);assert.equal(h.reads.length,0);
 for(const changed of [{environment:'production'},{status:'authorized'},{transmit_count:0}]){h=reset();Object.assign(h.operation,changed);assert.ok((await getFiscalReceiptDiagnostic(id)).error);assert.equal(h.rpcCalls.length,0);assert.equal(h.http.length,0);}
 h=reset();h.status=400;assert.ok((await getFiscalReceiptDiagnostic(id)).error);assert.equal(h.rpcCalls.length,0);assert.equal(h.loads.length,0);
 h=reset();h.snapshot=null;assert.ok((await getFiscalReceiptDiagnostic(id)).error);assert.equal(h.rpcCalls.length,1);assert.equal(h.loads.length,0);assert.equal(h.http.length,0);
 console.log('Receipt diagnostic action: owner/session/company/201 guards, existing snapshot quota, protected reconcile material and GET-only dependency; no queue/authorization RPC. All external boundaries synthetic.');
}finally{delete globalThis.receiptActionHarness;await rm(directory,{recursive:true,force:true});}
