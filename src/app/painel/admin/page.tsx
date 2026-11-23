import { FileCheck2, History, Search, Ticket, Users } from "lucide-react";
import { WorkspaceShell } from "@/components/workspace";
import { requireRexAdmin } from "@/lib/admin-credits";
import { ReleaseCreditForm, type CreditAccount } from "./release-form";

export const dynamic = "force-dynamic";

type CreditGrant = { id: string; email: string; quantity: number; remaining: number; reason: string; created_at: string };
type Dashboard = { accounts: CreditAccount[]; grants: CreditGrant[]; accounts_total: number; granted: number; available: number };
const number = new Intl.NumberFormat("pt-BR");
const date = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ conta?: string | string[] }> }) {
  const { admin, actor } = await requireRexAdmin();
  const { conta } = await searchParams;
  const query = typeof conta === "string" ? conta.trim().slice(0, 254) : "";
  const { data, error } = await admin.rpc("rex_admin_dashboard", { p_actor: actor, p_search: query });
  const dashboard = error ? null : data as Dashboard | null;

  return <WorkspaceShell active="admin">
    <div className="dashboard-content rex-admin">
      <header className="rex-page-intro">
        <p className="rex-label">Administração</p>
        <h1>Créditos de emissão</h1>
        <p>Libere notas gratuitas, consulte saldos e acompanhe o histórico de cada liberação.</p>
      </header>
      {!dashboard ? <p className="field-error" role="alert">O painel não pôde carregar. Atualize a página para tentar de novo.</p> : <>
        <div className="rex-admin-metrics" aria-label="Resumo dos créditos">
          {[
            { label: "Contas", value: dashboard.accounts_total, Icon: Users },
            { label: "Créditos liberados", value: dashboard.granted, Icon: FileCheck2 },
            { label: "Saldo disponível", value: dashboard.available, Icon: Ticket },
          ].map(({ label, value, Icon }) => (
            <div className="rex-admin-metric" key={label}>
              <Icon size={20} aria-hidden="true" /><span>{label}</span><strong>{number.format(value)}</strong>
            </div>
          ))}
        </div>
        <section className="rex-surface rex-admin-release" id="liberar-creditos" aria-labelledby="credit-heading">
          <h2 id="credit-heading">Liberar notas gratuitas</h2>
          <p>Busque a conta pelo e-mail. A liberação exige um código enviado ao seu e-mail de administrador.</p>
          <form className="rex-account-search" action="/painel/admin">
            <label className="field"><span>Buscar conta por e-mail</span><input name="conta" defaultValue={query} type="search" maxLength={254} placeholder="E-mail da conta" /></label>
            <button className="btn btn--secondary" type="submit"><Search size={16} aria-hidden="true" /> Buscar</button>
          </form>
          {dashboard.accounts.length ? <p className="field-help">{dashboard.accounts.length === 25 ? "Exibindo até 25 contas. Use a busca para localizar outra." : `${number.format(dashboard.accounts.length)} conta(s) encontrada(s).`}</p>
            : <p className="field-help" role="status">Nenhuma conta confirmada encontrada.</p>}
          <ReleaseCreditForm key={query} accounts={dashboard.accounts} />
          <p className="field-help">Os créditos cobrem notas autorizadas em produção que ficariam fora da franquia do plano.</p>
        </section>
        <section className="rex-surface rex-admin-history" aria-labelledby="credit-history">
          <h2 id="credit-history"><History size={21} aria-hidden="true" /> Histórico de liberações</h2>
          {dashboard.grants.length ? <div className="rex-admin-table-wrap" tabIndex={0} role="region" aria-label="Liberações recentes">
            <table className="rex-admin-table">
              <thead><tr><th scope="col">Conta e motivo</th><th scope="col">Liberadas</th><th scope="col">Disponíveis</th><th scope="col">Data</th></tr></thead>
              <tbody>{dashboard.grants.map((grant) => <tr key={grant.id}>
                <td><strong>{grant.email}</strong><span>{grant.reason}</span></td>
                <td>{number.format(grant.quantity)}</td><td>{number.format(grant.remaining)}</td>
                <td><time dateTime={grant.created_at}>{date.format(new Date(grant.created_at))}</time></td>
              </tr>)}</tbody>
            </table>
          </div> : <p>As liberações confirmadas aparecem aqui.</p>}
        </section>
      </>}
    </div>
  </WorkspaceShell>;
}
