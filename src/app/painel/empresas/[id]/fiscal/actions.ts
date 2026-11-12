"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/lib/tenancy-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseFiscalProfile, profileFromForm, validProfileEvidence } from "@/lib/nfse/profile";
import { buildDps } from "@/lib/nfse/dps";
import { validateFiscalSchema } from "@/lib/nfse/schema";

export type FiscalProfileState = { error?: string; success?: string; version?: number };

export async function saveFiscalProfile(companyId: string, _previous: FiscalProfileState, form: FormData): Promise<FiscalProfileState> {
  const { client, context } = await requireWorkspace();
  const admin = createAdminClient();
  if (!admin || !/^[0-9a-f-]{36}$/i.test(companyId)) return { error: "Configuração fiscal indisponível." };
  const company = await client.from("companies").select("id,cnpj,tax_regime").eq("id", companyId).eq("tenant_id", context.tenantId).maybeSingle();
  if (company.error || !company.data) return { error: "Empresa não encontrada no seu espaço." };
  const version = form.get("version"), evidence = form.get("evidence"), validFrom = form.get("validFrom");
  if (typeof version !== "string" || !/^(0|[1-9]\d{0,8})$/.test(version) || !validProfileEvidence(evidence, validFrom)) {
    return { error: "Informe a data inicial e uma referência da orientação fiscal, sem senhas ou documentos pessoais." };
  }
  const profile = parseFiscalProfile(profileFromForm(form), company.data.cnpj, company.data.tax_regime);
  if (!profile) return { error: "Confira os campos fiscais. Use ponto nos decimais, série de 1 a 49999 e apenas um local de prestação. Campos de exportação e imunidade dependem da tributação escolhida." };
  const quota = await admin.rpc("reserve_company_operation", { p_actor: context.user.id, p_company: company.data.id, p_operation: "prepare_batch" });
  if (quota.error || quota.data !== true) return { error: "Aguarde alguns minutos antes de validar outra configuração." };
  const probe = buildDps({ profile, issuerCnpj: company.data.cnpj, environment: "homologation", dpsNumber: "1",
    competenceDate: "2026-01-01", emissionTime: "2026-01-01T00:00:00+00:00", amount: "0.01", foreignAmount: profile.foreignTrade ? "0.01" : undefined,
    recipient: { kind: "cnpj", document: company.data.cnpj, country: "BR", legalName: "Validação estrutural interna" },
    intermediary: profile.issWithholding === "3" ? { kind: "cnpj", document: company.data.cnpj, country: "BR", legalName: "Validação estrutural interna" } : undefined });
  // Local structure only. Never transmit this probe or treat it as fiscal approval.
  if (!await validateFiscalSchema(probe.xml, "DPS")) return { error: "Os campos não atendem ao formato XML publicado. Confira códigos, limites e informações complementares. Nenhuma nota foi enviada." };
  const result = await admin.rpc("save_fiscal_profile", { p_actor: context.user.id, p_company: company.data.id,
    p_expected_version: Number(version), p_configuration: profile, p_evidence: evidence, p_valid_from: validFrom });
  if (result.error || !Number.isSafeInteger(result.data?.version)) return {
    error: result.error?.code === "40001" ? "A configuração mudou em outra sessão. Atualize a página e confira a versão antes de salvar." : "Não foi possível salvar. Confira se a migração de configurações fiscais está aplicada.",
  };
  revalidatePath(`/painel/empresas/${company.data.id}/fiscal`);
  return { version: result.data.version, success: `Versão ${result.data.version} salva. A revisão das operações e a homologação continuam necessárias para emitir.` };
}
