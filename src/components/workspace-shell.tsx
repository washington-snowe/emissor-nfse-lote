import Link from "next/link";
import { Building2, FileSpreadsheet, FileText, LayoutDashboard, LogOut, KeyRound } from "lucide-react";
import { Brand } from "@/components/brand";
import { signOut } from "@/app/auth/actions";

const destinations = [
  { id: "overview", href: "/painel", label: "Visão geral", Icon: LayoutDashboard },
  { id: "companies", href: "/painel/empresas", label: "Empresas", Icon: Building2 },
  { id: "imports", href: "/painel/importacoes", label: "Relatórios", Icon: FileSpreadsheet },
  { id: "invoices", href: "/painel/notas", label: "Emissões", Icon: FileText },
  { id: "certificates", href: "/painel/certificados", label: "Certificados A1", Icon: KeyRound },
] as const;

function WorkspaceLinks({ active }: { active: string }) {
  return destinations.map(({ id, href, label, Icon }) => <Link key={id} href={href} className={active === id ? "sidebar-active" : "sidebar-link"} aria-current={active === id ? "page" : undefined}>
    <Icon size={19} aria-hidden="true" /> {label}
  </Link>);
}

export function WorkspaceShell({
  email,
  active = "overview",
  children,
}: {
  email?: string;
  active?: "overview" | "companies" | "imports" | "certificates" | "invoices";
  children: React.ReactNode;
}) {
  return (
    <div className="dashboard-shell">
      <aside className="sidebar">
        <Brand />
        <nav aria-label="Seu espaço">
          <span className="sidebar-label">Área de trabalho</span>
          <WorkspaceLinks active={active} />
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
        <details className="workspace-mobile-menu"><summary>Navegar no painel</summary><nav aria-label="Navegação móvel"><WorkspaceLinks active={active} /></nav></details>
        {children}
      </main>
    </div>
  );
}
