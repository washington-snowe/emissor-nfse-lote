"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/lib/tenancy-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validatePersistedReport } from "@/lib/persisted-report";
import { parseFiscalProfile } from "@/lib/nfse/profile";
import { buildDps } from "@/lib/nfse/dps";
import { prepareFiscalReview, MAX_FISCAL_REVIEW_ROWS, type ReviewIssue } from "@/lib/nfse/review";
import { validateFiscalDocuments } from "@/lib/nfse/schema";

export type ReviewState = { error?: string; success?: string; issues?: ReviewIssue[]; id?: string; version?: number; sha256?: string };
export async function prepareReportReview(importId: string, _previous: ReviewState, form: FormData): Promise<ReviewState> {
  const { client, context } = await requireWorkspace({ strong: true });
  const admin = createAdminClient();
  if (!admin || !/^[0-9a-f-]{36}$/i.test(importId)) return { error: "Preparação indisponível." };
  const report = await client.from("report_imports").select("id,company_id,file_sha256,parsed_payload,status").eq("id", importId).eq("tenant_id", context.tenantId).maybeSingle();
  if (report.error || !report.data || report.data.status !== "parsed") return { error: "Importação não encontrada ou ainda não processada." };
  const parsed = validatePersistedReport(report.data.parsed_payload, report.data.file_sha256);
  if (!parsed) return { error: "O relatório salvo precisa de nova conferência." };
  if (parsed.review.rows.length > MAX_FISCAL_REVIEW_ROWS) return { error: "Esta etapa permite revisar até 500 linhas por relatório. O original permanece salvo; nenhum valor será descartado." };
  const [company, current] = await Promise.all([
    client.from("companies").select("id,cnpj,tax_regime").eq("id", report.data.company_id).eq("tenant_id", context.tenantId).maybeSingle(),
    client.from("company_fiscal_profiles").select("id,version,configuration,configuration_sha256,valid_from").eq("company_id", report.data.company_id).eq("tenant_id", context.tenantId).order("version", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (company.error || !company.data || current.error || !current.data) return { error: "Salve a configuração fiscal da empresa antes de preparar a revisão." };
  const profile = parseFiscalProfile(current.data.configuration, company.data.cnpj, company.data.tax_regime);
  if (!profile) return { error: "A configuração fiscal precisa ser revista para o enquadramento atual." };
  const version = form.get("version"), payload = form.get("review");
  if (typeof version !== "string" || !/^(0|[1-9]\d{0,8})$/.test(version) || typeof payload !== "string" || Buffer.byteLength(payload) > 800_000) return { error: "Revisão inválida ou acima do limite." };
  let input: unknown;
  try { input = JSON.parse(payload); } catch { return { error: "Não foi possível ler os campos da revisão." }; }
  const reserved = await admin.rpc("reserve_company_operation", { p_actor: context.user.id, p_company: company.data.id, p_operation: "prepare_batch" });
  if (reserved.error || reserved.data !== true) return { error: "Aguarde alguns minutos antes de preparar outra revisão." };
  const reviewed = prepareFiscalReview(parsed, input, { companyId: company.data.id, issuerCnpj: company.data.cnpj, importId: report.data.id,
    profileId: current.data.id, profileVersion: current.data.version, profileSha256: current.data.configuration_sha256, profile });
  if (!reviewed.snapshot) return { error: "Complete a competência, a confirmação do tomador e os campos indicados. O relatório inteiro precisa estar válido.", issues: reviewed.issues };
  const snapshot = reviewed.snapshot;
  const issuerCnpj = company.data.cnpj;
  if (snapshot.competenceDate < current.data.valid_from) return { error: "A configuração fiscal não estava vigente na competência informada." };
  const xmls = snapshot.groups.map(group => buildDps({ environment: "homologation", issuerCnpj,
    dpsNumber: "1", emissionTime: `${snapshot.competenceDate}T12:00:00+00:00`, competenceDate: snapshot.competenceDate,
    profile, amount: group.amount, recipient: group.recipient, intermediary: group.intermediary, foreignAmount: group.foreignAmount }).xml);
  // Local, unsigned structural probes only. Durable DPS numbers are allocated only when a fiscal job is created.
  if (!await validateFiscalDocuments(xmls, "DPS")) return { error: "Uma ou mais notas previstas não atendem ao XSD publicado. Confira endereços, códigos e campos complementares. Nenhuma nota foi enviada." };
  const saved = await admin.rpc("save_report_review", { p_actor: context.user.id, p_import: report.data.id,
    p_profile: current.data.id, p_expected_version: Number(version), p_snapshot: snapshot });
  if (saved.error || !saved.data?.id) return { error: saved.error?.code === "40001" ? "O relatório ou perfil mudou em outra sessão. Atualize a página e confira antes de preparar novamente." : "Não foi possível salvar a revisão. Confira a migração de revisões e tente novamente." };
  revalidatePath(`/painel/importacoes/historico/${report.data.id}`);
  return { id: saved.data.id, version: saved.data.version, sha256: saved.data.sha256,
    success: "Revisão salva para conferência. Esta ação não transmite DPS." };
}

export async function confirmReportReview(reviewId: string, sha256: string): Promise<ReviewState> {
  const { context } = await requireWorkspace({ strong: true });
  const admin = createAdminClient();
  if (!admin || !/^[0-9a-f-]{36}$/i.test(reviewId) || !/^[a-f0-9]{64}$/.test(sha256)) return { error: "Revisão indisponível." };
  const result = await admin.rpc("confirm_report_review", { p_actor: context.user.id, p_review: reviewId, p_expected_sha256: sha256 });
  if (result.error || !result.data) return { error: "A revisão ou a configuração mudou. Atualize a página e confira a versão atual." };
  revalidatePath("/painel/importacoes/historico", "layout");
  return { success: "Revisão confirmada para homologação. Colocar um lote na fila é uma ação separada; consulte o histórico das operações." };
}
