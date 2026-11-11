import { buildDps, validFiscalDate, type FiscalProfile, type TaxTotals, type ForeignTrade } from "./dps.ts";

const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const required = (value: unknown) => typeof value === "string" ? value.trim() : "";
const optional = (value: unknown) => required(value) || undefined;

export function parseFiscalProfile(value: unknown, issuerCnpj: string, regime: string): FiscalProfile | null {
  if (!["mei", "simples"].includes(regime)) return null;
  try {
    const raw = record(value), totals = record(raw.totals), trade = record(raw.foreignTrade);
    if (raw.simplesOption !== undefined && raw.simplesOption !== (regime === "mei" ? "2" : "3")) return null;
    let cleanTotals: TaxTotals;
    if (totals.mode === "not_informed") cleanTotals = { mode: "not_informed" };
    else if (totals.mode === "simples_percent") cleanTotals = { mode: "simples_percent", percent: required(totals.percent) };
    else if (totals.mode === "percentages" || totals.mode === "amounts") cleanTotals = {
      mode: totals.mode, federal: required(totals.federal), state: required(totals.state), municipal: required(totals.municipal),
    };
    else return null;
    let foreignTrade: Omit<ForeignTrade, "amount"> | undefined;
    if (raw.foreignTrade !== undefined) foreignTrade = {
      mode: required(trade.mode), relationship: required(trade.relationship), currency: required(trade.currency),
      providerIncentive: required(trade.providerIncentive),
      recipientIncentive: required(trade.recipientIncentive), temporaryGoods: required(trade.temporaryGoods),
      mdic: required(trade.mdic), importDeclaration: optional(trade.importDeclaration), exportRegistration: optional(trade.exportRegistration),
    };
    const profile: FiscalProfile = {
      issuerMunicipality: required(raw.issuerMunicipality), issuerRegistration: optional(raw.issuerRegistration), series: required(raw.series),
      simplesOption: regime === "mei" ? "2" : "3", simplesAssessment: optional(raw.simplesAssessment) as FiscalProfile["simplesAssessment"],
      specialRegime: required(raw.specialRegime) as FiscalProfile["specialRegime"],
      serviceMunicipality: optional(raw.serviceMunicipality), serviceCountry: optional(raw.serviceCountry),
      nationalTaxCode: required(raw.nationalTaxCode), municipalTaxCode: optional(raw.municipalTaxCode), nbsCode: optional(raw.nbsCode),
      description: required(raw.description), issTaxation: required(raw.issTaxation) as FiscalProfile["issTaxation"],
      issWithholding: required(raw.issWithholding) as FiscalProfile["issWithholding"], issRate: optional(raw.issRate),
      immunityType: optional(raw.immunityType), exportResultCountry: optional(raw.exportResultCountry), totals: cleanTotals, foreignTrade,
    };
    // Structural probe only: self recipient, fixed non-transmitted number/value/date. It is never stored or sent.
    buildDps({ profile, environment: "homologation", issuerCnpj, dpsNumber: "1", amount: "0.01", foreignAmount: foreignTrade ? "0.01" : undefined,
      competenceDate: "2026-01-01", emissionTime: "2026-01-01T00:00:00+00:00",
      recipient: { kind: "cnpj", country: "BR", document: issuerCnpj, legalName: "Validação estrutural interna" },
      intermediary: profile.issWithholding === "3" ? { kind: "cnpj", country: "BR", document: issuerCnpj, legalName: "Validação estrutural interna" } : undefined });
    return profile;
  } catch { return null; }
}

export function profileFromForm(form: FormData): unknown {
  const get = (name: string) => typeof form.get(name) === "string" ? form.get(name) as string : "";
  const fields = ["issuerMunicipality", "issuerRegistration", "series", "simplesAssessment", "specialRegime", "serviceMunicipality", "serviceCountry", "nationalTaxCode", "municipalTaxCode", "nbsCode", "description", "issTaxation", "issWithholding", "issRate", "immunityType", "exportResultCountry"];
  return {
    ...Object.fromEntries(fields.map(name => [name, get(name)])),
    totals: Object.fromEntries(["mode", "percent", "federal", "state", "municipal"].map(name => [name, get(`totals.${name}`)])),
    ...(get("foreignTrade") === "on" ? { foreignTrade: Object.fromEntries(["mode", "relationship", "currency", "providerIncentive", "recipientIncentive", "temporaryGoods", "mdic", "importDeclaration", "exportRegistration"].map(name => [name, get(`foreignTrade.${name}`)])) } : {}),
  };
}

export function validProfileEvidence(value: unknown, validFrom: unknown) {
  return typeof value === "string" && value.trim().length >= 3 && value.length <= 500 && !/[\u0000-\u001f\u007f]/.test(value) && validFiscalDate(validFrom);
}
