import { parseFiscalProfile } from "./profile.ts";
import { validFiscalDate } from "./dps.ts";

export const MEI_AFFILIATE_MODEL = "mei-promocao-vendas-br-v1";
export const MEI_AFFILIATE_DESCRIPTION = "Promoção de vendas por meio de divulgação de produtos em programa de afiliados.";
export const MEI_AFFILIATE_EVIDENCE = `Modelo rex ${MEI_AFFILIATE_MODEL}; Anexo I NFS-e 1.01 de 09/02/2026; promoção de vendas e prestação no município do estabelecimento confirmadas pelo titular.`;

// Company identity/regime/address must come from the authenticated owner's database query.
// The model is an explicit choice of activity/location, never a deduction from CNAE or MEI status alone.
export function prepareMeiAffiliateProfile(company: { cnpj: string; tax_regime: string; address: unknown }, currentVersion: number,
  form: FormData, today: string) {
  if (company.tax_regime !== "mei") return { error: "A configuração simplificada está disponível apenas para empresas MEI." };
  if (currentVersion !== 0 || form.get("version") !== "0") return { error: "Já existe uma configuração fiscal ou a versão mudou. Atualize a página para preservar seus dados." };
  if (form.get("confirmActivity") !== "on") return { error: "Confirme a atividade e o local da prestação para usar este modelo." };
  const address = company.address && typeof company.address === "object" ? company.address as Record<string, unknown> : {};
  const municipality = address.municipality_code;
  if (typeof municipality !== "string" || !/^[1-9]\d{6}$/.test(municipality)) return { error: "Complete o município no cadastro da empresa. O código será aproveitado automaticamente." };
  const submittedDate = form.get("validFrom");
  const validFrom = submittedDate === null || submittedDate === "" ? today : submittedDate;
  if (!validFiscalDate(today) || !validFiscalDate(validFrom) || validFrom > today) return { error: "Confira a data inicial da configuração; ela não pode ser posterior a hoje." };
  const profile = parseFiscalProfile({
    issuerMunicipality: municipality, serviceMunicipality: municipality,
    series: "1", specialRegime: "0", nationalTaxCode: "170601", description: MEI_AFFILIATE_DESCRIPTION,
    issTaxation: "1", issWithholding: "1", totals: { mode: "not_informed" },
  }, company.cnpj, company.tax_regime);
  if (!profile) return { error: "Não foi possível preparar a configuração com os dados da empresa. Confira o cadastro." };
  return { profile, validFrom, evidence: MEI_AFFILIATE_EVIDENCE, expectedVersion: 0 };
}
