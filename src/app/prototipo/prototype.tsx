"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowDownToLine, ArrowRight, ArrowUpRight, Building2, ChevronDown, CircleCheck, CreditCard, FileSpreadsheet, FileText, History, House, KeyRound, Mail, Menu, Settings2, ShieldCheck, Ticket, Upload, UserRound, Users, X } from "lucide-react";
import { Brand } from "@/components/brand";
import { plans } from "@/lib/billing/catalog";
import { PlanCard, PlanIntervalToggle } from "@/components/plan-card";
import { screens, type Screen } from "./screens";

const navigation = [
  ["inicio", "Início", House], ["importar", "Notas em lote", Upload], ["notas", "Notas", FileText],
  ["historico", "Importações salvas", History], ["empresas", "Empresas", Building2], ["certificado", "Certificado", ShieldCheck],
  ["perfil", "Perfil", UserRound], ["assinatura", "Assinatura", CreditCard], ["admin", "Administração", Settings2],
] as const;
const prototypeHref = (screen: Screen) => `/prototipo?tela=${screen}`;
type Navigate = (screen: Screen) => void;

function Go({ to, children, navigate, primary = false }: { to: Screen; children: ReactNode; navigate: Navigate; primary?: boolean }) {
  return <a href={prototypeHref(to)} data-prototype-target={to} className={`btn ${primary ? "btn--primary" : "btn--secondary"}`}
    onClick={(event) => { if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); navigate(to); } }}>
    {children}<ArrowRight size={17} aria-hidden="true" />
  </a>;
}

function TextField({ label, value, type = "text", required = false }: { label: string; value?: string; type?: string; required?: boolean }) {
  return <label className="field"><span>{label}</span><input type={type} defaultValue={value} required={required} /></label>;
}

function Stats({ items }: { items: { label: string; value: string; Icon: typeof Users }[] }) {
  return <div className="rex-admin-metrics">{items.map(({ label, value, Icon }) =>
    <div key={label} className="rex-admin-metric"><Icon size={20} aria-hidden="true" /><span>{label}</span><strong>{value}</strong></div>
  )}</div>;
}

function NoteRows({ navigate }: { navigate: Navigate }) {
  return <div className="rex-admin-table-wrap" tabIndex={0} role="region" aria-label="Notas de demonstração">
    <table className="rex-admin-table">
      <thead><tr><th scope="col">Tomador</th><th scope="col">Valor</th><th scope="col">Situação</th><th scope="col">Detalhe</th></tr></thead>
      <tbody>{["R$ 18,42", "R$ 21,33", "R$ 9,81", "R$ 47,25"].map((value, index) =>
        <tr key={value}><td><strong>Marketplace de exemplo</strong><span>Nota {index + 1} · competência 31/10/2026</span></td>
          <td>{value}</td><td><span className="fiscal-status" data-status="authorized">Autorizada</span></td>
          <td><a href={prototypeHref("nota")} data-prototype-target="nota" onClick={(event) => { event.preventDefault(); navigate("nota"); }}>Ver nota</a></td></tr>
      )}</tbody>
    </table>
  </div>;
}

