import { parse } from "csv-parse/browser/esm/sync";
import { canonicalAmount, MAX_REPORT_ROWS, reviewCommissionReport } from "./imports.ts";

export const MAX_SHOPEE_CSV_BYTES = 512 * 1024;
export const SHOPEE_SELLER_HEADERS = [
  "Mês de conclusão", "Nome da loja", "ID da Loja", "Comissão Total do Vendedor",
  "CNPJ do Vendedor", "CPF do Vendedor", "Identificação Fiscal Estrangeira",
  "Razão social do vendedor", "Endereço do Vendedor", "País do Vendedor",
  "Inscrição Estadual", "E-mail",
] as const;

type ReportedSeller = {
  location: { row: number };
  referencePeriod: string;
  storeName: string | null;
  storeId: string | null;
  cnpj: string | null;
  cpf: string | null;
  foreignTaxId: string | null;
  legalName: string | null;
  address: string | null;
  country: string | null;
  stateRegistration: string | null;
  email: string | null;
};

type CsvError = {
  code: "file_size" | "invalid_encoding" | "invalid_csv" | "unsupported_layout" |
    "row_limit" | "empty_report" | "invalid_field" | "invalid_amount" |
    "invalid_reference_period" | "invalid_contract";
  record?: number;
  field?: (typeof SHOPEE_SELLER_HEADERS)[number];
};

type Result =
  | { data: {
      review: NonNullable<ReturnType<typeof reviewCommissionReport>["data"]>;
      reportedSellers: ReportedSeller[];
    }; error?: never }
  | { data?: never; error: CsvError };

function referencePeriod(value: string): string | null {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const match = /^([A-Z][a-z]{2}) ([1-9]\d{3})$/.exec(value);
  if (!match || !months.includes(match[1])) return null;
  return `${match[2]}-${String(months.indexOf(match[1]) + 1).padStart(2, "0")}`;
}

function brlAmount(value: string): string | null {
  // This version accepts the observed R$ + decimal-comma layout, without guessing grouping separators.
  const match = /^R\$(-?(?:0|[1-9]\d{0,17})),(\d{2})$/.exec(value);
  return match ? canonicalAmount(`${match[1]}.${match[2]}`) : null;
}

/** Recognizes only the seller-monthly CSV layout supplied by the user, not all Shopee reports. */
export async function parseShopeeSellerCsv(bytes: Uint8Array): Promise<Result> {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_SHOPEE_CSV_BYTES)
    return { error: { code: "file_size" } };
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return { error: { code: "invalid_encoding" } };
  }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text))
    return { error: { code: "invalid_csv" } };

  let records: string[][];
  try {
    records = parse(text, {
      bom: true,
      delimiter: ",",
      cast: false,
      skip_empty_lines: false,
      relax_quotes: false,
      relax_column_count: false,
      max_record_size: 8192,
      to: MAX_REPORT_ROWS + 2,
    }) as string[][];
  } catch {
    // Parser messages may contain source data. Return only a fixed domain code.
    return { error: { code: "invalid_csv" } };
  }
  if (records[0]?.length !== SHOPEE_SELLER_HEADERS.length ||
    !SHOPEE_SELLER_HEADERS.every((header, i) => records[0][i] === header))
    return { error: { code: "unsupported_layout" } };
  if (records.length < 2) return { error: { code: "empty_report" } };
  if (records.length > MAX_REPORT_ROWS + 1) return { error: { code: "row_limit" } };

  const reportedSellers: ReportedSeller[] = [];
  const rows = [];
  const fieldLimits = [8, 200, 200, 24, 32, 32, 128, 200, 1000, 2, 200, 254];
  for (const [index, record] of records.slice(1).entries()) {
    const recordNumber = index + 2;
    for (const [i, field] of record.entries()) {
      if (field.length > fieldLimits[i])
        return { error: { code: "invalid_field", record: recordNumber, field: SHOPEE_SELLER_HEADERS[i] } };
    }
    const fields = record.map((field) => field.trim());
    const period = referencePeriod(fields[0]);
    if (period === null)
      return { error: { code: "invalid_reference_period", record: recordNumber, field: SHOPEE_SELLER_HEADERS[0] } };
    const amount = brlAmount(fields[3]);
    if (amount === null)
      return { error: { code: "invalid_amount", record: recordNumber, field: SHOPEE_SELLER_HEADERS[3] } };
    if (fields[9] && !/^[A-Z]{2}$/.test(fields[9]))
      return { error: { code: "invalid_field", record: recordNumber, field: SHOPEE_SELLER_HEADERS[9] } };
    const seller: ReportedSeller = {
      location: { row: recordNumber },
      referencePeriod: period,
      storeName: fields[1] || null,
      storeId: fields[2] || null,
      cnpj: fields[4] || null,
      cpf: fields[5] || null,
      foreignTaxId: fields[6] || null,
      legalName: fields[7] || null,
      address: fields[8] || null,
      country: fields[9] || null,
      stateRegistration: fields[10] || null,
      email: fields[11] || null,
    };
    reportedSellers.push(seller);
    const identities = [
      seller.cnpj ? `cnpj:${seller.cnpj}` : null,
      seller.cpf ? `cpf:${seller.cpf}` : null,
      seller.foreignTaxId ? `foreign:${seller.foreignTaxId}` : null,
    ].filter((identity) => identity !== null);
    rows.push({
      location: seller.location,
      // A shop ID and completion month do not establish an operation ID or fiscal competence.
      externalId: null,
      competence: null,
      currency: "BRL",
      amount,
      commissionType: null,
      reportedRecipient: identities.length === 1 ? identities[0] : null,
    });
  }
  const reviewed = reviewCommissionReport({
    contractVersion: 1,
    source: {
      platform: "shopee", format: "csv",
      fileSha256: [...new Uint8Array(await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes).buffer))]
        .map((byte) => byte.toString(16).padStart(2, "0")).join(""),
      adapterId: "shopee-seller-monthly-csv", adapterVersion: "1",
    },
    rows,
  });
  if (!reviewed.data) return { error: { code: "invalid_contract" } };
  return { data: { review: reviewed.data, reportedSellers } };
}

export type ParsedShopeeReport = NonNullable<Awaited<ReturnType<typeof parseShopeeSellerCsv>>["data"]>;
