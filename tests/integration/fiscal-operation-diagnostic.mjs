// Actual owner-guarded action and report. Synthetic session/admin DB/local inspector; no A1 or fiscal HTTP.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),require=createRequire(import.meta.url),{build}=require(path.join(process.env.UI_TOOLS_DIR,'esbuild'));
const temporary=await mkdtemp(path.join(tmpdir(),'fiscal-operation-report-')),id='00000000-0000-4000-8000-000000000001';
function reset(){
 const h={authenticated:true,tenant:'synthetic-own',reads:[],rpcs:[],traceError:null,schemaError:false,timeError:false,createdResponse:false,snapshotError:null,adminCalls:[],snapshot:{synthetic:true},operation:{id,tenant_id:'synthetic-own',status:'uncertain',reason:'not_found',transmit_count:1,reconcile_attempts:2,created_at:'2026-11-15T12:00:00Z',updated_at:'2026-11-15T12:06:00Z'}};
 h.client={from(table){const filters=[];return {select(){return this;},eq(key,value){filters.push([key,value]);return this;},in(){return this;},limit(){return this;},order(){return this;},async maybeSingle(){h.reads.push({table,filters});return {data:filters.every(([k,v])=>h.operation[k]===v)?h.operation:null};},then(resolve){h.reads.push({table,filters});return Promise.resolve({data:[{event:'fiscal.dispatch_started',created_at:'2026-11-15T12:00:00Z'},{event:'fiscal.uncertain',created_at:'2026-11-15T12:00:05Z'}]}).then(resolve);}};}};
 h.client.rpc=async(name,args)=>{h.rpcs.push({name,args});assert.equal(name,'fiscal_transport_diagnostic_report');assert.equal(args.p_operation,h.operation.id);return {data:h.traceError?null:[{stage:'submit',data:{phase:'response',http:h.createdResponse?201:h.schemaError?400:403,format:'json_object',environment:'number_2',codes:h.timeError?['E0008']:h.schemaError?['E1235']:[],elapsedMs:900}}],error:h.traceError};};h.admin={async rpc(name,args){h.adminCalls.push({name,args});if(name==='fiscal_contract'){assert.deepEqual(args,{p_environment:h.operation.environment??'homologation'});return {data:{}};}assert.equal(name,'fiscal_xml_snapshot_for_diagnostic');assert.deepEqual(args,{p_actor:'synthetic-user',p_operation:id});return {data:h.snapshot,error:h.snapshotError};}};globalThis.operationReportHarness=h;return h;
}
try{
 const built=await build({entryPoints:[path.join(root,'src/app/painel/notas/diagnostic-actions.ts')],bundle:true,platform:'node',format:'esm',write:false,tsconfig:path.join(root,'tsconfig.json'),plugins:[{name:'synthetic-session',setup(b){
  const virtual={
   '@/lib/tenancy-server':'export async function requireWorkspace(){const h=globalThis.operationReportHarness;if(!h.authenticated)throw new Error("AUTH_REQUIRED");return {client:h.client,context:{tenantId:h.tenant,user:{id:"synthetic-user"}}};}',
   '@/lib/supabase/admin':'export function createAdminClient(){return globalThis.operationReportHarness.admin;}',
   '@/lib/nfse/stored-dps-diagnostic':'export async function inspectStoredDps(snapshot,dispatchAt){if(dispatchAt!=="2026-11-15T12:00:00Z")throw new Error("WRONG_DISPATCH");if(snapshot!==globalThis.operationReportHarness.snapshot)throw new Error("WRONG_SNAPSHOT");return ["SYNTHETIC local inspection only"];}'
  };
  b.onResolve({filter:/.*/},a=>Object.hasOwn(virtual,a.path)?{path:a.path,namespace:'boundary'}:undefined);
  b.onLoad({filter:/.*/,namespace:'boundary'},a=>({contents:virtual[a.path],loader:'js'}));
 }}]});
 const modulePath=path.join(temporary,'action.mjs');await writeFile(modulePath,built.outputFiles[0].text);const {getFiscalOperationDiagnostic}=await import(modulePath);
 let h=reset();const result=await getFiscalOperationDiagnostic(id);assert.match(result.details,/nfse-operation-v2/);assert.match(result.details,/primeiro resultado: 5 s/);assert.equal(h.reads.length,2);assert.match(result.details,/Primeiro envio: HTTP 403 · JSON/);assert.equal(h.rpcs.length,1);assert.ok(h.reads.every(r=>r.filters.some(([k,v])=>k==='tenant_id'&&v==='synthetic-own')));
 assert.equal(h.adminCalls.length,0);
 h=reset();h.createdResponse=true;h.operation.status='reconciling';assert.equal((await getFiscalOperationDiagnostic(id)).receiptAvailable,true);assert.equal(h.adminCalls.length,0,'history report never opens A1 or queries SEFIN');
 h=reset();h.schemaError=true;assert.match((await getFiscalOperationDiagnostic(id)).details,/SYNTHETIC local inspection only/);assert.equal(h.adminCalls.length,2);assert.equal(h.rpcs.length,1);
 h=reset();h.operation.environment='production';h.schemaError=true;const production=await getFiscalOperationDiagnostic(id);assert.match(production.details,/SYNTHETIC local inspection only/);assert.equal(production.receiptAvailable,false);assert.equal(h.adminCalls.find(c=>c.name==='fiscal_contract').args.p_environment,'production');
 h=reset();h.schemaError=true;h.snapshotError={code:'PGRST202'};assert.match((await getFiscalOperationDiagnostic(id)).details,/análise local aguardando atualização/);
 h=reset();h.timeError=true;const timeResult=await getFiscalOperationDiagnostic(id);assert.match(timeResult.details,/SYNTHETIC local inspection only/);assert.match(timeResult.details,/E0008: a SEFIN considerou dhEmi posterior/);assert.equal(h.adminCalls.length,2);assert.equal(h.rpcs.length,1);
 h=reset();h.traceError={code:'PGRST202'};assert.match((await getFiscalOperationDiagnostic(id)).details,/aguardando atualização/);
 h=reset();h.tenant='foreign';assert.ok((await getFiscalOperationDiagnostic(id)).error);assert.equal(h.rpcs.length,0);assert.equal(h.adminCalls.length,0);assert.equal(h.reads.length,1,'foreign operation cannot expose its audit events');
 h=reset();h.authenticated=false;await assert.rejects(getFiscalOperationDiagnostic(id),/AUTH_REQUIRED/);assert.equal(h.reads.length,0);
 h=reset();assert.ok((await getFiscalOperationDiagnostic('invalid')).error);assert.equal(h.reads.length,0);
 console.log('Operation report action: session/tenant guards and audit isolation passed; owner-bound snapshot read only after E1235/E0008, graceful missing migration, no A1/HTTP/queue mutation. Synthetic Auth/DB only.');
}finally{delete globalThis.operationReportHarness;await rm(temporary,{recursive:true,force:true});}
