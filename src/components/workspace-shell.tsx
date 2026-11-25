"use client";

import Link, { useLinkStatus } from "next/link";
import { useRef, useState, useTransition } from "react";
import {
  ArrowRight, Building2, ChevronDown, CreditCard, FileStack, FileText, History, House,
  KeyRound, LogOut, Menu, MessageCircle, PanelLeftClose, PanelLeftOpen, Plus, Settings2, Share2, ShieldCheck, Ticket, Upload, UserRound, X,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { signOut } from "@/app/auth/actions";
import { saveWorkspaceSidebar, selectWorkspaceCompany } from "@/app/painel/navigation-actions";
import { chooseCompany, formatCompanyDocument, workspaceDestination, type NavigationCompany, type WorkspaceArea } from "@/lib/workspace-navigation";

const sections = [
  { label: "Emitir", Icon: Upload, items: [
    { area: "imports", label: "Notas em lote", Icon: Upload },
    { area: "history", label: "Importações salvas", Icon: History },
  ] },
  { label: "Empresa", Icon: Building2, items: [
    { area: "companies", label: "Cadastro", Icon: Building2 },
    { area: "service", label: "Serviço", Icon: FileStack },
    { area: "advanced", label: "Avançado", Icon: Settings2 },
    { area: "certificates", label: "Certificado", Icon: ShieldCheck },
  ] },
  { label: "Conta", Icon: Settings2, items: [
    { area: "profile", label: "Perfil", Icon: UserRound },
    { area: "login", label: "Login", Icon: KeyRound },
    { area: "subscription", label: "Assinatura", Icon: CreditCard },
    { area: "referrals", label: "Indicações", Icon: Share2 },
  ] },
] as const;

function NavigationStatus() {
  const { pending } = useLinkStatus();
  return <span className="workspace-link-progress" data-pending={pending} role="status">
    {pending && <span className="sr-only">Carregando página…</span>}
  </span>;
}

export function WorkspaceShell({ email, name, active = "overview", companies = [], companyId, canAdmin = false, compactSidebar = false, support, children }: {
  canAdmin?: boolean; email?: string; name?: string; active?: WorkspaceArea; companies?: NavigationCompany[]; companyId?: string;
  compactSidebar?: boolean; support?: { href: string; label: string }; children: React.ReactNode;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [savingSidebar, toggleSidebar] = useTransition();
  const drawer = useRef<HTMLDialogElement>(null);
  const drawerTrigger = useRef<HTMLButtonElement>(null);
  const selected = chooseCompany(companies, companyId);
  const displayName = name || email?.split("@")[0] || "Minha conta";
  const navigate = (area: WorkspaceArea, label: string, Icon: typeof House) => {
    const current = active === area || (active === "emailTest" && area === "invoices");
    return <Link key={area} href={workspaceDestination(area, selected?.id)} prefetch={false}
      className={`workspace-nav-link${current ? " is-current" : ""}`} aria-current={current ? "page" : undefined}>
      <Icon size={18} strokeWidth={1.8} aria-hidden="true" /><span>{label}</span><NavigationStatus />
    </Link>;
  };
  const navigation = <nav aria-label="Navegação principal" className="workspace-navigation">
    {navigate("overview", "Início", House)}
    {navigate("invoices", "Notas", FileText)}
    {sections.map(({ label, items, Icon }) => <details className="workspace-nav-group" key={label} open={items.some(item => item.area === active)}>
      <summary><Icon size={18} aria-hidden="true" /><span>{label}</span><ChevronDown size={15} aria-hidden="true" /></summary>
      <div className="workspace-nav-children">{items.map(({ area, label, Icon }) => navigate(area, label, Icon))}</div>
    </details>)}
    {canAdmin && <div className="workspace-nav-section">{navigate("admin", "Administração", Ticket)}</div>}
    {support && <div className="workspace-nav-section"><span className="workspace-nav-heading">Suporte</span>
      <a href={support.href} className="workspace-nav-link"><MessageCircle size={18} aria-hidden="true" /><span>{support.label}</span></a>
    </div>}
  </nav>;
  const account = <details className="workspace-account">
    <summary>
      <span className="workspace-avatar" aria-hidden="true">{displayName.slice(0, 1).toLocaleUpperCase("pt-BR")}</span>
      <span className="workspace-account-copy"><strong title={displayName}>{displayName}</strong><span title={email}>{email}</span></span>
      <ChevronDown size={16} aria-hidden="true" />
    </summary>
    <div className="workspace-account-actions">
      <Link prefetch={false} href="/painel/conta/perfil"><UserRound size={16} aria-hidden="true" /> Meu perfil</Link>
      <form action={signOut}><button type="submit"><LogOut size={16} aria-hidden="true" /> Sair da conta</button></form>
    </div>
  </details>;

  return <div className="dashboard-shell workspace-shell workspace-experience rex-workspace" data-sidebar={compactSidebar ? "hidden" : "visible"}>
    <aside className="workspace-sidebar" id="workspace-sidebar">
      <div className="workspace-brand-row"><Brand href="/painel" /></div>
      <div className="workspace-nav-scroll">{navigation}</div>
      {account}
    </aside>
    <div className="workspace-stage">
      <header className="workspace-bar">
        <div className="workspace-bar-inner">
          <button ref={drawerTrigger} className="icon-button workspace-menu-button" type="button" aria-label="Menu do painel" aria-haspopup="dialog" onClick={() => drawer.current?.showModal()}>
            <Menu size={20} aria-hidden="true" />
          </button>
          <button className="icon-button workspace-sidebar-toggle" type="button" aria-controls="workspace-sidebar" aria-expanded={!compactSidebar}
            aria-label={compactSidebar ? "Mostrar navegação" : "Recolher navegação"} disabled={savingSidebar}
            onClick={() => toggleSidebar(async () => {
              try { setError(""); await saveWorkspaceSidebar(!compactSidebar); }
              catch { setError("Não foi possível salvar a preferência de navegação."); }
            })}>
            {compactSidebar ? <PanelLeftOpen size={18} aria-hidden="true" /> : <PanelLeftClose size={18} aria-hidden="true" />}
          </button>
          <div className="workspace-context">
            {selected ? <>
              <div className="workspace-picker">
                <Building2 size={17} aria-hidden="true" />
                <label className="sr-only" htmlFor="workspace-company">Empresa em uso</label>
                <select id="workspace-company" value={selected.id} disabled={pending} title={selected.legal_name} onChange={event => {
                  const id = event.target.value;
                  setError("");
                  startTransition(async () => {
                    const result = await selectWorkspaceCompany(id, active);
                    if (result?.error) setError(result.error);
                  });
                }}>
                  {companies.map(company => <option key={company.id} value={company.id}>{company.legal_name}</option>)}
                </select>
                <ChevronDown size={15} aria-hidden="true" />
              </div>
              <span className="workspace-document mono">{formatCompanyDocument(selected.cnpj)}</span>
            </> : <Link prefetch={false} className="workspace-context-link" href="/painel/empresas/nova"><Plus size={16} aria-hidden="true" /> Cadastrar empresa</Link>}
          </div>
          <Link prefetch={false} className="workspace-companies-link" href="/painel/empresas" aria-label="Gerenciar empresas" title="Gerenciar empresas"><span>Empresas</span><ArrowRight size={16} aria-hidden="true" /></Link>
          <div className="workspace-bar-account">{account}</div>
        </div>
        {error && <p className="field-error workspace-switch-error" role="alert">{error}</p>}
        {pending && <span className="sr-only" role="status">Trocando empresa…</span>}
      </header>
      <dialog ref={drawer} className="workspace-drawer" aria-label="Menu do painel" onClose={() => drawerTrigger.current?.focus()}
        onClick={event => {
          if (event.target instanceof Element && event.target.closest("a") && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
            drawer.current?.close();
          }
        }}>
        <div className="workspace-drawer-inner">
          <header className="workspace-brand-row">
            <Brand href="/painel" />
            <button type="button" className="icon-button" aria-label="Fechar menu" onClick={() => drawer.current?.close()} autoFocus><X size={21} aria-hidden="true" /></button>
          </header>
          <div className="workspace-nav-scroll">{navigation}</div>
          <Link prefetch={false} className="workspace-drawer-company" href="/painel/empresas"><Building2 size={18} aria-hidden="true" /> Gerenciar empresas <ArrowRight size={16} aria-hidden="true" /></Link>
          {account}
        </div>
      </dialog>
      <main id="conteudo" className="dashboard-main">{children}</main>
    </div>
  </div>;
}
