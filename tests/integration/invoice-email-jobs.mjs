// Real worker/routing/provider adapters with synthetic Supabase and HTTP. No external emails.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {parseShopeeSellerCsv} from '../../src/lib/shopee-seller-csv.ts';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),require=createRequire(import.meta.url);
const {build}=require(path.join(process.env.UI_TOOLS_DIR,'esbuild'));
const temporary=await mkdtemp(path.join(tmpdir(),'invoice-email-worker-'));
const envNames=['NFSE_EMAIL_ENABLED','NFSE_EMAIL_FROM','NFSE_EMAIL_TEST_TO','BREVO_API_KEY'];const previousEnv=envNames.map(n=>process.env[n]);const originalFetch=globalThis.fetch;
const parsed=await parseShopeeSellerCsv(await readFile(path.join(root,'tests/fixtures/shopee-seller-monthly-v1.csv')));assert.ok(parsed.data);
const key='1'.repeat(50),xml='<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse"><infNFSe Id="NFS'+key+'"><nNFSe>1</nNFSe></infNFSe></NFSe>';
function reset(){
 const h={rpcCalls:[],http:[],claimed:false,job:{id:'synthetic-delivery',token:'synthetic-token',tenantId:'synthetic-tenant',environment:'homologation',accessKey:key,xmlSha256:createHash('sha256').update(xml).digest('hex'),xml,issuer:'Emissor sintético',issuerCnpj:'11222333000181',recipient:{legalName:'Tomador sintético'},competence:'2026-10-31',amount:'1.10',origin:'report',report:structuredClone(parsed.data),reportHash:parsed.data.review.source.fileSha256,group:{sourceRows:[2]}},httpStatus:201};
 h.admin={async rpc(name,args){h.rpcCalls.push({name,args});if(name==='claim_invoice_email'){if(h.claimed)return {data:null};h.claimed=true;return {data:h.job};}
 if(name==='begin_invoice_email'){assert.equal(args.p_destination,'owner@example.com');assert.equal(args.p_test,true);return {data:{provider:'brevo'}};}
 if(name==='finish_invoice_email')return {data:true};throw new Error('Unexpected RPC');}};
 globalThis.emailHarness=h;globalThis.fetch=async(url,init)=>{h.http.push({url,init});return h.httpStatus===201?Response.json({messageId:'synthetic-id'},{status:201}):new Response('',{status:h.httpStatus});};return h;
}
try{
 const built=await build({entryPoints:[path.join(root,'src/lib/email/jobs.ts')],bundle:true,platform:'node',format:'esm',write:false,tsconfig:path.join(root,'tsconfig.json'),plugins:[{name:'synthetic-email-boundaries',setup(b){
 const virtual={'server-only':'','@/lib/supabase/admin':'export function createAdminClient(){return globalThis.emailHarness.admin;}'};
 b.onResolve({filter:/.*/},a=>Object.hasOwn(virtual,a.path)?{path:a.path,namespace:'boundary'}:undefined);
 b.onLoad({filter:/.*/,namespace:'boundary'},a=>({contents:virtual[a.path],loader:'js'}));
 }}]});const modulePath=path.join(temporary,'worker.mjs');await writeFile(modulePath,built.outputFiles[0].text);const {processInvoiceEmails}=await import(modulePath);
 Object.assign(process.env,{NFSE_EMAIL_ENABLED:'true',NFSE_EMAIL_FROM:'nfse@example.com',NFSE_EMAIL_TEST_TO:'owner@example.com',BREVO_API_KEY:'synthetic'});
 let h=reset();delete process.env.NFSE_EMAIL_TEST_TO;await processInvoiceEmails('synthetic-tenant');assert.equal(h.http.length,0);assert.equal(h.rpcCalls.findLast(c=>c.name==='finish_invoice_email').args.p_outcome,'test_address_missing');
 process.env.NFSE_EMAIL_TEST_TO='owner@example.com';h=reset();h.job.report.reportedSellers[0].email=null;await processInvoiceEmails();assert.equal(h.http.length,0);assert.equal(h.rpcCalls.findLast(c=>c.name==='finish_invoice_email').args.p_outcome,'invalid_email');
 h=reset();h.job.group.sourceRows=[2,3];await processInvoiceEmails();assert.equal(h.http.length,0);assert.equal(h.rpcCalls.findLast(c=>c.name==='finish_invoice_email').args.p_outcome,'ambiguous_recipient');
 h=reset();h.job.xml+='tampered';await processInvoiceEmails();assert.equal(h.http.length,0);assert.equal(h.rpcCalls.findLast(c=>c.name==='finish_invoice_email').args.p_outcome,'document_invalid');
 h=reset();await processInvoiceEmails();assert.equal(h.http.length,1);const body=JSON.parse(h.http[0].init.body);assert.deepEqual(body.to,[{email:'owner@example.com'}]);assert.ok(body.subject.includes('SEM VALOR FISCAL'));assert.equal(Buffer.from(body.attachment[0].content,'base64').toString(),xml);assert.equal(h.rpcCalls.findLast(c=>c.name==='finish_invoice_email').args.p_outcome,'accepted');assert.equal(h.rpcCalls.findLast(c=>c.name==='finish_invoice_email').args.p_destination,'loja-a@empresa.example');
 h=reset();h.httpStatus=429;await processInvoiceEmails();assert.equal(h.http.length,1);assert.equal(h.rpcCalls.findLast(c=>c.name==='finish_invoice_email').args.p_outcome,'quota_rejected');
 h=reset();h.job.environment='production';await processInvoiceEmails();assert.equal(h.http.length,0,'email integration cannot release fiscal production');
 console.log('Email worker: real routing/provider code with synthetic DB/HTTP; no seller receives homologation; missing test address, invalid/ambiguous routes and tampered XML block HTTP; one send after intent; 429 records failover eligibility. No external requests.');
}finally{globalThis.fetch=originalFetch;delete globalThis.emailHarness;envNames.forEach((n,i)=>{if(previousEnv[i]===undefined)delete process.env[n];else process.env[n]=previousEnv[i];});await rm(temporary,{recursive:true,force:true});}
