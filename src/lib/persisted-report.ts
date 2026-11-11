import { reviewCommissionReport } from "./imports.ts";
import type { ParsedShopeeReport } from "./shopee-seller-csv.ts";

export function validatePersistedReport(value: unknown, expectedHash: string): ParsedShopeeReport | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const checked = reviewCommissionReport(input.review);
  if (!checked.data || checked.data.source.fileSha256 !== expectedHash ||
    checked.data.source.platform !== "shopee" || checked.data.source.adapterId !== "shopee-seller-monthly-csv" ||
    !Array.isArray(input.reportedSellers) || input.reportedSellers.length !== checked.data.rows.length) return null;
  const sellers: ParsedShopeeReport["reportedSellers"] = [];
  const limits = { storeName: 200, storeId: 200, cnpj: 32, cpf: 32, foreignTaxId: 128, legalName: 200, address: 1000, country: 2, stateRegistration: 200, email: 254 };
  for (const [index, raw] of input.reportedSellers.entries()) {
    if (!raw || typeof raw !== "object") return null;
    const seller = raw as Record<string, unknown>;
    const location = seller.location as { row?: unknown } | undefined;
    if (location?.row !== checked.data.rows[index].location.row || typeof seller.referencePeriod !== "string" ||
      seller.referencePeriod.length !== 7 || !/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(seller.referencePeriod)) return null;
    const fields: Record<string, string | null> = {};
    for (const [field, max] of Object.entries(limits)) {
      const text = seller[field];
      if (text !== null && (typeof text !== "string" || !text.length || text.length > max)) return null;
      fields[field] = text as string | null;
    }
    sellers.push({ ...fields, location: { row: location.row as number }, referencePeriod: seller.referencePeriod } as ParsedShopeeReport["reportedSellers"][number]);
  }
  return { review: checked.data, reportedSellers: sellers };
}
