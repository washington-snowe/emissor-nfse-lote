import "server-only";
import { redirect } from "next/navigation";
import { createSupabaseClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenancy";

export async function requireWorkspace(options: { allowMfaSetup?: boolean; strong?: boolean } = {}) {
  const client = await createSupabaseClient();
  if (!client) redirect("/entrar");
  const context = await getTenantContext(client);
  if (context.status === "unauthenticated") redirect("/entrar");
  if (context.status !== "ready")
    throw new Error("Workspace initialization unavailable.");
  const verified = context.user.factors?.some(factor => factor.status === "verified") ?? false;
  const level = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (level.error) throw new Error("Account assurance unavailable.");
  if (verified && level.data.currentLevel !== "aal2" && !options.allowMfaSetup) redirect("/verificar-acesso");
  if (options.strong && (!verified || level.data.currentLevel !== "aal2")) redirect("/painel/seguranca");
  return { client, context };
}
