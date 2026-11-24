"use server";

import { isIP } from "node:net";
import { headers } from "next/headers";
import { assessCnpjEligibility, type EligibilityResult } from "@/lib/cnpj-eligibility";
import { fetchCnpj } from "@/lib/cnpj-provider";
import { normalizeCnpj, validCnpj } from "@/lib/companies";

const windowMs = 10 * 60 * 1000;
const lookupsByClient = new Map<string, number>();
let windowEnd = 0;
let totalLookups = 0;

async function consumeLookup() {
  // Vercel sets this header at ingress. An unrecognized caller shares one bucket.
  const forwarded = process.env.VERCEL === "1" ? (await headers()).get("x-vercel-forwarded-for") : null;
  const address = forwarded?.trim() ?? "";
  const client = isIP(address) ? address : "unknown";
  const now = Date.now();
  if (now >= windowEnd) {
    windowEnd = now + windowMs;
    totalLookups = 0;
    lookupsByClient.clear();
  }
  const count = lookupsByClient.get(client) ?? 0;
  if (count >= 10 || totalLookups >= 150) return false;
  lookupsByClient.set(client, count + 1);
  totalLookups += 1;
  return true;
}

export async function consultEligibility(input: string): Promise<EligibilityResult> {
  if (typeof input !== "string" || input.length > 30 || !validCnpj(input)) {
    return { status: "invalid" };
  }
  if (!await consumeLookup()) return { status: "rate_limited" };
  const result = await fetchCnpj(normalizeCnpj(input));
  return result.data ? assessCnpjEligibility(result.data) : { status: result.code ?? "unavailable" };
}
