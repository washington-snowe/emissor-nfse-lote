import "server-only";
import { redirect } from "next/navigation";
import { createSupabaseClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenancy";

export async function requireWorkspace() {
  const client = await createSupabaseClient();
  if (!client) redirect("/entrar");
  const context = await getTenantContext(client);
  if (context.status === "unauthenticated") redirect("/entrar");
  if (context.status !== "ready")
    throw new Error("Workspace initialization unavailable.");
  return { client, context };
}
