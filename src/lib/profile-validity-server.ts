import "server-only";
import {requireWorkspace} from "@/lib/tenancy-server";
import {createAdminClient} from "@/lib/supabase/admin";
import {parseFiscalProfile} from "@/lib/nfse/profile";
import {validProfileEvidence} from "@/lib/nfse/profile";
import {buildDps} from "@/lib/nfse/dps";
import {validateFiscalSchema} from "@/lib/nfse/schema";
import {initialMeiValidityRepair,type SavedFiscalProfile} from "@/lib/nfse/profile-validity";
import type {AffiliateCompany} from "@/lib/nfse/automatic-affiliate";
import {todayInBrazil} from "@/lib/nfse/standalone";

export async function appendProfileValidity(company:AffiliateCompany&{id:string},current:SavedFiscalProfile,validFrom:string,evidence:string){
  const {context}=await requireWorkspace(),admin=createAdminClient();
  const profile=parseFiscalProfile(current.configuration,company.cnpj,company.tax_regime);
  if(!admin||!profile||!validProfileEvidence(evidence,validFrom))return {error:"Não foi possível validar a vigência da configuração."};
  const quota=await admin.rpc("reserve_company_operation",{p_actor:context.user.id,p_company:company.id,p_operation:"prepare_batch"});
  if(quota.error||quota.data!==true)return {error:"Aguarde alguns minutos antes de ajustar a configuração novamente."};
  const probe=buildDps({profile,issuerCnpj:company.cnpj,environment:"homologation",dpsNumber:"1",competenceDate:"2026-01-01",emissionTime:"2026-01-01T00:00:00+00:00",amount:"0.01",foreignAmount:profile.foreignTrade?"0.01":undefined,
    recipient:{kind:"cnpj",country:"BR",document:company.cnpj,legalName:"Validação estrutural interna"},intermediary:profile.issWithholding==="3"?{kind:"cnpj",country:"BR",document:company.cnpj,legalName:"Validação estrutural interna"}:undefined});
  if(!await validateFiscalSchema(probe.xml,"DPS"))return {error:"A configuração não atende ao formato fiscal. Confira os dados antes de ajustar a vigência."};
  // Date only. Keep the exact stored configuration, series and all prior rows unchanged.
  const saved=await admin.rpc("save_fiscal_profile",{p_actor:context.user.id,p_company:company.id,p_expected_version:current.version,p_configuration:current.configuration,p_evidence:evidence,p_valid_from:validFrom});
  if(saved.error||!Number.isSafeInteger(saved.data?.version))return {error:saved.error?.code==="40001"?"O perfil mudou em outra sessão. Atualize a revisão para usar a versão atual.":"Não foi possível salvar a nova vigência. Seus dados anteriores foram preservados."};
  return {version:saved.data.version};
}

export async function repairInitialMeiValidity(company:AffiliateCompany&{id:string},current:SavedFiscalProfile,competence:string){
  const plan=initialMeiValidityRepair(company,current,competence,todayInBrazil());
  if(!plan)return false;
  const {client,context}=await requireWorkspace();
  const operations=await client.from("fiscal_operations").select("id").eq("company_id",company.id).eq("tenant_id",context.tenantId).limit(1).maybeSingle();
  if(operations.error||operations.data)return false;
  const saved=await appendProfileValidity(company,current,plan.validFrom,plan.evidence);
  return Boolean(saved.version);
}
