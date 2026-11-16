// Actual read-only action and report, synthetic session/database only. No admin, A1, worker or HTTP dependency.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),require=createRequire(import.meta.url),{build}=require(path.join(process.env.UI_TOOLS_DIR,'esbuild'));
const temporary=await mkdtemp(path.join(tmpdir(),'fiscal-operation-report-')),id='00000000-0000-4000-8000-000000000001';
function reset(){
 const h={authenticated:true,tenant:'synthetic-own',reads:[],operation:{id,tenant_id:'synthetic-own',status:'uncertain',reason:'not_found',transmit_count:1,reconcile_attempts:2,created_at:'2026-11-15T12:00:00Z',updated_at:'2026-11-15T12:06:00Z'}};
 h.client={from(table){const filters=[];return {select(){return this;},eq(key,value){filters.push([key,value]);return this;},in(){return this;},limit(){return this;},order(){return this;},async maybeSingle(){h.reads.push({table,filters});return {data:filters.every(([k,v])=>h.operation[k]===v)?h.operation:null};},then(resolve){h.reads.push({table,filters});return Promise.resolve({data:[{event:'fiscal.dispatch_started',created_at:'2026-11-15T12:00:00Z'},{event:'fiscal.uncertain',created_at:'2026-11-15T12:00:05Z'}]}).then(resolve);}};}};
 globalThis.operationReportHarness=h;return h;
}
try{
 const built=await build({entryPoints:[path.join(root,'src/app/painel/notas/diagnostic-actions.ts')],bundle:true,platform:'node',format:'esm',write:false,tsconfig:path.join(root,'tsconfig.json'),plugins:[{name:'synthetic-session',setup(b){
  b.onResolve({filter:/^@\/lib\/tenancy-server$/},a=>({path:a.path,namespace:'boundary'}));
  b.onLoad({filter:/.*/,namespace:'boundary'},()=>({contents:'export async function requireWorkspace(){const h=globalThis.operationReportHarness;if(!h.authenticated)throw new Error("AUTH_REQUIRED");return {client:h.client,context:{tenantId:h.tenant}};}',loader:'js'}));
 }}]});
 const modulePath=path.join(temporary,'action.mjs');await writeFile(modulePath,built.outputFiles[0].text);const {getFiscalOperationDiagnostic}=await import(modulePath);
 let h=reset();const result=await getFiscalOperationDiagnostic(id);assert.match(result.details,/nfse-operation-v1/);assert.match(result.details,/primeiro resultado: 5 s/);assert.equal(h.reads.length,2);assert.ok(h.reads.every(r=>r.filters.some(([k,v])=>k==='tenant_id'&&v==='synthetic-own')));
 h=reset();h.tenant='foreign';assert.ok((await getFiscalOperationDiagnostic(id)).error);assert.equal(h.reads.length,1,'foreign operation cannot expose its audit events');
 h=reset();h.authenticated=false;await assert.rejects(getFiscalOperationDiagnostic(id),/AUTH_REQUIRED/);assert.equal(h.reads.length,0);
 h=reset();assert.ok((await getFiscalOperationDiagnostic('invalid')).error);assert.equal(h.reads.length,0);
 console.log('Operation report action: session/tenant guards and audit isolation passed; read-only dependencies, no A1/HTTP/admin/queue mutation. Synthetic Auth/DB only.');
}finally{delete globalThis.operationReportHarness;await rm(temporary,{recursive:true,force:true});}
