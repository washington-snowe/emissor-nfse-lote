"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/tenancy-server";
import { COMPANY_COOKIE, workspaceDestination } from "@/lib/workspace-navigation";
export async function selectWorkspaceCompany(companyId: string, area: string): Promise<{ error?: string }> {
  const { client, context } = await requireWorkspace();
  if (!/^[0-9a-f-]{36}$/i.test(companyId)) return { error: "Empresa inválida." };
  const result = await client.from("companies").select("id").eq("id", companyId).eq("tenant_id", context.tenantId).maybeSingle();
  if (result.error || !result.data) return { error: "Esta empresa não está disponível na sua conta." };
  (await cookies()).set(COMPANY_COOKIE, result.data.id, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 31_536_000 });
  redirect(workspaceDestination(area, result.data.id));
}
