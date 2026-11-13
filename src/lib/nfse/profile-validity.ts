import {automaticAffiliateDraft,AUTOMATIC_AFFILIATE_EVIDENCE,type AffiliateCompany} from "./automatic-affiliate.ts";
import {MEI_AFFILIATE_EVIDENCE} from "./mei-affiliate.ts";
import {validFiscalDate} from "./dps.ts";
import {canonicalReviewJson} from "./review.ts";
import {todayInBrazil} from "./standalone.ts";

export type SavedFiscalProfile={id:string;version:number;configuration:unknown;configuration_sha256:string;valid_from:string;evidence_reference:string;created_at:string};

/** Only the unchanged first MEI model, dated at its creation day, is an automatic repair candidate. */
export function initialMeiValidityRepair(company:AffiliateCompany,current:SavedFiscalProfile,competence:string,today:string){
  if(company.tax_regime!=="mei"||current.version!==1||![AUTOMATIC_AFFILIATE_EVIDENCE,MEI_AFFILIATE_EVIDENCE].includes(current.evidence_reference)||
    !validFiscalDate(competence)||!validFiscalDate(current.valid_from)||current.valid_from>today||competence>=current.valid_from||competence>today)return null;
  const created=new Date(current.created_at);
  if(!Number.isFinite(created.getTime())||todayInBrazil(created)!==current.valid_from)return null;
  const draft=automaticAffiliateDraft(company,today);
  if(!draft.profile||!validFiscalDate(company.opened_on)||draft.validFrom>competence||draft.validFrom>=current.valid_from)return null;
  try{if(canonicalReviewJson(current.configuration)!==canonicalReviewJson(draft.profile))return null;}catch{return null;}
  return {validFrom:draft.validFrom,evidence:`Correção da vigência inicial do modelo rex para a abertura cadastral ${draft.validFrom}; parâmetros preservados da versão ${current.version}. Abertura não comprova opção histórica pelo SIMEI; enquadramento sujeito à validação SEFIN.`};
}

export function canExtendProfileValidity(company:AffiliateCompany,current:SavedFiscalProfile,competence:string,today:string){
  if(!["mei","simples"].includes(company.tax_regime)||!validFiscalDate(today)||!validFiscalDate(current.valid_from)||!validFiscalDate(competence)||competence>=current.valid_from||competence>today||competence>="2027-01-01")return false;
  // Opening date is only a lower bound; it is never evidence of historical tax-regime eligibility.
  if(typeof company.opened_on==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(company.opened_on)&&competence<company.opened_on)return false;
  return true;
}
