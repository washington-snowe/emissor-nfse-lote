export function parseBrlInput(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 30) return null;
  const raw = value.trim().replace(/^R\$\s*/, "");
  if (!/^(?:0|[1-9]\d*|[1-9]\d{0,2}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(raw)) return null;
  const [whole, fraction = ""] = raw.replaceAll(".", "").split(",");
  if (whole.length > 15 || BigInt(whole + fraction.padEnd(2, "0")) <= 0n) return null;
  return `${whole}.${fraction.padEnd(2, "0")}`;
}
