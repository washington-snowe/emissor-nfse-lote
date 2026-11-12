"use server";
import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/tenancy-server";
import { getSiteOrigin } from "@/lib/config";
import { billingDestination } from "@/lib/billing/checkout";
import type { AccountState } from "@/lib/account";
export async function openBilling(manage: boolean, _previous: AccountState, form: FormData): Promise<AccountState> {
  const { context }=await requireWorkspace(), origin=getSiteOrigin(process.env), request=form.get("request_id");
  if (!origin || !context.user.email || typeof request!=="string" || !/^[0-9a-f-]{36}$/i.test(request)) return { error:"Não foi possível conferir a solicitação." };
  let url:string;
  try { url=await billingDestination({ actor:context.user.id,email:context.user.email,origin,request,manage,plan:String(form.get("plan")??""),cadence:String(form.get("cadence")??"") }); }
  catch { return { error:"Não foi possível abrir a Stripe. Se você já iniciou um pagamento, confira a assinatura antes de repetir. Aguarde alguns instantes e tente novamente." }; }
  redirect(url);
}
