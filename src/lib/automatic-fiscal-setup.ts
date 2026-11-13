import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { automaticAffiliateDraft } from "@/lib/nfse/automatic-affiliate";
import { parseFiscalProfile } from "@/lib/nfse/profile";
import { buildDps } from "@/lib/nfse/dps";
import { todayInBrazil } from "@/lib/nfse/standalone";
import { validateFiscalSchema } from "@/lib/nfse/schema";
import { requireWorkspace } from "@/lib/tenancy-server";

export async function ensureAutomaticFiscalSetup(companyId: string) {
  const { client, context } = await requireWorkspace();
  const company = await client.from("companies").select("cnpj,tax_regime,address,opened_on").eq("id", companyId).eq("tenant_id", context.tenantId).maybeSingle();
  if (company.error || !company.data) return { reason: "company_unavailable" };
  const current = await client.from("company_fiscal_profiles").select("version,configuration").eq("company_id", companyId).eq("tenant_id", context.tenantId).order("version", { ascending: false }).limit(1).maybeSingle();
  if (current.error) return { reason: "storage_pending" };
  if (current.data) return { reason: parseFiscalProfile(current.data.configuration, company.data.cnpj, company.data.tax_regime) ? "configured" : "profile_changed" };
  const draft = automaticAffiliateDraft(company.data, todayInBrazil());
  if (!draft.profile) return { reason: draft.reason };
  const admin = createAdminClient();
  if (!admin) return { reason: "storage_pending" };
  const reserved = await admin.rpc("reserve_company_operation", {p_actor:context.user.id,p_company:companyId,p_operation:"prepare_batch"});
  if (reserved.error || reserved.data !== true) return {reason:"processing_pending"};
  const probe = buildDps({ profile: draft.profile, issuerCnpj: company.data.cnpj, environment: "homologation", dpsNumber: "1",
    competenceDate: "2026-01-01", emissionTime: "2026-01-01T00:00:00+00:00", amount: "0.01",
    recipient: { kind: "cnpj", country: "BR", document: company.data.cnpj, legalName: "Validação estrutural interna" } });
  if (!await validateFiscalSchema(probe.xml, "DPS")) return { reason: "schema_pending" };
  const saved = await admin.rpc("save_fiscal_profile", { p_actor: context.user.id, p_company: companyId, p_expected_version: 0,
    p_configuration: draft.profile, p_evidence: draft.evidence, p_valid_from: draft.validFrom });
  // Another request may have won the same initial version. Never overwrite it or reset its namespace.
  return { reason: saved.error ? saved.error.code === "40001" ? "concurrent_change" : "storage_pending" : "configured" };
}
