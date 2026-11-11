export const MAX_REPORT_ROWS = 10_000;

type ReportSource = {
  platform: "shopee" | "tiktok_shop" | "mercado_livre";
  format: "csv" | "xlsx" | "pdf";
  fileSha256: string;
  adapterId: string;
  adapterVersion: string;
};

type CommissionRow = {
  location: { row: number; sheet?: string; page?: number };
  externalId: string | null;
  competence: string | null;
  currency: string | null;
  amount: string;
  commissionType: string | null;
  reportedRecipient: string | null;
};

type ReviewIssue = {
  rowIndex: number;
  code:
    | "missing_external_id"
    | "missing_competence"
    | "missing_currency"
    | "missing_commission_type"
    | "missing_reported_recipient"
    | "nonpositive_amount";
};

type ReportReview = {
  contractVersion: 1;
  source: ReportSource;
  rows: CommissionRow[];
  totals: { currency: string; amount: string; rowCount: number }[];
  issues: ReviewIssue[];
  fiscalStatus: "not_evaluated";
};

type ValidationError = { path: string; code: "invalid" | "duplicate_location" };
type ReviewResult =
  | { data: ReportReview; errors: [] }
  | { data?: never; errors: ValidationError[] };

const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const text = (value: unknown, max: number): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= max &&
  value === value.trim() && !/[\u0000-\u001f\u007f]/.test(value);

const positiveInteger = (value: unknown, max: number): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= max;

// Product resource limits, not marketplace precision or fiscal rounding rules.
export function canonicalAmount(value: unknown): string | null {
  if (typeof value !== "string" || value !== value.trim() ||
    !/^-?(0|[1-9]\d{0,17})(\.\d{1,12})?$/.test(value))
    return null;
  const canonical = value.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  return canonical === "-0" ? "0" : canonical;
}

const scaledAmount = (amount: string) => {
  const negative = amount.startsWith("-");
  const [integer, fraction = ""] = (negative ? amount.slice(1) : amount).split(".");
  const scaled = BigInt(integer + fraction.padEnd(12, "0"));
  return negative ? -scaled : scaled;
};

const decimalAmount = (scaled: bigint) => {
  const digits = (scaled < 0n ? -scaled : scaled).toString().padStart(13, "0");
  const decimal = `${digits.slice(0, -12)}.${digits.slice(-12)}`
    .replace(/0+$/, "").replace(/\.$/, "");
  return scaled < 0n ? `-${decimal}` : decimal;
};

/** Internal adapter boundary. This does not read files, authorize a tenant or validate fiscal rules. */
export function reviewCommissionReport(input: unknown): ReviewResult {
  const report = object(input);
  const source = object(report.source);
  const errors: ValidationError[] = [];
  const invalid = (path: string, code: ValidationError["code"] = "invalid") => {
    if (errors.length < 100) errors.push({ path, code });
  };
  if (report.contractVersion !== 1) invalid("contractVersion");
  if (typeof source.platform !== "string" ||
    !["shopee", "tiktok_shop", "mercado_livre"].includes(source.platform))
    invalid("source.platform");
  if (typeof source.format !== "string" || !["csv", "xlsx", "pdf"].includes(source.format))
    invalid("source.format");
  if (!text(source.fileSha256, 64) || !/^[a-f0-9]{64}$/.test(source.fileSha256))
    invalid("source.fileSha256");
  if (!text(source.adapterId, 64) || !/^[a-z][a-z0-9_-]*$/.test(source.adapterId))
    invalid("source.adapterId");
  if (!text(source.adapterVersion, 50)) invalid("source.adapterVersion");
  if (!Array.isArray(report.rows) || report.rows.length < 1 || report.rows.length > MAX_REPORT_ROWS)
    invalid("rows");
  if (errors.length) return { errors };

  const rows: CommissionRow[] = [];
  const locations = new Set<string>();
  for (const [index, raw] of (report.rows as unknown[]).entries()) {
    const row = object(raw);
    const location = object(row.location);
    const path = `rows.${index}`;
    if (!positiveInteger(location.row, 1_000_000)) invalid(`${path}.location.row`);
    if (source.format === "xlsx" && !text(location.sheet, 120)) invalid(`${path}.location.sheet`);
    if (source.format === "pdf" && !positiveInteger(location.page, 100_000))
      invalid(`${path}.location.page`);
    if (source.format !== "xlsx" && location.sheet !== undefined) invalid(`${path}.location.sheet`);
    if (source.format !== "pdf" && location.page !== undefined) invalid(`${path}.location.page`);
    if (positiveInteger(location.row, 1_000_000) &&
      (source.format === "xlsx" ? text(location.sheet, 120) : location.sheet === undefined) &&
      (source.format === "pdf" ? positiveInteger(location.page, 100_000) : location.page === undefined)) {
      const key = JSON.stringify([location.sheet ?? null, location.page ?? null, location.row]);
      if (locations.has(key)) invalid(`${path}.location`, "duplicate_location");
      locations.add(key);
    }
    for (const [field, limit] of [["externalId", 200], ["commissionType", 120], ["reportedRecipient", 200]] as const)
      if (row[field] !== null && !text(row[field], limit)) invalid(`${path}.${field}`);
    if (row.competence !== null && (!text(row.competence, 7) ||
      !/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(row.competence))) invalid(`${path}.competence`);
    if (row.currency !== null && (!text(row.currency, 3) || !/^[A-Z]{3}$/.test(row.currency)))
      invalid(`${path}.currency`);
    const amount = canonicalAmount(row.amount);
    if (amount === null) invalid(`${path}.amount`);
    if (errors.length) continue;
    rows.push({
      location: {
        row: location.row as number,
        ...(source.format === "xlsx" ? { sheet: location.sheet as string } : {}),
        ...(source.format === "pdf" ? { page: location.page as number } : {}),
      },
      externalId: row.externalId as string | null,
      competence: row.competence as string | null,
      currency: row.currency as string | null,
      amount: amount!,
      commissionType: row.commissionType as string | null,
      reportedRecipient: row.reportedRecipient as string | null,
    });
  }
  // A malformed row invalidates the entire report; no partial financial summary.
  if (errors.length) return { errors };

  const totals = new Map<string, { amount: bigint; rowCount: number }>();
  const issues: ReviewIssue[] = [];
  rows.forEach((row, rowIndex) => {
    const amount = scaledAmount(row.amount);
    if (row.currency !== null) {
      const total = totals.get(row.currency) ?? { amount: 0n, rowCount: 0 };
      totals.set(row.currency, { amount: total.amount + amount, rowCount: total.rowCount + 1 });
    }
    for (const [field, code] of [
      ["externalId", "missing_external_id"],
      ["competence", "missing_competence"],
      ["currency", "missing_currency"],
      ["commissionType", "missing_commission_type"],
      ["reportedRecipient", "missing_reported_recipient"],
    ] as const)
      if (row[field] === null) issues.push({ rowIndex, code });
    if (amount <= 0n) issues.push({ rowIndex, code: "nonpositive_amount" });
  });
  return {
    data: {
      contractVersion: 1,
      source: {
        platform: source.platform as ReportSource["platform"],
        format: source.format as ReportSource["format"],
        fileSha256: source.fileSha256 as string,
        adapterId: source.adapterId as string,
        adapterVersion: source.adapterVersion as string,
      },
      rows,
      totals: [...totals.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([currency, total]) => ({
        currency, amount: decimalAmount(total.amount), rowCount: total.rowCount,
      })),
      issues,
      fiscalStatus: "not_evaluated",
    },
    errors: [],
  };
}
