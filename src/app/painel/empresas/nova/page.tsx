import type { Metadata } from "next";
import { requireWorkspace } from "@/lib/tenancy-server";
import { WorkspaceShell } from "@/components/workspace-shell";
import { CompanyForm } from "@/components/company-form";

export const metadata: Metadata = { title: "Cadastrar empresa" };
export const dynamic = "force-dynamic";
export default async function NewCompany() {
  const { context } = await requireWorkspace();
  return (
    <WorkspaceShell email={context.user.email} active="companies">
      <div className="dashboard-content company-page">
        <span className="eyebrow">Empresas</span>
          <h1>Cadastre sua empresa.</h1>
        <p>Informe o CNPJ, revise os dados e salve sua empresa.</p>
        <CompanyForm />
      </div>
    </WorkspaceShell>
  );
}
