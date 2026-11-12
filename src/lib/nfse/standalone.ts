import { buildDps, type FiscalPerson, type FiscalProfile, validFiscalDate } from "./dps.ts";
import { cleanFiscalPerson } from "./review.ts";
import { parseFiscalProfile } from "./profile.ts";
import { parseBrlInput } from "./amount-input.ts";

export function todayInBrazil(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (name: string) => parts.find(item => item.type === name)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export type StandaloneDefaults = { recipient: FiscalPerson; intermediary?: FiscalPerson; commissionType: string; configuration: FiscalProfile };

export function prepareStandalone(value: unknown, issuerCnpj: string, regime: string, validFrom: string) {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const raw = value as Record<string, unknown>;
    const amount = parseBrlInput(raw.amount);
    if (!amount || !validFiscalDate(raw.competenceDate) || raw.competenceDate < validFrom ||
      typeof raw.commissionType !== "string" || !raw.commissionType.trim() || raw.commissionType.length > 120 ||
      typeof raw.reference !== "string" || raw.reference.length > 200 || /[\u0000-\u001f\u007f]/.test(raw.commissionType + raw.reference)) return null;
    const configuration = parseFiscalProfile(raw.configuration, issuerCnpj, regime);
    if (!configuration) return null;
    const recipient = cleanFiscalPerson(raw.recipient), intermediary = raw.intermediary ? cleanFiscalPerson(raw.intermediary) : undefined;
    const foreignAmount = typeof raw.foreignAmount === "string" && raw.foreignAmount.trim() ? parseBrlInput(raw.foreignAmount) : undefined;
    if (foreignAmount === null) return null;
    const built = buildDps({ environment: "homologation", issuerCnpj, profile: configuration, dpsNumber: "1", amount, foreignAmount,
      recipient, intermediary, competenceDate: raw.competenceDate, emissionTime: `${raw.competenceDate}T12:00:00+00:00` });
    return { configuration, data: { amount, competenceDate: raw.competenceDate, recipient, intermediary,
      foreignAmount, commissionType: raw.commissionType.trim(), reference: raw.reference.trim() }, probeXml: built.xml };
  } catch { return null; }
}
