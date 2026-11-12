"use server";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/lib/tenancy-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { prepareStandalone } from "@/lib/nfse/standalone";
import { validateFiscalSchema } from "@/lib/nfse/schema";
import { processQueuedWork } from "@/lib/queue-runner";

export type FiscalActionState = { error?: string; success?: string; id?: string; duplicate?: boolean; templateVersion?: number };
function kick(tenant: string) {
  after(async () => { try { await processQueuedWork(tenant); } catch { /* Durable leases remain recoverable. */ } });
}
export async function issueStandalone(companyId: string, profileId: string, profileHash: string, form: FormData): Promise<FiscalActionState> {
  const { client, context } = await requireWorkspace();
  const admin = createAdminClient();
  if (!admin) return { error: "O processamento privado ainda não está configurado." };
  const [company, profile] = await Promise.all([
    client.from("companies").select("id,cnpj,tax_regime").eq("id", companyId).eq("tenant_id", context.tenantId).maybeSingle(),
    client.from("company_fiscal_profiles").select("id,configuration_sha256,valid_from").eq("company_id", companyId).eq("tenant_id", context.tenantId).order("version", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (company.error || !company.data || profile.error || !profile.data || profile.data.id !== profileId || profile.data.configuration_sha256 !== profileHash) return { error: "A empresa ou configuração fiscal mudou. Atualize a página antes de preparar a nota." };
  const requestId = form.get("request_id"), payload = form.get("payload"), templateVersion = form.get("template_version");
  if (typeof requestId !== "string" || !/^[0-9a-f-]{36}$/i.test(requestId) || typeof payload !== "string" || payload.length > 40000 ||
    typeof templateVersion !== "string" || !/^(0|[1-9]\d{0,8})$/.test(templateVersion)) return { error: "Não foi possível conferir os dados da nota." };
  let raw: unknown;
  try { raw = JSON.parse(payload); } catch { return { error: "Dados da nota inválidos." }; }
  const prepared = prepareStandalone(raw, company.data.cnpj, company.data.tax_regime, profile.data.valid_from);
  if (!prepared) return { error: "Confira o valor, a competência e os dados fiscais. Use vírgula nos centavos, sem arredondamento. Dados de exterior exigem informações complementares." };
  const reserved = await admin.rpc("reserve_company_operation", { p_actor: context.user.id, p_company: company.data.id, p_operation: "prepare_batch" });
  if (reserved.error || reserved.data !== true) return { error: "Aguarde alguns minutos antes de preparar outra nota." };
  if (!await validateFiscalSchema(prepared.probeXml, "DPS")) return { error: "Os dados da nota não atendem ao formato XML publicado. Confira os campos em “Alterar dados da nota”." };
  const result = await admin.rpc("issue_standalone", { p_actor: context.user.id, p_company: company.data.id, p_profile: profile.data.id,
    p_expected_profile_sha256: profileHash, p_request: requestId, p_data: prepared.data, p_configuration: prepared.configuration,
    p_remember: form.get("remember") === "on", p_expected_template_version: Number(templateVersion) });
  if (result.error || !result.data?.id) return { error: result.error?.code === "40001" ? "A configuração ou o modelo mudou em outra sessão. Atualize e confira antes de repetir." :
    result.error?.code === "23505" ? "Já existe uma operação que cobre esta origem. Confira o histórico; cancele somente preparações que ainda não foram transmitidas." : "Não foi possível confirmar a fila. Você pode repetir esta mesma solicitação sem criar outra nota." };
  kick(context.tenantId);
  revalidatePath("/painel/notas", "layout"); revalidatePath("/painel");
  return { id: result.data.id, duplicate: result.data.duplicate === true, templateVersion: result.data.templateVersion,
    success: result.data.duplicate ? "Esta solicitação já está no histórico. Abrimos a operação existente." : "Nota preparada na fila de homologação. Acompanhe as pendências e o resultado no histórico." };
}
export async function enqueueReport(reviewId: string, sha256: string, requestId: string): Promise<FiscalActionState> {
  const { context } = await requireWorkspace();
  const admin = createAdminClient();
  if (!admin || !/^[0-9a-f-]{36}$/i.test(reviewId) || !/^[0-9a-f-]{36}$/i.test(requestId) || !/^[0-9a-f]{64}$/.test(sha256)) return { error: "Fila indisponível." };
  const result = await admin.rpc("enqueue_report_fiscal", { p_actor: context.user.id, p_review: reviewId, p_sha256: sha256, p_request: requestId });
  if (result.error || !result.data?.id) return { error: result.error?.code === "23505" ? "Uma origem deste relatório já está reservada em outra emissão. Confira o histórico para evitar duplicidade." : "Não foi possível enfileirar. Confira a confirmação da revisão, a versão do perfil e a configuração do servidor." };
  kick(context.tenantId); revalidatePath("/painel/notas"); revalidatePath("/painel");
  return { id: result.data.id, duplicate: result.data.duplicate, success: "Lote na fila de homologação." };
}
export async function manageOperation(id: string, action: "resume" | "cancel"): Promise<FiscalActionState> {
  const { context } = await requireWorkspace(); const admin = createAdminClient();
  if (!admin || !/^[0-9a-f-]{36}$/i.test(id) || !["resume", "cancel"].includes(action)) return { error: "Operação indisponível." };
  const result = await admin.rpc("manage_fiscal_operation", { p_actor: context.user.id, p_operation: id, p_action: action });
  if (result.error || result.data !== true) return { error: "A operação mudou ou não permite essa ação. Uma transmissão iniciada nunca é cancelada ou reenviada por este botão." };
  if (action === "resume") kick(context.tenantId);
  revalidatePath("/painel/notas", "layout"); revalidatePath("/painel");
  return { success: action === "cancel" ? "Preparação cancelada. Não houve transmissão desta operação." : "Processamento retomado. Operações incertas seguem somente para consulta." };
}
export async function resumeBatch(id: string): Promise<FiscalActionState> {
  const { context } = await requireWorkspace(); const admin = createAdminClient();
  if (!admin || !/^[0-9a-f-]{36}$/i.test(id)) return { error: "Lote indisponível." };
  const result = await admin.rpc("resume_fiscal_batch", { p_actor: context.user.id, p_batch: id });
  if (result.error) return { error: "Não foi possível retomar. Confira as pendências e tente novamente." };
  kick(context.tenantId); revalidatePath("/painel/notas", "layout");
  return { success: "Fila verificada. Preparações atuais foram retomadas; operações já enviadas continuam sem retransmissão." };
}
