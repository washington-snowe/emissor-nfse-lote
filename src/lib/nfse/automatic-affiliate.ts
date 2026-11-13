import { parseFiscalProfile } from "./profile.ts";
import { validFiscalDate } from "./dps.ts";
import { MEI_AFFILIATE_DESCRIPTION } from "./mei-affiliate.ts";

export const AUTOMATIC_AFFILIATE_MODEL = "affiliate-br-auto-v1";
export const AUTOMATIC_AFFILIATE_EVIDENCE = `Modelo automático rex ${AUTOMATIC_AFFILIATE_MODEL}; promoção de vendas de afiliados no estabelecimento no Brasil; parâmetros do Anexo I NFS-e 1.01; enquadramento e operação sujeitos à validação SEFIN.`;

export type AffiliateCompany = { cnpj: string; tax_regime: string; address: unknown; opened_on?: string | null };
export function automaticAffiliateDraft(company: AffiliateCompany, today: string) {
  if (!["mei", "simples"].includes(company.tax_regime)) return { reason: "unsupported_regime" as const };
  const a = company.address && typeof company.address === "object" ? company.address as Record<string, unknown> : {};
  const municipality = a.municipality_code;
  if (typeof municipality !== "string" || !/^[1-9]\d{6}$/.test(municipality) || !validFiscalDate(today)) return { reason: "company_incomplete" as const };
  // App default for its affiliate workflow, editable before an operation. This is not a deduction of every MEI's activity.
  const common = { issuerMunicipality: municipality, serviceMunicipality: municipality, series: "1", specialRegime: "0",
    nationalTaxCode: "170601", description: MEI_AFFILIATE_DESCRIPTION, issTaxation: "1", issWithholding: "1" };
  // No invented effective Simples rate or zero estimate: RN538 forbids ME/EPP using indTotTrib.
  if (company.tax_regime === "simples") return { reason: "simples_data_required" as const, common };
  const profile = parseFiscalProfile({ ...common, totals: { mode: "not_informed" } }, company.cnpj, company.tax_regime);
  if (!profile) return { reason: "company_incomplete" as const };
  // Opening date bounds the default's use, not proof of historical SIMEI status. Competence remains explicit per operation.
  const validFrom = validFiscalDate(company.opened_on) && company.opened_on <= today ? company.opened_on : today;
  return { profile, validFrom, evidence: AUTOMATIC_AFFILIATE_EVIDENCE };
}
