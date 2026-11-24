import type { CompanyDraft } from "./companies.ts";

type Profile = "MEI" | "Simples Nacional" | "Microempresa (ME)";
type Registry = Pick<CompanyDraft, "city" | "state" | "company_size" | "registration_status" | "mei_option" | "simples_option">;
type Assessment = {
  status: "available" | "assisted" | "unsupported" | "inactive" | "unconfirmed";
  location: string;
  profile: Profile | null;
};

export type EligibilityResult =
  | Assessment
  | { status: "invalid" | "not_found" | "rate_limited" | "unavailable" };

export function assessCnpjEligibility(registry: Registry): Assessment {
  const location = [registry.city, registry.state].filter(Boolean).join(" / ");
  const microenterprise = /^(ME|MICRO\s*EMPRESA)$/.test(registry.company_size.toUpperCase());
  const profile = registry.mei_option === true ? "MEI"
    : registry.simples_option === true ? "Simples Nacional"
    : microenterprise ? "Microempresa (ME)" : null;
  const registration = registry.registration_status.toUpperCase();

  if (["BAIXADA", "SUSPENSA", "INAPTA", "NULA"].includes(registration)) {
    return { status: "inactive", location, profile };
  }
  if (registration !== "ATIVA") return { status: "unconfirmed", location, profile };
  if (profile === "MEI") return { status: "available", location, profile };
  // The production report gate currently allows MEI. Other supported profiles need a review.
  if (profile) return { status: "assisted", location, profile };
  const status = registry.simples_option === false && registry.company_size ? "unsupported" : "unconfirmed";
  return { status, location, profile };
}
