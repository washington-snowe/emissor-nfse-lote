import { PageHeader } from "@/components/page-header";
import type { Metadata } from "next";
import { requireWorkspace } from "@/lib/tenancy-server";
import { WorkspaceShell } from "@/components/workspace";
import { CompanyForm } from "@/components/company-form";

export const metadata: Metadata = { title: "Cadastrar empresa" };
export const dynamic = "force-dynamic";
export default async function NewCompany() {
  const { context } = await requireWorkspace();
  return (
    <WorkspaceShell email={context.user.email} active="companies">
      <div className="dashboard-content company-page">
        <PageHeader title="Cadastrar empresa" description="Informe o CNPJ para consultar e revisar os dados cadastrais."
          back={{ href: "/painel/empresas", label: "Empresas" }} />
        <CompanyForm />
      </div>
    </WorkspaceShell>
  );
}
