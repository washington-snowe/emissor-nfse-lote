"use server";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/lib/tenancy-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processQueuedWork } from "@/lib/queue-runner";
import {selectedFiscalEnvironment} from '@/lib/nfse/environment';

export type FiscalActionState = { error?: string; success?: string; id?: string; duplicate?: boolean; templateVersion?: number };
function kick(tenant: string) {
  after(async () => { try { await processQueuedWork(tenant); } catch { /* Durable leases remain recoverable. */ } });
}
export async function issueStandalone(companyId: string, profileId: string, profileHash: string, form: FormData): Promise<FiscalActionState> {
  void companyId;void profileId;void profileHash;void form;
  await requireWorkspace();
  return {error:'A emissão agora é feita somente pelo relatório. Importe o CSV e revise as notas antes de confirmar.'};
}
export async function enqueueReport(reviewId: string, sha256: string, requestId: string): Promise<FiscalActionState> {
  const { context } = await requireWorkspace();
  if(selectedFiscalEnvironment(process.env)==='production')return {error:'Abra a revisão do relatório para conferir e autorizar a emissão real deste lote.'};
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
