import "server-only";
import { notFound } from "next/navigation";
import { cache } from "react";
import { cookies } from "next/headers";
import { requireWorkspace } from "@/lib/tenancy-server";
import { chooseCompany, COMPANY_COOKIE, type NavigationCompany } from "@/lib/workspace-navigation";
const loadWorkspaceData = cache(async () => {
  const { client, context } = await requireWorkspace();
  const [companies, store] = await Promise.all([
    client.from("companies").select("id,legal_name,cnpj").eq("tenant_id", context.tenantId).order("created_at"),
    cookies(),
  ]);
  if (companies.error) throw new Error("Companies unavailable");
  const owned = companies.data as NavigationCompany[];
  return { client, context, companies: owned, selected: chooseCompany(owned, store.get(COMPANY_COOKIE)?.value) };
});

export const getWorkspaceProfile = cache(async () => {
  const { client, context } = await requireWorkspace();
  const { data, error } = await client.from("account_profiles").select("display_name,phone,version")
    .eq("tenant_id", context.tenantId).maybeSingle();
  return { profile: data as { display_name: string; phone: string; version: number } | null, profileAvailable: !error };
});

export const getWorkspaceData = cache(async (requested?: string) => {
  const data = await loadWorkspaceData();
  if (!requested) return data;
  const selected = data.companies.find(company => company.id === requested);
  if (!selected) notFound();
  return { ...data, selected };
});
