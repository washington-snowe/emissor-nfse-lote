import { createHash } from "node:crypto";
import { normalizeCnpj } from "../companies.ts";
import { buildDps, fiscalDecimal, validFiscalDate, type DpsInput, type FiscalPerson, type FiscalProfile } from "./dps.ts";
import type { ParsedShopeeReport } from "../shopee-seller-csv.ts";

export const MAX_FISCAL_REVIEW_ROWS = 500;
export type ReviewCandidate = { row: number; storeName: string; referencePeriod: string; amount: string; person: Partial<FiscalPerson>; foreignAmount?: string };
export type ReviewGroup = {
  sourceRows: number[]; sourceClaims: string[]; amount: string; recipient: FiscalPerson;
  allocations: { row: number; amount: string; foreignAmount?: string }[];
  foreignAmount?: string; intermediary?: FiscalPerson;
};
export type ReviewSnapshot = {
  contractVersion: 1; environment: "homologation"; companyId: string; issuerCnpj: string;
  importId: string; fileSha256: string; profileId: string; profileSha256: string; profileVersion: number;
  competenceDate: string; commissionType: string; evidenceReference: string;
  recipientRoleConfirmed: true;
  recipientChoice: "reported_sellers" | "single_recipient"; grouping: "per_row" | "same_recipient";
  sourceRows: number; currency: "BRL"; total: string; groups: ReviewGroup[];
};
export type ReviewIssue = { code: "review_fields" | "row_limit" | "invalid_recipient" | "invalid_fiscal_row" | "source_identity" | "duplicate_source" | "unsupported_amount" | "group_amount"; row?: number };

const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const optional = (value: unknown) => text(value) || undefined;
export function cleanFiscalPerson(value: unknown): FiscalPerson {
  const raw = object(value), address = object(raw.address);
  return {
    kind: text(raw.kind) as FiscalPerson["kind"], document: text(raw.kind) === "cnpj" ? normalizeCnpj(text(raw.document)) : text(raw.kind) === "cpf" ? text(raw.document).replace(/[.\-\s]/g, "") : text(raw.document),
    country: text(raw.country), legalName: text(raw.legalName), email: optional(raw.email),
    ...(raw.address ? { address: { country: text(address.country), postalCode: text(address.postalCode),
      municipalityCode: optional(address.municipalityCode), city: optional(address.city), province: optional(address.province),
      street: text(address.street), number: text(address.number), district: text(address.district), complement: optional(address.complement) } } : {}),
  };
}

export function reviewCandidates(report: ParsedShopeeReport, saved?: ReviewSnapshot): ReviewCandidate[] {
  return report.reportedSellers.map((seller, index) => {
    const identities = [["cnpj", seller.cnpj], ["cpf", seller.cpf], ["foreign", seller.foreignTaxId]].filter(([, value]) => value);
    const identity = identities.length === 1 ? identities[0] : null;
    const previous = saved?.groups.find(group => group.sourceRows.includes(seller.location.row));
    const previousAmount = previous?.allocations.find(value => value.row === seller.location.row)?.foreignAmount;
    return { row: seller.location.row, storeName: seller.storeName ?? `Registro ${seller.location.row}`, foreignAmount: previousAmount,
      referencePeriod: seller.referencePeriod, amount: report.review.rows[index].amount,
      person: previous && saved?.recipientChoice === "reported_sellers" ? previous.recipient : {
        kind: identity?.[0] as FiscalPerson["kind"] | undefined, document: identity?.[1] ?? "",
        country: seller.country ?? "", legalName: seller.legalName ?? "", email: seller.email ?? undefined } };
  });
}