export function Prototype({ initial }: { initial: Screen }) {
  const [screen, setScreen] = useState(initial);
  const [annual, setAnnual] = useState(true);
  const [reviewed, setReviewed] = useState(false);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [quantity, setQuantity] = useState("50");
  const [customer, setCustomer] = useState("conta@exemplo.test");
  const [reason, setReason] = useState("Boas-vindas");
  const [donated, setDonated] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const menu = useRef<HTMLDialogElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const go = useCallback((next: Screen) => {
    menu.current?.close();
    setFeedback(""); setCode(""); setCodeError(false);
    setScreen(next);
    if (next === "revisar") setReviewed(false);
    if (location.pathname + location.search !== prototypeHref(next)) {
      history.pushState(null, "", prototypeHref(next));
    }
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);
  useEffect(() => {
    const onPop = () => {
      const value = new URLSearchParams(location.search).get("tela");
      setScreen(value && Object.hasOwn(screens, value) ? value as Screen : "inicio");
      setFeedback("");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  useEffect(() => {
    if (screen === "revisar") dialog.current?.showModal();
    else if (screen !== initial) heading.current?.focus({ preventScroll: true });
  }, [screen, initial]);

  const next = (to: Screen, label: string, primary = false) => <Go to={to} navigate={go} primary={primary}>{label}</Go>;
  const saved = () => setFeedback("Alteração simulada.");
  const summary = <Stats items={[
    { label: "Notas previstas", value: "32", Icon: FileText },
    { label: "Competência", value: "31/10/2026", Icon: FileSpreadsheet },
    { label: "Total do lote", value: "R$ 784,20", Icon: Ticket },
  ]} />;
  const info = screens[screen];
  let content: ReactNode;
  switch (screen) {
    case "inicio":
      content = <>
        <Stats items={[
          { label: "Empresas cadastradas", value: "1", Icon: Building2 },
          { label: "Operações na fila", value: "0", Icon: History },
          { label: "Notas autorizadas", value: "32", Icon: CircleCheck },
        ]} />
        <section className="rex-surface rex-demo-hero">
          <FileSpreadsheet size={28} aria-hidden="true" /><h2>Pronto para emitir o próximo lote?</h2>
          <p>Selecione o relatório de comissões da Shopee e confira a prévia das notas.</p>{next("importar", "Importar relatório", true)}
        </section>
        <section className="rex-surface"><h2>Último lote</h2><p>Outubro de 2026 · 32 notas autorizadas</p><div className="rex-demo-actions">{next("lote", "Acompanhar lote")}{next("notas", "Ver notas")}</div></section>
      </>; break;
    case "importar":
    case "revisar":
      content = <><section className="rex-surface">
        <div className="rex-demo-upload"><Upload size={27} aria-hidden="true" /><h2>Relatório mensal de comissões</h2>
          <p>Selecione o CSV da Shopee para simular a revisão.</p>
          <label className="field"><span>Arquivo CSV</span><input type="file" accept=".csv,text/csv" onChange={() => go("revisar")} /></label>
          {next("revisar", "Usar relatório de exemplo", true)}</div>
        <div className="rex-demo-actions">{next("historico", "Ver importações salvas")}</div>
      </section>
      {screen === "revisar" && <dialog ref={dialog} className="quick-review-dialog" onCancel={(event) => { event.preventDefault(); go("importar"); }} aria-labelledby="demo-review-heading">
        <div className="quick-review-dialog-header"><div><span className="rex-label">Revisão do lote</span><h2 id="demo-review-heading">Revise e emita seu lote.</h2></div>
          <button className="btn btn--secondary" type="button" aria-label="Fechar revisão" onClick={() => go("importar")} data-prototype-target="importar"><X size={18} /></button>
        </div>
        <div className="quick-review-dialog-body">{summary}<div className="rex-demo-review-info"><strong>Marketplace de exemplo</strong><p>Comissões de afiliado Shopee · Uma nota por linha do relatório</p></div><NoteRows navigate={go} /></div>
        <div className="quick-review-confirm">
          <label className="fiscal-checkbox"><input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} /> Revisei os valores, o tomador e a competência.</label>
          <button type="button" className="btn btn--primary" disabled={!reviewed} onClick={() => go("lote")} data-prototype-target="lote">Confirmar lote de exemplo <ArrowRight size={17} /></button>
        </div>
      </dialog>}</>; break;
    case "lote":
    case "notas":
      content = <>{screen === "lote" && summary}<section className="rex-surface"><h2>{screen === "lote" ? "Notas do lote" : "Emissões recentes"}</h2><NoteRows navigate={go} /></section></>; break;
    case "nota":
      content = <section className="rex-surface"><span className="fiscal-status" data-status="authorized">Autorizada em produção</span><h2>Marketplace de exemplo</h2><p>Competência 31/10/2026 · R$ 18,42</p>
        <div className="rex-demo-actions">{["Baixar XML", "Baixar DANFS-e"].map((label) => <button key={label} className="btn btn--secondary" onClick={() => setFeedback("O download está disponível no painel de uma nota real.")}><ArrowDownToLine size={16} />{label}</button>)}{next("notas", "Voltar às notas")}</div></section>; break;
    case "historico":
    case "relatorio":
      content = <section className="rex-surface"><h2>Comissões de outubro</h2><p>32 linhas · R$ 784,20 · Shopee</p>
        <div className="rex-demo-actions">{screen === "historico" ? next("relatorio", "Abrir relatório", true) : next("revisar", "Ver revisão", true)}{next("importar", "Importar outro relatório")}</div></section>; break;
    case "empresas":
      content = <section className="rex-surface"><h2>Estúdio Exemplo</h2><p>MEI · Empresa de demonstração</p><div className="rex-demo-actions">{next("cadastro", "Abrir cadastro", true)}{next("cadastrar", "Cadastrar empresa")}</div></section>; break;
    case "cadastrar":
    case "cadastro":
    case "servico":
    case "avancado":
    case "perfil":
    case "login": {
      const fields = {
        cadastrar: [["CNPJ", ""]],
        cadastro: [["Razão social", "Estúdio Exemplo"], ["Município", "São Paulo"]],
        servico: [["Descrição do serviço", "Comissões de afiliado Shopee"], ["Regime fiscal", "MEI"]],
        avancado: [["Município de incidência", "São Paulo"], ["Ambiente", "Produção"]],
        perfil: [["Nome de exibição", "Mariana"], ["E-mail", "conta@exemplo.test"]],
        login: [["E-mail de acesso", "conta@exemplo.test"], ["Nova senha", ""]],
      }[screen];
      content = <section className="rex-surface"><form className="rex-demo-form" onSubmit={(event) => { event.preventDefault(); if (screen === "cadastrar") go("cadastro"); else saved(); }}>
        {fields.map(([label, value]) => <TextField key={label} label={label} value={value} type={label === "Nova senha" ? "password" : "text"} />)}
        <div className="rex-demo-actions"><button className="btn btn--primary" data-prototype-target={screen === "cadastrar" ? "cadastro" : undefined}>{screen === "cadastrar" ? "Consultar CNPJ" : "Salvar alterações"}</button>
          {screen === "cadastro" && <>{next("servico", "Serviço")}{next("avancado", "Avançado")}{next("certificado", "Certificado")}</>}
          {screen === "perfil" && <>{next("login", "Login e segurança")}{next("indicacoes", "Indicações")}</>}
        </div>
      </form></section>; break;
    }
    case "certificado":
      content = <section className="rex-surface"><h2>Certificado da empresa</h2><p>A1 protegido · Acesso à SEFIN conferido</p><div className="rex-demo-actions"><button className="btn btn--secondary" onClick={() => setFeedback("Certificado e verificação simulados.")}><ShieldCheck size={16} /> Verificar acesso</button></div></section>; break;
    case "assinatura":
      content = <><section className="rex-surface"><h2>Afiliado Pro</h2><p>32 de 600 notas no mês · 50 créditos de emissão disponíveis</p></section>
        <section className="rex-surface plans-section">
          <div className="split-intro"><h2>Planos</h2><PlanIntervalToggle annual={annual} onChange={setAnnual} /></div>
          <div className="billing-plan-grid">{plans.map(plan => <PlanCard key={plan.code} plan={plan} cadence={annual ? "annual" : "monthly"}
            action={<button className="btn btn--secondary" onClick={() => setFeedback("A contratação abre a Stripe no painel real.")}>Escolher plano</button>} />)}</div>
        </section></>; break;
    case "indicacoes":
      content = <section className="rex-surface"><h2>Seu link de indicação</h2><p>Compartilhe o link com quem também emite notas de afiliado.</p><div className="rex-demo-actions"><button className="btn btn--primary" onClick={() => setFeedback("Link de exemplo copiado.")}>Copiar link de exemplo</button></div></section>; break;
    case "admin":
    case "codigo":
    case "liberado":
      content = <>
        <Stats items={[
          { label: "Contas", value: "12", Icon: Users },
          { label: "Créditos liberados", value: (240 + donated).toLocaleString("pt-BR"), Icon: FileText },
          { label: "Saldo disponível", value: (125 + donated).toLocaleString("pt-BR"), Icon: Ticket },
        ]} />
        <section className="rex-surface">
          {screen === "admin" ? <>
            <h2>Liberar notas gratuitas</h2><p>Selecione a conta e confirme por e-mail.</p>
            <form className="rex-admin-form" onSubmit={(event) => { event.preventDefault(); go("codigo"); }}>
              <label className="field" htmlFor="demo-credit-account"><span>Conta</span><select id="demo-credit-account" aria-label="Conta" value={customer} onChange={(event) => setCustomer(event.target.value)}><option>conta@exemplo.test</option><option>financeiro.estudio-de-demonstracao@exemplo.test</option></select></label>
              <div className="rex-admin-fields">
                <label className="field"><span>Quantidade de notas</span><input type="number" min="1" max="10000" value={quantity} onChange={(event) => setQuantity(event.target.value)} required /></label>
                <label className="field"><span>Motivo</span><input value={reason} onChange={(event) => setReason(event.target.value)} required minLength={3} maxLength={240} /></label>
              </div>
              <div><button className="btn btn--primary" data-prototype-target="codigo">Enviar código por e-mail <ArrowRight size={17} /></button></div>
            </form>
          </> : screen === "codigo" ? <>
            <div className="rex-admin-result"><Mail size={22} aria-hidden="true" /><div><strong>Confira seu e-mail</strong><span>{quantity} créditos para {customer}</span></div></div>
            <form className="rex-admin-form" onSubmit={(event) => { event.preventDefault(); if (code === "123456") { setDonated((total) => total + Number(quantity)); go("liberado"); } else setCodeError(true); }}>
              <label className="field"><span>Código de confirmação</span><input className="rex-code" value={code} onChange={(event) => { setCode(event.target.value); setCodeError(false); }} inputMode="numeric" pattern="[0-9]{6}" maxLength={6} placeholder="000000" required /></label>
              {codeError && <p className="field-error" role="alert">Código incorreto. Digite 123456 para testar.</p>}
              <p className="field-hint">Para testar esta tela, use 123456.</p>
              <div className="rex-demo-actions"><button className="btn btn--primary" data-prototype-target="liberado">Confirmar liberação <KeyRound size={17} /></button>{next("admin", "Voltar")}</div>
            </form>
          </> : <><div className="rex-admin-result"><CircleCheck size={22} aria-hidden="true" /><div><strong>Créditos liberados</strong><span>{quantity} notas para {customer}</span></div></div><div className="rex-demo-actions">{next("admin", "Voltar ao painel", true)}</div></>}
        </section>
        <section className="rex-surface"><h2>Histórico de liberações</h2><div className="rex-admin-table-wrap"><table className="rex-admin-table"><thead><tr><th>Conta</th><th>Liberadas</th><th>Motivo</th></tr></thead><tbody>{donated > 0 && <tr><td>{customer}</td><td>{donated}</td><td>{reason}</td></tr>}<tr><td>cliente@exemplo.test</td><td>100</td><td>Boas-vindas</td></tr></tbody></table></div></section>
      </>; break;
    case "entrar":
    case "criar":
    case "verificar":
      content = <section className="rex-surface rex-demo-access">
        {screen === "verificar" ? <><Mail size={26} aria-hidden="true" /><h2>Link de confirmação</h2><p>Na aplicação, a confirmação chega no e-mail informado no cadastro.</p><div className="rex-demo-actions">{next("entrar", "Ir para o login", true)}</div></> :
          <form className="rex-demo-form" onSubmit={(event) => { event.preventDefault(); go(screen === "criar" ? "verificar" : "inicio"); }}>
            <TextField label="E-mail" value="conta@exemplo.test" type="email" required /><TextField label="Senha de demonstração" value="rex-demo-2026" type="password" required />
            <div className="rex-demo-actions"><button className="btn btn--primary" data-prototype-target={screen === "criar" ? "verificar" : "inicio"}>{screen === "criar" ? "Criar conta" : "Entrar"}</button>{next(screen === "criar" ? "entrar" : "criar", screen === "criar" ? "Já tenho conta" : "Criar conta")}</div>
          </form>}
      </section>; break;
  }

  const demoNavigation = <nav aria-label="Telas do protótipo" className="workspace-navigation workspace-nav-scroll">
        {navigation.map(([id, label, Icon]) => <a key={id} href={prototypeHref(id)} data-prototype-target={id} className={`workspace-nav-link${screen === id ? " is-current" : ""}`} aria-current={screen === id ? "page" : undefined} onClick={(event) => { event.preventDefault(); go(id); }}><Icon size={18} aria-hidden="true" />{label}</a>)}
      </nav>;
  return <div className="workspace-shell workspace-experience rex-demo" data-prototype-screen={screen}>
    <aside className="workspace-sidebar rex-demo-nav">
      <div className="workspace-brand-row"><Brand href="/prototipo" /></div>
      {demoNavigation}
      <div className="rex-demo-nav-footer"><Link className="text-link" href="/">Página inicial <ArrowUpRight size={16} /></Link>{next("entrar", "Acesso")}</div>
    </aside>
    <dialog className="workspace-drawer" ref={menu} aria-label="Menu do protótipo" onClose={() => menuButton.current?.focus()}>
      <div className="workspace-drawer-inner">
        <header className="workspace-brand-row"><Brand href="/prototipo" />
          <button type="button" className="icon-button" aria-label="Fechar menu" onClick={() => menu.current?.close()} autoFocus><X size={21} aria-hidden="true" /></button>
        </header>
        {demoNavigation}
        <div className="rex-demo-nav-footer"><Link className="text-link" href="/">Página inicial <ArrowUpRight size={16} /></Link>{next("entrar", "Acesso")}</div>
      </div>
    </dialog>
    <main id="conteudo" className="dashboard-main">
      <header className="workspace-bar"><div className="workspace-bar-inner rex-demo-top"><button type="button" ref={menuButton} className="icon-button workspace-menu-button" onClick={() => menu.current?.showModal()} aria-haspopup="dialog" aria-label="Menu do protótipo" data-prototype-target="menu"><Menu size={18} /></button>
        <span>Protótipo · dados fictícios</span>
        <label className="rex-demo-select"><span className="sr-only">Ir para tela</span><select value={screen} onChange={(event) => go(event.target.value as Screen)}>
          {[...new Set(Object.values(screens).map(({ group }) => group))].map((group) => <optgroup key={group} label={group}>{(Object.keys(screens) as Screen[]).filter((id) => screens[id].group === group).map((id) => <option key={id} value={id}>{screens[id].title}</option>)}</optgroup>)}
        </select><ChevronDown size={15} aria-hidden="true" /></label>
      </div></header>
      <div className="dashboard-content rex-demo-content rex-admin" key={screen}>
        <header className="page-header"><h1 tabIndex={-1} ref={heading}>{info.title}</h1><p>{info.description}</p></header>
        {feedback && <p className="rex-admin-result" role="status">{feedback}</p>}
        {content}
      </div>
    </main>
  </div>;
}
