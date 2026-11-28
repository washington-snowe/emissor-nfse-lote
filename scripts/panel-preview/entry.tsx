import { createRoot } from "react-dom/client";
import { DashboardHome, DashboardOverview } from "@/components/dashboard-home";
import { WorkspaceShell } from "@/components/workspace-shell";
import { overviewMonth, type OverviewNote } from "@/lib/dashboard-overview";

const companyId = "00000000-0000-4000-8000-000000000001";
const month = overviewMonth();
const [year, number] = month.split("-").map(Number);
const recent: OverviewNote[] = Array.from({ length: 100 }, (_, index) => {
  const date = new Date(Date.UTC(year, number - 1 - index % 6, 1));
  return {
    id: `preview-note-${index}`,
    recipient: { legalName: `Vendedor de demonstração ${String(index + 1).padStart(2, "0")}` },
    amount: `${80 + (index * 47) % 600}.${String(index % 100).padStart(2, "0")}`,
    competence_date: date.toISOString().slice(0, 10),
    status: index === 2 ? "queued" : index === 4 ? "uncertain" : "authorized",
    environment: "production",
  };
});

createRoot(document.getElementById("root")!).render(
  <WorkspaceShell name="Conta de demonstração" email="demo@example.com" active="overview"
    companies={[{ id: companyId, legal_name: "Empresa de demonstração", cnpj: "11222333000181" }]} companyId={companyId}>
    <DashboardHome companyName="Empresa de demonstração" importHref="/painel/importacoes">
      <DashboardOverview totals={{ authorized: 328, queued: 12, preparing: 3, uncertain: 4, rejected: 2, cancelled: 1 }}
        notes={recent} month={month} notesHref="/painel/notas" />
    </DashboardHome>
  </WorkspaceShell>,
);
