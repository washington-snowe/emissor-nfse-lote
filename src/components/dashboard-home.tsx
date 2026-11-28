import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, FileText } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/page-header";
import { money } from "@/lib/billing/catalog";
import { operationStatus, formatFiscalBrl } from "@/lib/nfse/status";
import { overviewSampleSize, overviewSummary, type OverviewNote } from "@/lib/dashboard-overview";

export function DashboardHome({ companyName, importHref, hasCompany = true, children }: {
  companyName?: string; importHref: string; hasCompany?: boolean; children: ReactNode;
}) {
  return <div className="dashboard-content overview-page">
    <PageHeader title="Início" description={companyName ?? "Cadastre sua empresa para emitir suas primeiras notas."}
      actions={<Link className="btn btn--primary" prefetch={false} href={importHref}>
        {hasCompany ? "Importar relatório" : "Cadastrar empresa"} <ArrowRight size={16} aria-hidden="true" />
      </Link>} />
    {children}
  </div>;
}

export function DashboardOverview({ totals, notes, month, notesHref, totalsUnavailable = false, notesUnavailable = false }: {
  totals: Record<string, number>; notes: OverviewNote[]; month: string; notesHref: string;
  totalsUnavailable?: boolean; notesUnavailable?: boolean;
}) {
  const summary = overviewSummary(totals, notes, month);
  const maxCents = summary.months.reduce((max, item) => item.cents > max ? item.cents : max, 1n);
  return <div className="overview-dashboard">
    {totalsUnavailable ? <p className="save-notice" role="status">O resumo está temporariamente indisponível. Atualize a página para tentar novamente.</p> :
      <dl className="overview-metrics" aria-label="Situação das notas da empresa">
        {summary.groups.slice(0, 3).map(group => <div key={group.label}>
          <dt><span className="overview-dot" data-tone={group.tone} /><span>{group.label}</span></dt>
          <dd>{group.value.toLocaleString("pt-BR")}</dd>
          <span className="overview-metric-help">Todos os ambientes</span>
        </div>)}
      </dl>}
    <div className="overview-charts">
      <section className="overview-chart" aria-labelledby="overview-values-title">
        <header><div><h2 id="overview-values-title">Valor por competência</h2><p>Produção · autorizações entre as últimas {overviewSampleSize} emissões</p></div>
          {!notesUnavailable && <strong className="overview-chart-total">{money(summary.recentCents)}</strong>}
        </header>
        {notesUnavailable ? <p className="overview-empty-chart">Não foi possível carregar os valores. Tente novamente em instantes.</p> :
          <><div className="overview-bars" role="img" aria-label={summary.months.map(item => `${item.key}: ${money(item.cents)}, ${item.count} notas`).join(". ")}>
            {summary.months.map(item => <div className="overview-bar-column" key={item.key} title={`${item.key} · ${money(item.cents)}`} aria-hidden="true">
              <span className="overview-bar-value">{money(item.cents).replace("R$ ", "")}</span>
              <div className="overview-bar-track"><span className="overview-bar" style={{ height: `${Number(item.cents * 10000n / maxCents) / 100}%` }} /></div>
              <span className="overview-bar-month">{item.label}</span>
            </div>)}
          </div><p className="overview-chart-caption">Últimos seis meses. Valores de notas autorizadas em produção, conforme a competência.</p></>}
      </section>
      <section className="overview-chart" aria-labelledby="overview-status-title">
        <header><div><h2 id="overview-status-title">Situação das emissões</h2><p>Histórico completo · todos os ambientes</p></div></header>
        {totalsUnavailable ? <p className="overview-empty-chart">O resumo está temporariamente indisponível.</p> :
          <><div className="overview-distribution" role="img" aria-label={summary.groups.map(group => `${group.label}: ${group.value}`).join(". ")}>
            {summary.groups.filter(group => group.value > 0).map(group => <span key={group.label} data-tone={group.tone} style={{ flexGrow: group.value }} />)}
          </div>
          <dl className="overview-status-list">{summary.groups.map(group => <div key={group.label}>
            <dt><span className="overview-dot" data-tone={group.tone} /><span>{group.label}</span></dt><dd>{group.value.toLocaleString("pt-BR")}</dd>
          </div>)}</dl>
          <p className="overview-chart-caption">{summary.total.toLocaleString("pt-BR")} {summary.total === 1 ? "emissão" : "emissões"} no total</p></>}
      </section>
    </div>
    <section className="overview-recent" aria-labelledby="overview-recent-title">
      <div className="overview-recent-heading"><h2 id="overview-recent-title">Notas recentes</h2>
        <Link className="text-link" href={notesHref} prefetch={false}>Ver todas <ArrowRight size={15} aria-hidden="true" /></Link>
      </div>
      {notesUnavailable ? <p className="save-notice" role="status">As notas recentes estão temporariamente indisponíveis.</p> : notes.length ?
        <div className="overview-table-scroll" role="region" aria-label="Notas recentes" tabIndex={0}>
          <table className="overview-table">
            <thead><tr><th scope="col">Tomador</th><th scope="col">Competência</th><th scope="col">Situação</th><th scope="col">Valor</th></tr></thead>
            <tbody>{notes.slice(0, 5).map(note => <tr key={note.id}>
              <th scope="row">{note.recipient.legalName}</th>
              <td>{note.competence_date.split("-").reverse().join("/")}</td>
              <td><span className="fiscal-status" data-status={note.status}>{operationStatus(note)}</span></td>
              <td>{formatFiscalBrl(note.amount)}</td>
            </tr>)}</tbody>
          </table>
        </div> : <EmptyState icon={<FileText size={22} aria-hidden="true" />} title="Sua primeira emissão começa aqui">
          Importe o relatório da Shopee para preparar as notas. As emissões aparecerão neste histórico.
        </EmptyState>}
    </section>
  </div>;
}
