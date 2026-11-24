import type { CompanyDraft } from "./companies.ts";

type Profile = "MEI" | "Simples Nacional" | "Microempresa (ME)";
type Registry = Pick<CompanyDraft, "city" | "state" | "company_size" | "registration_status" | "mei_option" | "simples_option">;
type Assessment = { location: string } & (
  | { status: "eligible"; profile: Profile; nextStep: "setup" | "assisted" | "regularize" }
  | { status: "unsupported" | "inactive" | "unconfirmed"; profile: null }
);

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
  const inactive = ["BAIXADA", "SUSPENSA", "INAPTA", "NULA"].includes(registration);

  // Coverage by profile is separate from production readiness for a specific CNPJ.
  if (profile) {
    const nextStep = inactive ? "regularize" : profile === "MEI" ? "setup" : "assisted";
    return { status: "eligible", location, profile, nextStep };
  }
  if (inactive) return { status: "inactive", location, profile };
  const status = registration === "ATIVA" && registry.simples_option === false && registry.company_size
    ? "unsupported" : "unconfirmed";
  return { status, location, profile };
}
