// Real action, sequential worker and provider adapters; synthetic Auth/DB/HTTP only.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const require=createRequire(import.meta.url),{build}=require(path.join(process.env.UI_TOOLS_DIR,'esbuild'));
const temporary=await mkdtemp(path.join(tmpdir(),'rex-provider-tests-'));
const env={NFSE_EMAIL_ENABLED:'true',NFSE_EMAIL_FROM:'notes@example.com',NFSE_EMAIL_TEST_TO:'configured@example.com',BREVO_API_KEY:'synthetic',SENDPULSE_CLIENT_ID:'synthetic',SENDPULSE_CLIENT_SECRET:'synthetic',MAILJET_API_KEY:'synthetic',MAILJET_SECRET_KEY:'synthetic'};
const previous=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]])),originalFetch=globalThis.fetch;
function reset(){
 const h={context:{user:{id:'session-owner',email:'owner@example.com',email_confirmed_at:'2026-11-01'},tenantId:'session-tenant'},after:[],calls:[],http:[],jobs:[],active:0,peak:0,ready:true,intent:true,finish:true,created:false};
 h.admin={async rpc(name,args){h.calls.push({name,args});
  if(name==='request_email_provider_tests'){
   assert.equal(args.p_actor,h.context.user.id);
   if(!h.created){h.jobs=['brevo','sendpulse','mailjet'].map(provider=>({id:provider,token:'synthetic-token',provider,destination:args.p_destination}));h.created=true;}
   return {data:true};
  }
  if(name==='email_provider_tests_ready')return {data:h.ready&&h.jobs.length>0};
  if(name==='claim_email_provider_test')return {data:h.jobs.shift()??null};
  if(name==='begin_email_provider_test')return {data:h.intent?{provider:args.p_id}:{waiting:true}};
  if(name==='finish_email_provider_test')return {data:h.finish};
  if(name==='claim_invoice_email')return {data:null};
  throw new Error('Unexpected synthetic RPC');
 }};
 globalThis.providerTestHarness=h;
 globalThis.fetch=async(url,init)=>{h.active++;h.peak=Math.max(h.peak,h.active);h.http.push({url,body:JSON.parse(init.body)});
  await new Promise(resolve=>setTimeout(resolve,2));h.active--;
  if(url.endsWith('/oauth/access_token'))return Response.json({access_token:'synthetic-token'});
  if(url.includes('brevo'))return Response.json({messageId:'synthetic-brevo'});
  if(url.includes('sendpulse'))return Response.json({result:true,id:'synthetic-sendpulse'});
  return Response.json({Messages:[{Status:'success',To:[{MessageUUID:'synthetic-mailjet'}]}]});
 };
 return h;
}
function form(destination='owner@example.com'){
 const f=new FormData();f.set('request','00000000-0000-4000-8000-000000000099');f.set('destination',destination);f.set('actor','forged-actor');return f;
}
try{
 Object.assign(process.env,env);
 const files={};
 for(const [name,entry] of Object.entries({action:'src/app/painel/notas/email-teste/actions.ts',worker:'src/lib/email/jobs.ts'})){
  const built=await build({entryPoints:[path.join(root,entry)],bundle:true,platform:'node',format:'esm',write:false,tsconfig:path.join(root,'tsconfig.json'),plugins:[{name:'test-boundaries',setup(b){
   const virtual={'server-only':'','@/lib/supabase/admin':'export function createAdminClient(){return globalThis.providerTestHarness.admin;}','@/lib/tenancy-server':'export async function requireWorkspace(){return {context:globalThis.providerTestHarness.context};}','next/server':'export function after(fn){globalThis.providerTestHarness.after.push(fn);}','next/cache':'export function revalidatePath(){}'};
   b.onResolve({filter:/.*/},a=>Object.hasOwn(virtual,a.path)?{path:a.path,namespace:'boundary'}:undefined);
   b.onLoad({filter:/.*/,namespace:'boundary'},a=>({contents:virtual[a.path],loader:'js'}));
  }}]});files[name]=path.join(temporary,name+'.mjs');await writeFile(files[name],built.outputFiles[0].text);
 }
 const {requestProviderTests}=await import(files.action),{processInvoiceEmails}=await import(files.worker);
 let h=reset();assert.ok((await requestProviderTests({},form('foreign@example.com'))).error);assert.equal(h.calls.length,0,'arbitrary recipient cannot be queued');
 h=reset();h.context.user.email_confirmed_at=undefined;assert.ok((await requestProviderTests({},form())).error);assert.equal(h.calls.length,0,'unconfirmed account address cannot be used');
 h=reset();delete process.env.MAILJET_SECRET_KEY;assert.ok((await requestProviderTests({},form())).error);assert.equal(h.calls.length,0,'all providers must be configured before starting');process.env.MAILJET_SECRET_KEY=env.MAILJET_SECRET_KEY;
 h=reset();assert.ok((await requestProviderTests({},form())).success);assert.equal(h.http.length,0,'request queues only; dispatch is after response');
 await h.after[0]();
 assert.equal(h.peak,1,'no parallel external requests');
 assert.deepEqual(h.calls.filter(c=>c.name==='finish_email_provider_test').map(c=>c.args.p_id),['brevo','sendpulse','mailjet']);
 assert.equal(h.http.length,4,'three messages and one OAuth request');
 for(const send of h.http.filter(r=>!r.url.endsWith('/oauth/access_token'))){
  assert.ok(JSON.stringify(send.body).includes('owner@example.com'));assert.ok(!/attachment|Attachment|<NFSe|SEM VALOR FISCAL/.test(JSON.stringify(send.body)));
 }
 assert.ok(!h.calls.some(c=>c.name.includes('fiscal')||c.name==='begin_invoice_email'),'provider test never sends an invoice');
 h=reset();assert.ok((await requestProviderTests({},form('configured@example.com'))).success,'configured test address is also allowed');
 h=reset();await requestProviderTests({},form());h.intent=false;await h.after[0]();assert.equal(h.http.length,0,'waiting/denied intent prevents HTTP');
 h=reset();await requestProviderTests({},form());h.finish=false;await processInvoiceEmails().catch(()=>{});assert.equal(h.http.length,1,'completion failure never advances to another send');
 h=reset();h.ready=false;assert.equal((await processInvoiceEmails()).processed,0);assert.equal(h.http.length,0,'no ready tests means no provider request');
 console.log('Provider tests: verified/configured recipient only, session actor, complete configuration, persisted intent, sequential Brevo/SendPulse/Mailjet, no invoice/attachment, no HTTP on waiting intent and no automatic retry after uncertain completion. All boundaries synthetic.');
}finally{
 for(const k of Object.keys(env)){if(previous[k]===undefined)delete process.env[k];else process.env[k]=previous[k];}
 globalThis.fetch=originalFetch;delete globalThis.providerTestHarness;await rm(temporary,{recursive:true,force:true});
}
