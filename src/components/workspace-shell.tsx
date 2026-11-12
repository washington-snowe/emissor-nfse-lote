"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Building2, ChevronDown, ChevronsUpDown, CreditCard, FilePlus2, FileText, House, KeyRound, Layers, LogOut, Menu, ReceiptText, Settings2, Share2, ShieldCheck, UploadCloud, UserRound } from "lucide-react";
import { signOut } from "@/app/auth/actions";
import { selectWorkspaceCompany } from "@/app/painel/navigation-actions";
import { chooseCompany, formatCompanyDocument, workspaceDestination, type NavigationCompany, type WorkspaceArea } from "@/lib/workspace-navigation";
export function WorkspaceShell({ email, name, active = "overview", companies = [], companyId, children }: {
  email?: string; name?: string; active?: WorkspaceArea; companies?: NavigationCompany[]; companyId?: string; children: React.ReactNode;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const selected = chooseCompany(companies, companyId);
  const displayName = name || email?.split("@")[0] || "Minha conta";
  const link = (area: WorkspaceArea, label: string, Icon: typeof House) => <Link href={workspaceDestination(area, selected?.id)}
    className={`workspace-nav-link${active === area ? " is-current" : ""}`} aria-current={active === area ? "page" : undefined}>
    <Icon size={19} strokeWidth={1.7} aria-hidden="true" /><span>{label}</span></Link>;
  const companyPicker = (suffix: string) => <div className="workspace-company"><span className="workspace-company-icon"><Building2 size={21} aria-hidden="true" /></span><div className="workspace-company-copy">
    {companies.length ? <><label className="sr-only" htmlFor={`workspace-company-${suffix}`}>Empresa em uso</label><select id={`workspace-company-${suffix}`} value={selected?.id ?? ""} disabled={pending} onChange={event => {
      const id = event.target.value; setError(""); startTransition(async () => { const result = await selectWorkspaceCompany(id, active); if (result?.error) setError(result.error); });
    }}>{companies.map(company => <option key={company.id} value={company.id}>{company.legal_name}</option>)}</select><span className="mono">{selected ? formatCompanyDocument(selected.cnpj) : ""}</span></> : <Link href="/painel/empresas/nova">Cadastrar empresa<span>Comece pelo CNPJ</span></Link>}
  </div><ChevronsUpDown size={16} aria-hidden="true" />{error && <p className="field-error" role="alert">{error}</p>}</div>;
  const navigation = <nav aria-label="Navegação principal" className="workspace-navigation">
    {link("overview", "Início", House)}{link("invoices", "Notas", FileText)}
    <details className="workspace-nav-group" open><summary><UploadCloud size={19} aria-hidden="true" /><span>Emitir</span><ChevronDown size={16} aria-hidden="true" /></summary><div className="workspace-subnav">
      {link("imports", "Notas em lote", Layers)}{link("standalone", "Nota avulsa", FilePlus2)}
    </div></details><span className="workspace-nav-heading">Ajustes</span>
    <details className="workspace-nav-group" open><summary><Building2 size={19} aria-hidden="true" /><span>Empresa</span><ChevronDown size={16} aria-hidden="true" /></summary><div className="workspace-subnav">
      {link("companies", "Cadastro", ReceiptText)}{link("service", "Serviço", FileText)}{link("advanced", "Avançado", Settings2)}{link("certificates", "Certificado", ShieldCheck)}
      <Link className="workspace-manage-link" href="/painel/empresas">Gerenciar empresas</Link>
    </div></details>
    <details className="workspace-nav-group" open><summary><Settings2 size={19} aria-hidden="true" /><span>Conta</span><ChevronDown size={16} aria-hidden="true" /></summary><div className="workspace-subnav">
      {link("profile", "Perfil", UserRound)}{link("login", "Login", KeyRound)}{link("subscription", "Assinatura", CreditCard)}{link("referrals", "Indicações", Share2)}
    </div></details>
  </nav>;
  const account = <details className="workspace-account"><summary><span className="workspace-avatar">{displayName.slice(0, 1).toLocaleUpperCase("pt-BR")}</span><span className="workspace-account-copy"><strong>{displayName}</strong><span>{email}</span></span><ChevronsUpDown size={16} aria-hidden="true" /></summary><div className="workspace-account-actions"><Link href="/painel/conta/perfil">Meu perfil</Link><form action={signOut}><button type="submit"><LogOut size={17} aria-hidden="true" /> Sair da conta</button></form></div></details>;
  return <div className="dashboard-shell workspace-shell"><aside className="workspace-sidebar">{companyPicker("desktop")}<div className="workspace-nav-scroll">{navigation}</div>{account}</aside>
    <main id="conteudo" className="dashboard-main"><header className="dashboard-header"><span>{selected?.legal_name || "Seu espaço de trabalho"}</span><span className="user-email">{email}</span></header>
      <details className="workspace-mobile-navigation"><summary><Menu size={18} aria-hidden="true" /> Menu do painel<ChevronDown size={16} aria-hidden="true" /></summary><div className="workspace-mobile-content">
        {companyPicker("mobile")}{navigation}{account}
      </div></details>{children}</main></div>;
}
