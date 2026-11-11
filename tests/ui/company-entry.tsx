import { createRoot } from "react-dom/client";
import { CompanyForm } from "../../src/components/company-form";
import { WorkspaceShell } from "../../src/components/workspace-shell";

window.companyUiTest = { calls: 0, mode: "success", saved: [], path: "" };
createRoot(document.getElementById("root")!).render(<WorkspaceShell email="interface@emissor.example" active="companies"><div className="dashboard-content company-page"><p>Ambiente isolado de teste de interface · sem dados ou gravação reais</p><h1>Cadastre sua empresa.</h1><p>Informe o CNPJ, revise os dados e salve sua empresa.</p><CompanyForm /></div></WorkspaceShell>);
