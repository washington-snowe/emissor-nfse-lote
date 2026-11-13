// Real server actions/domain/read boundaries, with explicit in-memory Auth/DB/Next/worker adapters.
// No real session, Supabase connection, certificate, fiscal request or note is used here.
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFile,mkdtemp,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createHash} from "node:crypto";
import {parseShopeeSellerCsv} from "../../src/lib/shopee-seller-csv.ts";
import {automaticAffiliateDraft} from "../../src/lib/nfse/automatic-affiliate.ts";
import {MEI_AFFILIATE_EVIDENCE} from "../../src/lib/nfse/mei-affiliate.ts";
const require=createRequire(import.meta.url),root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const {build}=require(path.join(process.env.UI_TOOLS_DIR,"esbuild"));
const temporary=await mkdtemp(path.join(tmpdir(),"quick-review-actions-"));
const ids={tenant:"00000000-0000-4000-8000-000000000010",actor:"00000000-0000-4000-8000-000000000011",company:"00000000-0000-4000-8000-000000000012",report:"00000000-0000-4000-8000-000000000013",profile:"00000000-0000-4000-8000-000000000014",review:"00000000-0000-4000-8000-000000000015",request:"00000000-0000-4000-8000-000000000016"};
const parsed=await parseShopeeSellerCsv(await readFile(path.join(root,"tests/fixtures/shopee-seller-monthly-v1.csv")));assert.ok(parsed.data);
const configuration={issuerMunicipality:"3550308",series:"1",simplesOption:"2",specialRegime:"0",serviceMunicipality:"3550308",nationalTaxCode:"170601",description:"Teste sintético",issTaxation:"1",issWithholding:"1",totals:{mode:"not_informed"}};
function reset(){
  const h={tenant:ids.tenant,authenticated:true,failEnqueue:false,failConfirm:false,schemaValid:true,afters:[],processed:[],calls:[],reads:[],batches:[],rows:{
    companies:[{id:ids.company,tenant_id:ids.tenant,cnpj:"11222333000181",tax_regime:"mei",address:{municipality_code:"3550308"},opened_on:"2020-01-01"}],
    report_imports:[{id:ids.report,tenant_id:ids.tenant,company_id:ids.company,status:"parsed",file_sha256:parsed.data.review.source.fileSha256,parsed_payload:structuredClone(parsed.data)}],
    company_fiscal_profiles:[{id:ids.profile,tenant_id:ids.tenant,company_id:ids.company,configuration,configuration_sha256:"a".repeat(64),valid_from:"2026-01-01",version:1,evidence_reference:"Orientação sintética",created_at:"2026-11-12T12:00:00Z"}],report_reviews:[],fiscal_operations:[]}};
  h.client={from(table){const filters=[];return {select(){return this;},eq(key,value){filters.push([key,value]);return this;},order(){return this;},limit(){return this;},async maybeSingle(){h.reads.push({table,filters});const rows=h.rows[table].filter(row=>filters.every(([key,value])=>row[key]===value));return {data:rows.at(-1)??null,error:null};}};}};
  h.admin={async rpc(name,args){h.calls.push({name,args});assert.equal(args.p_actor,ids.actor,"actor must come from the server session");
    if(name==="reserve_company_operation")return {data:true};
    if(name==="enable_invoice_email"){assert.ok(h.batches.some(b=>b.id===args.p_batch));return {data:true};}
    if(name==="save_fiscal_profile"){
      const previous=h.rows.company_fiscal_profiles.at(-1);
      if(args.p_expected_version!==previous.version)return {error:{code:"40001"}};
      assert.equal(args.p_company,ids.company);assert.deepEqual(args.p_configuration,previous.configuration,"date adjustment must not change any fiscal parameter");
      const row={...previous,id:"00000000-0000-4000-8000-000000000017",version:previous.version+1,valid_from:args.p_valid_from,evidence_reference:args.p_evidence};h.rows.company_fiscal_profiles.push(row);
      return {data:{id:row.id,version:row.version,sha256:row.configuration_sha256}};
    }
    if(name==="save_report_review"){
      assert.equal(args.p_expected_version,h.rows.report_reviews.at(-1)?.version??0);assert.equal(args.p_snapshot.recipientRoleConfirmed,true);
      const row={id:ids.review,tenant_id:ids.tenant,import_id:ids.report,company_id:ids.company,profile_id:args.p_profile,version:(h.rows.report_reviews.at(-1)?.version??0)+1,snapshot:args.p_snapshot,snapshot_sha256:createHash("sha256").update(JSON.stringify(args.p_snapshot)).digest("hex")};h.rows.report_reviews.push(row);return {data:{id:row.id,version:row.version,sha256:row.snapshot_sha256}};
    }
    if(name==="confirm_report_review"){if(h.failConfirm)return {error:{code:"40001"}};return {data:"synthetic-confirmation"};}
    if(name==="enqueue_report_fiscal"){
      let batch=h.batches.find(x=>x.review===args.p_review||x.request===args.p_request);const duplicate=Boolean(batch);
      if(!batch){batch={id:"synthetic-batch",review:args.p_review,request:args.p_request};h.batches.push(batch);}
      if(h.failEnqueue){h.failEnqueue=false;throw new Error("SYNTHETIC LOST ACKNOWLEDGEMENT");}
      return {data:{id:batch.id,duplicate}};
    }
    throw new Error("Unexpected RPC: "+name);
  }};
  globalThis.quickHarness=h;return h;
}
try{
  const result=await build({stdin:{contents:'export * from "./src/app/painel/importacoes/quick-actions.ts"; export {loadQuickReportReview} from "./src/lib/quick-report-review.ts";',resolveDir:root},bundle:true,platform:"node",format:"esm",write:false,tsconfig:path.join(root,"tsconfig.json"),plugins:[{name:"test-boundaries",setup(b){
    const virtual={"server-only":"", "next/cache":"export function revalidatePath(){}", "next/server":"export function after(fn){globalThis.quickHarness.afters.push(fn);}",
      "@/lib/tenancy-server":"export async function requireWorkspace(){const h=globalThis.quickHarness;if(!h.authenticated)throw new Error('AUTH_REQUIRED');return {client:h.client,context:{tenantId:h.tenant,user:{id:'"+ids.actor+"'}}};}",
      "@/lib/supabase/admin":"export function createAdminClient(){return globalThis.quickHarness.admin;}",
      "@/lib/automatic-fiscal-setup":"export async function ensureAutomaticFiscalSetup(){return {reason:'configured'};}",
      "@/lib/nfse/schema":"export async function validateFiscalDocuments(){return globalThis.quickHarness.schemaValid;} export async function validateFiscalSchema(){return globalThis.quickHarness.schemaValid;}",
      "@/lib/queue-runner":"export async function processQueuedWork(tenant){globalThis.quickHarness.processed.push(tenant);}"};
    b.onResolve({filter:/.*/},a=>Object.hasOwn(virtual,a.path)?{path:a.path,namespace:"boundary"}:undefined);
    b.onLoad({filter:/.*/,namespace:"boundary"},a=>({contents:virtual[a.path],loader:"js"}));
  }}]});
  const modulePath=path.join(temporary,"actions.mjs");await writeFile(modulePath,result.outputFiles[0].text);const actions=await import(modulePath);
  async function formFor(){const loaded=await actions.loadQuickReportReview(ids.report);assert.ok(loaded?.data.digest);const form=new FormData();form.set("reviewed","on");form.set("input",JSON.stringify(loaded.data.input));form.set("digest",loaded.data.digest);form.set("version",String(loaded.data.version));form.set("request",ids.request);return {loaded,form};}
  let h=reset(),{form,loaded}=await formFor();
  assert.equal(loaded.data.preview.recipientRoleConfirmed,false);assert.equal(h.rows.report_reviews.length,0);assert.equal(h.calls.length,0,"opening preview must not confirm or enqueue");
  form.delete("reviewed");assert.ok((await actions.confirmAndQueueQuickReview(ids.report,form)).error);assert.equal(h.calls.length,0);
  h=reset();({form}=await formFor());form.set("input",JSON.stringify({...JSON.parse(form.get("input")),competenceDate:"2026-11-01"}));assert.ok((await actions.confirmAndQueueQuickReview(ids.report,form)).error);assert.equal(h.calls.length,0,"unreviewed edits cannot be submitted under the old digest");
  h=reset();({form}=await formFor());h.rows.company_fiscal_profiles[0].configuration_sha256="b".repeat(64);h.rows.company_fiscal_profiles[0].version=2;assert.ok((await actions.confirmAndQueueQuickReview(ids.report,form)).error);assert.equal(h.calls.length,0);
  h=reset();({form}=await formFor());h.rows.company_fiscal_profiles[0].valid_from="2026-11-01";assert.ok((await actions.confirmAndQueueQuickReview(ids.report,form)).error);assert.equal(h.calls.length,0,"checking the UI box cannot bypass competence before profile validity");
  h=reset();({form}=await formFor());h.tenant="00000000-0000-4000-8000-000000000099";assert.ok((await actions.confirmAndQueueQuickReview(ids.report,form)).error);assert.equal(h.calls.length,0,"foreign import cannot cause any privileged RPC");
  h=reset();({form}=await formFor());h.authenticated=false;await assert.rejects(actions.confirmAndQueueQuickReview(ids.report,form),/AUTH_REQUIRED/);assert.equal(h.calls.length,0);
  h=reset();({form}=await formFor());h.failConfirm=true;assert.ok((await actions.confirmAndQueueQuickReview(ids.report,form)).error);assert.equal(h.batches.length,0);assert.equal(h.afters.length,0);
  h=reset();({form}=await formFor());h.schemaValid=false;assert.ok((await actions.confirmAndQueueQuickReview(ids.report,form)).error);assert.equal(h.rows.report_reviews.length,0);assert.equal(h.batches.length,0);
  h=reset();({form}=await formFor());h.failEnqueue=true;await assert.rejects(actions.confirmAndQueueQuickReview(ids.report,form),/LOST ACKNOWLEDGEMENT/);assert.equal(h.batches.length,1);
  const retried=await actions.confirmAndQueueQuickReview(ids.report,form);assert.equal(retried.id,"synthetic-batch");assert.equal(retried.duplicate,true);assert.equal(h.batches.length,1);assert.equal(h.rows.report_reviews.length,1,"retry reuses the exact saved snapshot");
  assert.deepEqual(h.calls.filter(x=>x.name==="enqueue_report_fiscal").map(x=>x.args.p_request),[ids.request,ids.request]);
  assert.equal(h.afters.length,1);assert.equal(h.processed.length,0);await h.afters[0]();assert.deepEqual(h.processed,[ids.tenant]);
  assert.ok(h.reads.every(read=>read.filters.some(([key,value])=>key==="tenant_id"&&value===ids.tenant)),"every private read uses the session tenant");
  h=reset();let legacy=h.rows.company_fiscal_profiles[0];legacy.configuration=automaticAffiliateDraft(h.rows.companies[0],"2026-11-13").profile;legacy.evidence_reference=MEI_AFFILIATE_EVIDENCE;legacy.valid_from="2026-11-12";
  const repaired=await actions.loadQuickReportReview(ids.report);assert.ok(repaired.data.digest);assert.equal(repaired.data.input.competenceDate,"2026-10-31");assert.equal(repaired.current.valid_from,"2020-01-01");assert.equal(repaired.current.version,2);assert.equal(legacy.valid_from,"2026-11-12");assert.deepEqual(repaired.current.configuration,legacy.configuration);assert.equal(h.batches.length,0);assert.equal(h.rows.report_reviews.length,0);
  const writes=h.calls.filter(c=>c.name==="save_fiscal_profile").length;await actions.loadQuickReportReview(ids.report);assert.equal(h.calls.filter(c=>c.name==="save_fiscal_profile").length,writes,"automatic repair runs only once");
  h=reset();legacy=h.rows.company_fiscal_profiles[0];legacy.configuration=automaticAffiliateDraft(h.rows.companies[0],"2026-11-13").profile;legacy.evidence_reference=MEI_AFFILIATE_EVIDENCE;legacy.valid_from="2026-11-12";h.rows.fiscal_operations.push({id:"existing-operation",company_id:ids.company,tenant_id:ids.tenant});const occupied=await actions.loadQuickReportReview(ids.report);assert.ok(occupied.data.error);assert.equal(h.calls.length,0,"existing operations prevent silent automatic profile change");
  h=reset();h.rows.company_fiscal_profiles[0].valid_from="2026-11-12";
  const blocked=await actions.loadQuickReportReview(ids.report);assert.ok(blocked.data.validityAdjustment);assert.equal(h.calls.length,0,"custom profile is not automatically backdated");
  const adjustment=new FormData();adjustment.set("input",JSON.stringify(blocked.data.input));adjustment.set("previewDigest",blocked.data.validityAdjustment.previewDigest);
  assert.ok((await actions.adjustQuickReviewValidity(ids.report,adjustment)).error);assert.equal(h.calls.length,0,"date change needs explicit same-configuration acknowledgement");
  adjustment.set("sameConfiguration","on");const adjusted=await actions.adjustQuickReviewValidity(ids.report,adjustment);assert.ok(adjusted.data.digest);assert.equal(adjusted.data.input.competenceDate,"2026-10-31");assert.equal(h.rows.company_fiscal_profiles.at(-1).valid_from,"2026-10-31");assert.equal(h.rows.company_fiscal_profiles[0].valid_from,"2026-11-12");assert.equal(h.batches.length,0);
  await actions.adjustQuickReviewValidity(ids.report,adjustment);assert.equal(h.rows.company_fiscal_profiles.length,2,"retry after successful date adjustment never appends another profile");
  h=reset();h.rows.company_fiscal_profiles[0].valid_from="2026-11-12";const beforeOther=await actions.loadQuickReportReview(ids.report);adjustment.set("previewDigest",beforeOther.data.validityAdjustment.previewDigest);h.tenant="00000000-0000-4000-8000-000000000099";assert.ok((await actions.adjustQuickReviewValidity(ids.report,adjustment)).error);assert.equal(h.calls.length,0,"foreign account cannot adjust known profile validity");
  const emailEnvNames=['NFSE_EMAIL_ENABLED','NFSE_EMAIL_FROM','BREVO_API_KEY'];const emailEnv=emailEnvNames.map(name=>process.env[name]);
  try{
    process.env.NFSE_EMAIL_ENABLED='true';process.env.NFSE_EMAIL_FROM='nfse@example.com';process.env.BREVO_API_KEY='synthetic';
    h=reset();let emailForm=await formFor();
    assert.ok((await actions.confirmAndQueueQuickReview(ids.report,emailForm.form)).error);assert.equal(h.calls.length,0,'no email enrollment without explicit current consent');
    emailForm.form.set('emailReviewed','on');assert.ok((await actions.confirmAndQueueQuickReview(ids.report,emailForm.form)).id);
    assert.equal(h.calls.filter(c=>c.name==='enable_invoice_email').length,1);assert.equal(h.batches.length,1);
  }finally{emailEnvNames.forEach((name,index)=>{if(emailEnv[index]===undefined)delete process.env[name];else process.env[name]=emailEnv[index];});}
  console.log("Quick review server actions: consent/digest/profile/session/tenant guards; lost-acknowledgement replay; legacy MEI validity repair; custom-profile acknowledgement and date-only replay preserve competence/history with no invoice queued. Auth/DB/Next adapters are synthetic.");
}finally{delete globalThis.quickHarness;await rm(temporary,{recursive:true,force:true});}
