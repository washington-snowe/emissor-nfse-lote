import "server-only";
import shopee from "../../integrations/marketplaces/shopee-recipient.json";
import {requireWorkspace} from "@/lib/tenancy-server";
import {ensureAutomaticFiscalSetup} from "@/lib/automatic-fiscal-setup";
import {validatePersistedReport} from "@/lib/persisted-report";
import {parseFiscalProfile} from "@/lib/nfse/profile";
import {previewFiscalReview,readReviewSnapshot,reviewCandidates,cleanFiscalPerson} from "@/lib/nfse/review";
import {quickReviewDefaults,quickReviewDigest,type QuickReviewInput,type QuickReviewData} from "@/lib/nfse/quick-review";
import {repairInitialMeiValidity} from "@/lib/profile-validity-server";
import {canExtendProfileValidity} from "@/lib/nfse/profile-validity";
import {todayInBrazil} from "@/lib/nfse/standalone";
import {sellerEmailRoute} from "@/lib/email/routing";
import {emailConfig} from "@/lib/email/config";

export async function loadQuickReportReview(importId:string,input?:QuickReviewInput,repairValidity=true) {
  const {client,context}=await requireWorkspace();
  if(!/^[0-9a-f-]{36}$/i.test(importId))return null;
  const result=await client.from("report_imports").select("id,company_id,file_sha256,parsed_payload,status").eq("id",importId).eq("tenant_id",context.tenantId).maybeSingle();
  if(result.error||!result.data||result.data.status!=="parsed")return null;
  const report=validatePersistedReport(result.data.parsed_payload,result.data.file_sha256);
  if(!report)return null;
  await ensureAutomaticFiscalSetup(result.data.company_id).catch(()=>undefined);
  const profileQuery=()=>client.from("company_fiscal_profiles").select("id,version,configuration,configuration_sha256,valid_from,evidence_reference,created_at").eq("company_id",result.data!.company_id).eq("tenant_id",context.tenantId).order("version",{ascending:false}).limit(1).maybeSingle();
  const [company,initialProfile,review]=await Promise.all([
    client.from("companies").select("id,cnpj,tax_regime,address,opened_on").eq("id",result.data.company_id).eq("tenant_id",context.tenantId).maybeSingle(),
    profileQuery(),
    client.from("report_reviews").select("id,profile_id,version,snapshot,snapshot_sha256").eq("import_id",importId).eq("tenant_id",context.tenantId).order("version",{ascending:false}).limit(1).maybeSingle(),
  ]);
  if(company.error||!company.data||initialProfile.error||!initialProfile.data||review.error)return null;
  let current=initialProfile.data;
  const previous=review.data&&review.data.profile_id===current.id ? readReviewSnapshot(review.data.snapshot,importId,result.data.file_sha256)??undefined:undefined;
  const fields=input??quickReviewDefaults(report,cleanFiscalPerson(shopee.recipient),previous);
  if(repairValidity&&await repairInitialMeiValidity(company.data,current,fields.competenceDate)){
    const updated=await profileQuery();if(updated.error||!updated.data)return null;current=updated.data;
  }
  const profile=parseFiscalProfile(current.configuration,company.data.cnpj,company.data.tax_regime);
  if(!profile)return null;
  const binding={companyId:company.data.id,issuerCnpj:company.data.cnpj,importId,profileId:current.id,profileSha256:current.configuration_sha256,profileVersion:current.version,profile};
  const generated=previewFiscalReview(report,fields,binding);
  const dateBlocked=Boolean(generated.snapshot&&generated.snapshot.competenceDate<current.valid_from);
  const displayDate=(value:string)=>value.split("-").reverse().join("/");
  const error=dateBlocked ? `O lote usa a competência ${displayDate(fields.competenceDate)}, mas o perfil está configurado a partir de ${displayDate(current.valid_from)}. Ajuste a vigência do perfil se os mesmos parâmetros já se aplicavam nessa competência.` :
    generated.issues.some(issue=>issue.code==="row_limit") ? "O relatório está salvo, mas a revisão fiscal atende até 500 linhas. Nenhuma linha foi descartada." :
    generated.issues.length ? "Há dados que precisam de ajuste antes de emitir. Nenhuma linha ou valor foi descartado." : undefined;
  const candidates=reviewCandidates(report,previous).map(candidate=>{
    const override=fields.recipients.find(row=>row.row===candidate.row);
    return {...candidate,person:override?.person??candidate.person,foreignAmount:override?.foreignAmount??candidate.foreignAmount};
  });
  const data:QuickReviewData={importId,companyId:company.data.id,input:fields,candidates,preview:generated.snapshot,digest:!error&&generated.snapshot?quickReviewDigest(generated.snapshot):undefined,
    version:review.data?.version??0,error,issues:generated.issues,foreignForAll:Boolean(profile.serviceCountry)||profile.issTaxation==="3",currency:profile.foreignTrade?.currency,needsIntermediary:profile.issWithholding==="3",transmissionEnabled:process.env.NFSE_HOMOLOGATION_ENABLED==="true",
    validityAdjustment:dateBlocked&&generated.snapshot&&canExtendProfileValidity(company.data,current,fields.competenceDate,todayInBrazil())?{profileId:current.id,profileVersion:current.version,profileHash:current.configuration_sha256,currentFrom:current.valid_from,targetFrom:fields.competenceDate,previewDigest:quickReviewDigest(generated.snapshot)}:undefined};
  data.emailDelivery={enabled:emailConfig(process.env).enabled,testOnly:true,routes:generated.snapshot?.groups.map(group=>sellerEmailRoute(report,group))??[]};
  return {data,report,binding,previous:review.data,current,company:company.data};
}
