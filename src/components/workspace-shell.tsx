import Link from "next/link";
import { Building2, FileSpreadsheet, LayoutDashboard, LogOut } from "lucide-react";
import { Brand } from "@/components/brand";
import { signOut } from "@/app/auth/actions";

export function WorkspaceShell({
  email,
  active = "overview",
  children,
}: {
  email?: string;
  active?: "overview" | "companies" | "imports";
  children: React.ReactNode;
}) {
  return (
    <div className="dashboard-shell">
      <aside className="sidebar">
        <Brand />
        <nav aria-label="Seu espaço">
          <span className="sidebar-label">Área de trabalho</span>
          <Link
            href="/painel"
            className={
              active === "overview" ? "sidebar-active" : "sidebar-link"
            }
            aria-current={active === "overview" ? "page" : undefined}
          >
            <LayoutDashboard size={19} aria-hidden="true" /> Visão geral
          </Link>
          <Link
            href="/painel/empresas"
            className={
              active === "companies" ? "sidebar-active" : "sidebar-link"
            }
            aria-current={active === "companies" ? "page" : undefined}
          >
            <Building2 size={19} aria-hidden="true" /> Empresas
          </Link>
          <Link href="/painel/importacoes" className={active === "imports" ? "sidebar-active" : "sidebar-link"} aria-current={active === "imports" ? "page" : undefined}>
            <FileSpreadsheet size={19} aria-hidden="true" /> Relatórios
          </Link>
        </nav>
        <div className="sidebar-bottom">
          <span className="small-status">Versão inicial</span>
          <form action={signOut}>
            <button className="btn btn--secondary" type="submit">
              <LogOut size={17} aria-hidden="true" /> Sair da conta
            </button>
          </form>
        </div>
      </aside>
      <main id="conteudo" className="dashboard-main">
        <header className="dashboard-header">
          <span>Seu espaço de trabalho</span>
          <span className="user-email">{email}</span>
        </header>
        {children}
      </main>
    </div>
  );
}
