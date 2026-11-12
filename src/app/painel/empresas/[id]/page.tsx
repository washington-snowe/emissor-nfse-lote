import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/tenancy-server";
import { emptyCompany, type CompanyDraft } from "@/lib/companies";
import { WorkspaceShell } from "@/components/workspace";
import { CompanyForm } from "@/components/company-form";

export const metadata: Metadata = { title: "Dados da empresa" };
export const dynamic = "force-dynamic";
export default async function EditCompany({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { client, context } = await requireWorkspace();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data: row, error } = await client
    .from("companies")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", context.tenantId)
    .maybeSingle();
  if (error) throw new Error("Company unavailable.");
  if (!row) notFound();
  const initial: CompanyDraft = { ...emptyCompany };
  const values = { ...row, ...(row.address ?? {}) };
  for (const key of Object.keys(emptyCompany) as (keyof CompanyDraft)[]) {
    if (typeof emptyCompany[key] === "string")
      (initial as unknown as Record<string, unknown>)[key] =
        typeof values[key] === "string" ? values[key] : "";
  }
  initial.mei_option =
    typeof row.mei_option === "boolean" ? row.mei_option : null;
  initial.simples_option =
    typeof row.simples_option === "boolean" ? row.simples_option : null;
  initial.secondary_cnaes = Array.isArray(row.secondary_cnaes)
    ? row.secondary_cnaes.filter(
        (c: unknown): c is { code: string; description: string } =>
          !!c &&
          typeof c === "object" &&
          "code" in c &&
          typeof c.code === "string" &&
          "description" in c &&
          typeof c.description === "string",
      )
    : [];
  return (
    <WorkspaceShell email={context.user.email} active="companies" companyId={id}>
      <div className="dashboard-content company-page">
        <span className="eyebrow">Empresas</span>
        <h1>Dados da sua empresa.</h1>
        <p>
          Atualize as informações cadastrais. O CNPJ permanece vinculado à mesma
          empresa.
        </p>
        <Link className="btn btn--secondary" href={`/painel/empresas/${id}/fiscal`}>Configurar dados fiscais</Link>
        <CompanyForm initial={initial} companyId={id} />
      </div>
    </WorkspaceShell>
  );
}
