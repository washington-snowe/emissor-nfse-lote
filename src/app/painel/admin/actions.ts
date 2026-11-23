"use server";

import { randomInt, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { creditVerifier, requireRexAdmin, uuidPattern } from "@/lib/admin-credits";
import { emailConfig } from "@/lib/email/config";
import { sendInvoiceEmail } from "@/lib/email/providers";

export type ReleaseState =
  | { stage: "request"; error?: string }
  | { stage: "confirm"; id: string; recipient: string; quantity: number; error?: string }
  | { stage: "done"; recipient: string; quantity: number };

export async function releaseNoteCredits(previous: ReleaseState, form: FormData): Promise<ReleaseState> {
  const { admin, actor } = await requireRexAdmin();
  const challenge = form.get("challenge");
  if (typeof challenge === "string" && uuidPattern.test(challenge)) {
    // The database owns the recipient and quantity. Client state is presentational only.
    const code = form.get("code");
    const pending = previous.stage === "confirm" && previous.id === challenge
      ? previous
      : { stage: "confirm" as const, id: challenge, recipient: "", quantity: 0 };
    if (typeof code !== "string" || !/^\d{6}$/.test(code)) {
      return { ...pending, error: "Digite os seis dígitos do e-mail." };
    }
    const verifier = creditVerifier(actor, challenge, code);
    if (!verifier) return { ...pending, error: "A confirmação está indisponível. Tente mais tarde." };
    const result = await admin.rpc("rex_confirm_note_credit", {
      p_actor: actor, p_id: challenge, p_verifier: verifier,
    });
    if (result.error) return { ...pending, error: "Não foi possível confirmar agora. Confira o histórico antes de solicitar outro código." };
    if (result.data === "granted") {
      revalidatePath("/painel/admin");
      return { stage: "done", recipient: pending.recipient, quantity: pending.quantity };
    }
    if (result.data === "invalid") return { ...pending, error: "Código incorreto. Confira o e-mail e tente de novo." };
    return { stage: "request", error: "O código expirou ou já foi usado. Confira o histórico antes de pedir outro." };
  }

  const tenant = form.get("tenant");
  const notes = form.get("quantity");
  const quantity = typeof notes === "string" && /^\d{1,5}$/.test(notes) ? Number(notes) : 0;
  const reason = form.get("reason");
  if (typeof tenant !== "string" || !uuidPattern.test(tenant) || quantity < 1 || quantity > 10_000
    || typeof reason !== "string" || reason.trim().length < 3 || reason.trim().length > 240) {
    return { stage: "request", error: "Selecione uma conta, informe de 1 a 10.000 notas e descreva o motivo." };
  }

  const config = emailConfig(process.env);
  const id = randomUUID();
  const code = String(randomInt(1_000_000)).padStart(6, "0");
  const verifier = creditVerifier(actor, id, code);
  if (!verifier || !config.sender || !config.providers.includes("brevo")) {
    return { stage: "request", error: "O envio do código está indisponível. Tente mais tarde." };
  }

  const reservation = await admin.rpc("rex_begin_note_credit", {
    p_actor: actor, p_id: id, p_tenant: tenant, p_quantity: quantity, p_reason: reason.trim(), p_verifier: verifier,
  });
  if (reservation.error) return { stage: "request", error: "Não foi possível preparar a liberação. Atualize a página e tente de novo." };
  if (reservation.data === null) {
    return { stage: "request", error: "Aguarde um minuto entre pedidos. Você pode solicitar até cinco códigos por hora." };
  }

  const { recipient, destination } = reservation.data as { recipient?: unknown; destination?: unknown };
  if (typeof recipient !== "string" || typeof destination !== "string") {
    return { stage: "request", error: "A solicitação de confirmação não está disponível." };
  }
  const outcome = await sendInvoiceEmail("brevo", {
    from: config.sender,
    to: destination,
    subject: "Confirme a liberação de notas no Rex",
    text: `Código: ${code}\n\nConfirme apenas se você solicitou ${quantity.toLocaleString("pt-BR")} crédito(s) para ${recipient}. O código vale por 10 minutos.\n\nSe você não solicitou, ignore este e-mail.`,
  }, process.env);
  const delivery = await admin.rpc("rex_finish_note_credit_delivery", {
    p_actor: actor, p_id: id, p_delivered: outcome.outcome === "accepted",
  });
  if (delivery.error || delivery.data !== true) {
    return { stage: "request", error: "Não foi possível confirmar o envio do código. Aguarde um minuto e tente de novo." };
  }
  return { stage: "confirm", id, recipient, quantity };
}