/** Canonical JSON only for explicitly constructed snapshots, never arbitrary client objects. */
export function canonicalReviewJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalReviewJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).filter(([, child]) => child !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, child]) => `${JSON.stringify(key)}:${canonicalReviewJson(child)}`).join(",")}}`;
  if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number" && Number.isSafeInteger(value)) return JSON.stringify(value);
  throw new Error("Invalid review snapshot");
}
const digest = (value: unknown) => createHash("sha256").update(canonicalReviewJson(value)).digest("hex");
const cents = (value: string) => BigInt(fiscalDecimal(value, "review.amount", true).replace(".", ""));
const amount = (value: bigint) => `${value / 100n}.${(value % 100n).toString().padStart(2, "0")}`;

export function prepareFiscalReview(report: ParsedShopeeReport, raw: unknown, binding: {
  companyId: string; issuerCnpj: string; importId: string; profileId: string; profileSha256: string; profileVersion: number; profile: FiscalProfile;
}): { snapshot?: ReviewSnapshot; issues: ReviewIssue[] } {
  const issues: ReviewIssue[] = [], input = object(raw);
  if (report.review.rows.length > MAX_FISCAL_REVIEW_ROWS) return { issues: [{ code: "row_limit" }] };
  const competence = text(input.competenceDate), commissionType = text(input.commissionType), evidence = text(input.evidenceReference);
  if (!validFiscalDate(competence) || commissionType.length < 1 || commissionType.length > 120 || evidence.length < 3 || evidence.length > 500 ||
      /[\u0000-\u001f\u007f]/.test(commissionType + evidence) ||
      !["reported_sellers", "single_recipient"].includes(text(input.recipientChoice)) || !["per_row", "same_recipient"].includes(text(input.grouping)) || input.confirmRecipientRole !== true) {
    return { issues: [{ code: "review_fields" }] };
  }
  const overrides = new Map<number, Record<string, unknown>>();
  if (!Array.isArray(input.recipients) || input.recipients.length > report.review.rows.length) return { issues: [{ code: "review_fields" }] };
  const locations = new Set(report.review.rows.map(row => row.location.row));
  for (const item of input.recipients) {
    const row = object(item);
    if (typeof row.row !== "number" || !locations.has(row.row) || overrides.has(row.row)) return { issues: [{ code: "review_fields" }] };
    overrides.set(row.row, row);
  }
  const candidates = reviewCandidates(report), grouped = new Map<string, ReviewGroup>(), claims = new Set<string>();
  let total = 0n;
  for (const [index, source] of report.review.rows.entries()) {
    const row = source.location.row, seller = report.reportedSellers[index], override = overrides.get(row);
    if (source.currency !== "BRL") { issues.push({ code: "unsupported_amount", row }); continue; }
    let monetary: bigint;
    try { monetary = cents(source.amount); } catch { issues.push({ code: "unsupported_amount", row }); continue; }
    // This observed report is a monthly shop aggregate, not a list of identified commission operations.
    if (!seller.storeId || !seller.referencePeriod) { issues.push({ code: "source_identity", row }); continue; }
    const claim = digest([binding.issuerCnpj, "shopee", "seller-month", seller.storeId, seller.referencePeriod, source.currency]);
    if (claims.has(claim)) { issues.push({ code: "duplicate_source", row }); continue; }
    claims.add(claim);
    const person = cleanFiscalPerson(input.recipientChoice === "single_recipient" ? input.commonRecipient : override?.person ?? candidates[index].person);
    const intermediary = input.intermediary ? cleanFiscalPerson(input.intermediary) : undefined;
    const foreignAmount = optional(override?.foreignAmount);
    const fiscalInput: DpsInput = { issuerCnpj: binding.issuerCnpj, environment: "homologation", dpsNumber: "1",
      emissionTime: `${competence}T12:00:00+00:00`, competenceDate: competence, amount: amount(monetary),
      profile: binding.profile, recipient: person, intermediary, foreignAmount };
    try { buildDps(fiscalInput); } catch { issues.push({ code: "invalid_fiscal_row", row }); continue; }
    const key = input.grouping === "per_row" ? String(row) : digest([person, intermediary ?? null, foreignAmount === undefined ? null : binding.profile.foreignTrade?.currency]);
    const previous = grouped.get(key);
    if (previous) {
      try {
        const summed = amount(cents(previous.amount) + monetary);
        fiscalDecimal(summed, "group.amount", true);
        const foreignSum = foreignAmount !== undefined && previous.foreignAmount !== undefined ? amount(cents(previous.foreignAmount) + cents(foreignAmount)) : undefined;
        if (foreignSum !== undefined) fiscalDecimal(foreignSum, "group.foreign_amount", true);
        previous.amount = summed;
        previous.foreignAmount = foreignSum;
        previous.sourceRows.push(row);
        previous.sourceClaims.push(claim);
        previous.allocations.push({ row, amount: amount(monetary), foreignAmount: foreignAmount === undefined ? undefined : fiscalDecimal(foreignAmount, "foreign.amount", true) });
      } catch { issues.push({ code: "group_amount", row }); continue; }
    } else grouped.set(key, { sourceRows: [row], sourceClaims: [claim], allocations: [{ row, amount: amount(monetary), foreignAmount: foreignAmount === undefined ? undefined : fiscalDecimal(foreignAmount, "foreign.amount", true) }], amount: amount(monetary), recipient: person, intermediary,
      foreignAmount: foreignAmount === undefined ? undefined : fiscalDecimal(foreignAmount, "foreign.amount", true) });
    total += monetary;
  }
  if (issues.length) return { issues };
  const snapshot: ReviewSnapshot = {
    contractVersion: 1, environment: "homologation", companyId: binding.companyId, issuerCnpj: binding.issuerCnpj,
    importId: binding.importId, fileSha256: report.review.source.fileSha256, profileId: binding.profileId,
    profileSha256: binding.profileSha256, profileVersion: binding.profileVersion,
    competenceDate: competence, commissionType, evidenceReference: evidence, recipientRoleConfirmed: true,
    recipientChoice: input.recipientChoice as ReviewSnapshot["recipientChoice"], grouping: input.grouping as ReviewSnapshot["grouping"],
    sourceRows: report.review.rows.length, currency: "BRL", total: amount(total), groups: [...grouped.values()],
  };
  if (Buffer.byteLength(canonicalReviewJson(snapshot)) > 3_000_000) return { issues: [{ code: "row_limit" }] };
  return { snapshot, issues: [] };
}

/** Defensive display boundary. Fiscal eligibility is rechecked by the server before any later job. */
export function readReviewSnapshot(value: unknown, importId: string, fileHash: string): ReviewSnapshot | null {
  try {
    const raw = object(value);
    if (raw.contractVersion !== 1 || raw.environment !== "homologation" || raw.importId !== importId || raw.fileSha256 !== fileHash ||
      raw.recipientRoleConfirmed !== true || !validFiscalDate(raw.competenceDate) || !Array.isArray(raw.groups) || raw.groups.length < 1 || raw.groups.length > MAX_FISCAL_REVIEW_ROWS ||
      typeof raw.total !== "string" || !/^(0|[1-9]\d{0,17})\.\d{2}$/.test(raw.total) ||
      typeof raw.commissionType !== "string" || typeof raw.evidenceReference !== "string" || typeof raw.profileVersion !== "number") return null;
    for (const item of raw.groups) {
      const group = object(item), recipient = object(group.recipient);
      const sourceRows = group.sourceRows;
      if (!Array.isArray(sourceRows) || !sourceRows.length || !Array.isArray(group.allocations) ||
        group.allocations.length !== sourceRows.length || group.allocations.some(value => !value || typeof value !== "object" || typeof value.amount !== "string" || !sourceRows.includes(value.row)) ||
        sourceRows.some(row => !Number.isSafeInteger(row) || row < 1) ||
        typeof group.amount !== "string" || fiscalDecimal(group.amount, "group.amount", true) !== group.amount ||
        typeof recipient.legalName !== "string" || typeof recipient.document !== "string" || typeof recipient.country !== "string") return null;
    }
    if (Buffer.byteLength(canonicalReviewJson(value)) > 4_000_000) return null;
    return value as ReviewSnapshot;
  } catch { return null; }
}
