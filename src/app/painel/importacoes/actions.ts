"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/lib/tenancy-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processQueuedWork } from "@/lib/queue-runner";
import { MAX_SHOPEE_CSV_BYTES } from "@/lib/shopee-seller-csv";

export async function saveReport(form: FormData): Promise<{ id?: string; duplicate?: boolean; error?: string }> {
  const { client, context } = await requireWorkspace();
  const admin = createAdminClient();
  if (!admin) return { error: "O salvamento de relatórios ainda não está configurado." };
  const company = form.get("company_id");
  const file = form.get("file");
  if (typeof company !== "string" || !/^[0-9a-f-]{36}$/i.test(company) ||
    !(file instanceof File) || !file.size || file.size > MAX_SHOPEE_CSV_BYTES ||
    file.name.length > 200 || !file.name.toLowerCase().endsWith(".csv"))
    return { error: "Escolha sua empresa e um CSV válido de até 512 KB." };
  const owner = await client.from("companies").select("id").eq("id", company).eq("tenant_id", context.tenantId).maybeSingle();
  if (owner.error || !owner.data) return { error: "Empresa não encontrada no seu espaço." };
  try {
    const result = await admin.rpc("register_report", {
      p_actor: context.user.id, p_company: company, p_file_name: file.name,
      p_source_base64: Buffer.from(await file.arrayBuffer()).toString("base64"),
    });
    if (result.error || !result.data?.id)
      return { error: result.error?.code === "P0001" ? "Limite de 10 novos relatórios em 10 minutos. Aguarde antes de salvar outro." : "Não foi possível salvar. Tente novamente; um arquivo idêntico não será duplicado." };
    after(async () => { try { await processQueuedWork(context.tenantId); } catch { /* Durable lease and Cron recover interrupted processing. */ } });
    revalidatePath("/painel/importacoes/historico");
    return { id: result.data.id, duplicate: result.data.duplicate === true };
  } catch {
    return { error: "Não foi possível confirmar o salvamento. Você pode repetir o envio do mesmo arquivo." };
  }
}

export async function retryImport(id: string): Promise<{ error?: string }> {
  const { context } = await requireWorkspace();
  const admin = createAdminClient();
  if (!admin || !/^[0-9a-f-]{36}$/i.test(id)) return { error: "Processamento indisponível." };
  const result = await admin.rpc("retry_report_processing", { p_actor: context.user.id, p_import: id });
  if (result.error || result.data !== true) return { error: "Não foi possível retomar. Aguarde uma execução em andamento ou tente em alguns minutos." };
  after(async () => { try { await processQueuedWork(context.tenantId); } catch { /* The durable queue remains available for recovery. */ } });
  revalidatePath(`/painel/importacoes/historico/${id}`);
  return {};
}
