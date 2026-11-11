import { createRoot } from "react-dom/client";
import { ReportPreview } from "../../src/components/report-preview";
import { WorkspaceShell } from "../../src/components/workspace-shell";

const companies = new URLSearchParams(location.search).has("empty") ? [] : [
  { id: "test-company-a", legal_name: "Empresa sintética A", cnpj: "11222333000181" },
  { id: "test-company-b", legal_name: "Empresa sintética B", cnpj: "12ABC34501DE35" },
];
createRoot(document.getElementById("root")!).render(
  <WorkspaceShell email="interface@emissor.example" active="imports">
    <div className="dashboard-content report-page">
      <p>Ambiente isolado de teste de interface · empresas e arquivo fictícios</p>
      <span className="eyebrow">Relatórios de comissões</span>
      <h1>Confira seu relatório da Shopee.</h1>
      <p>Escolha sua empresa e confira o CSV mensal por vendedor antes de preparar a emissão.</p>
      <ReportPreview companies={companies} />
    </div>
  </WorkspaceShell>,
);
