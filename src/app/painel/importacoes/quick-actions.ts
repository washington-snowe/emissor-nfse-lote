"use server";
import {after} from "next/server";
import {revalidatePath} from "next/cache";
import {requireWorkspace} from "@/lib/tenancy-server";
import {createAdminClient} from "@/lib/supabase/admin";
import {loadQuickReportReview} from "@/lib/quick-report-review";
import {cleanQuickReviewInput,type QuickReviewData} from "@/lib/nfse/quick-review";
import {prepareFiscalReview,canonicalReviewJson} from "@/lib/nfse/review";
import {buildDps} from "@/lib/nfse/dps";
import {validateFiscalDocuments} from "@/lib/nfse/schema";
import {processQueuedWork} from "@/lib/queue-runner";
import {appendProfileValidity} from "@/lib/profile-validity-server";

export type QuickSubmitResult={error?:string;id?:string;duplicate?:boolean};
function readInput(payload:unknown){
  if(typeof payload!=="string"||Buffer.byteLength(payload)>800_000)return null;
  try{return cleanQuickReviewInput(JSON.parse(payload));}catch{return null;}
}
export async function refreshQuickReview(importId:string,payload:string):Promise<{data?:QuickReviewData;error?:string}> {
  const input=readInput(payload);
  if(!input)return {error:"Não foi possível ler os dados alterados."};
  const result=await loadQuickReportReview(importId,input);
  return result?{data:result.data}:{error:"A importação ou a configuração fiscal precisa ser atualizada."};
}
export async function adjustQuickReviewValidity(importId:string,form:FormData):Promise<{data?:QuickReviewData;error?:string}>{
  if(form.get("sameConfiguration")!=="on")return {error:"Confirme que os parâmetros do serviço já se aplicavam à competência exibida."};
  const input=readInput(form.get("input")),previewDigest=form.get("previewDigest");
  if(!input||typeof previewDigest!=="string"||!/^[a-f0-9]{64}$/.test(previewDigest))return {error:"Atualize a revisão antes de ajustar a vigência."};
  const loaded=await loadQuickReportReview(importId,input,false);
  if(!loaded)return {error:"Empresa ou configuração não encontrada no seu espaço."};
  if(!loaded.data.error&&loaded.data.digest)return {data:loaded.data}; // Safe retry after a successful date adjustment.
  const proposed=loaded.data.validityAdjustment;
  if(!proposed||proposed.previewDigest!==previewDigest)return {error:"O perfil ou os dados mudaram. Atualize a prévia antes de ajustar a vigência."};
  const evidence=`Vigência ajustada pelo titular para ${proposed.targetFrom}; parâmetros preservados do perfil ${loaded.current.id}, versão ${loaded.current.version}. Aplicabilidade declarada pelo titular; enquadramento sujeito à validação SEFIN.`;
  const saved=await appendProfileValidity(loaded.company,loaded.current,proposed.targetFrom,evidence);
  if(saved.error)return {error:saved.error};
  revalidatePath(`/painel/empresas/${loaded.company.id}/fiscal`);revalidatePath("/painel/importacoes","layout");
  const updated=await loadQuickReportReview(importId,input,false);
  return updated?{data:updated.data}:{error:"A vigência foi salva. Atualize a página para revisar a nova versão antes de emitir."};
}
export async function confirmAndQueueQuickReview(importId:string,form:FormData):Promise<QuickSubmitResult>{
  const {context}=await requireWorkspace();
  if(form.get("reviewed")!=="on")return {error:"Confirme que revisou as notas, o tomador e a competência exibidos."};
  const input=readInput(form.get("input")),digest=form.get("digest"),request=form.get("request"),version=form.get("version");
  if(!input||typeof digest!=="string"||!/^[a-f0-9]{64}$/.test(digest)||typeof request!=="string"||!/^[0-9a-f-]{36}$/i.test(request)||typeof version!=="string"||!/^(0|[1-9]\d{0,8})$/.test(version))return {error:"Não foi possível conferir a solicitação. Atualize a prévia."};
  const admin=createAdminClient(),loaded=await loadQuickReportReview(importId,input,false);
  if(!admin||!loaded||loaded.data.error||loaded.data.digest!==digest)return {error:"Os dados ou o perfil fiscal mudaram. Atualize a prévia e revise novamente antes de confirmar."};
  if(loaded.data.emailDelivery?.enabled&&form.get("emailReviewed")!=="on")return {error:"Atualize a revisão para conferir também os destinos dos e-mails."};
  const reserved=await admin.rpc("reserve_company_operation",{p_actor:context.user.id,p_company:loaded.binding.companyId,p_operation:"prepare_batch"});
  if(reserved.error||reserved.data!==true)return {error:"Aguarde alguns minutos antes de preparar outro lote."};
  // Only this explicitly checked submission may create a confirmed-role snapshot.
  const reviewed=prepareFiscalReview(loaded.report,{...input,confirmRecipientRole:true},loaded.binding);
  if(!reviewed.snapshot)return {error:"A revisão contém dados inválidos. Confira a prévia novamente."};
  const snapshot=reviewed.snapshot;
  const xmls=snapshot.groups.map(group=>buildDps({environment:"homologation",issuerCnpj:loaded.binding.issuerCnpj,profile:loaded.binding.profile,dpsNumber:"1",emissionTime:`${snapshot.competenceDate}T12:00:00+00:00`,competenceDate:snapshot.competenceDate,amount:group.amount,recipient:group.recipient,intermediary:group.intermediary,foreignAmount:group.foreignAmount}).xml);
  if(!await validateFiscalDocuments(xmls,"DPS"))return {error:"Uma ou mais notas não atendem ao formato fiscal. Confira os dados em Alterar dados antes de emitir."};
  let reviewId:string,sha256:string;
  if(loaded.previous&&canonicalReviewJson(loaded.previous.snapshot)===canonicalReviewJson(snapshot)){
    reviewId=loaded.previous.id;sha256=loaded.previous.snapshot_sha256;
  }else{
    if(Number(version)!==loaded.data.version)return {error:"A revisão mudou em outra sessão. Atualize e confira a prévia."};
    const saved=await admin.rpc("save_report_review",{p_actor:context.user.id,p_import:importId,p_profile:loaded.binding.profileId,p_expected_version:Number(version),p_snapshot:snapshot});
    if(saved.error||!saved.data?.id)return {error:"A revisão mudou ou não pôde ser salva. Atualize a prévia antes de confirmar novamente."};
    reviewId=saved.data.id;sha256=saved.data.sha256;
  }
  const confirmed=await admin.rpc("confirm_report_review",{p_actor:context.user.id,p_review:reviewId,p_expected_sha256:sha256});
  if(confirmed.error||!confirmed.data)return {error:"A configuração mudou antes da confirmação. Atualize a prévia e confira novamente."};
  const queued=await admin.rpc("enqueue_report_fiscal",{p_actor:context.user.id,p_review:reviewId,p_sha256:sha256,p_request:request});
  if(queued.error||!queued.data?.id)return {error:queued.error?.code==="23505"?"Já existe uma emissão cobrindo linhas deste relatório. Consulte suas notas para evitar duplicidade.":"A confirmação foi salva, mas o lote ainda não foi confirmado na fila. Repita esta mesma solicitação com segurança."};
  if(loaded.data.emailDelivery?.enabled){
    const emails=await admin.rpc("enable_invoice_email",{p_actor:context.user.id,p_batch:queued.data.id});
    if(emails.error||emails.data!==true)return {error:"O lote foi preparado, mas a fila de e-mail não pôde ser confirmada. Repita esta mesma solicitação; as notas não serão duplicadas."};
  }
  after(async()=>{try{await processQueuedWork(context.tenantId);}catch{/* Durable recovery; never re-POST a transmitted DPS. */}});
  revalidatePath("/painel/importacoes","layout");revalidatePath("/painel/notas","layout");
  return {id:queued.data.id,duplicate:queued.data.duplicate===true};
}
