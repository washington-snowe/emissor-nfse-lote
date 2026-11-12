import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/tenancy-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validatePersistedReport } from "@/lib/persisted-report";
import { WorkspaceShell } from "@/components/workspace";
import { ReportResults } from "@/components/report-results";
import { QueueRefresh } from "@/components/queue-refresh";
import { retryImport } from "../../actions";
import { prepareReportReview } from "../../review-actions";
import { parseFiscalProfile } from "@/lib/nfse/profile";
import { readReviewSnapshot, reviewCandidates, MAX_FISCAL_REVIEW_ROWS } from "@/lib/nfse/review";
import { ReportReviewForm } from "@/components/report-review-form";
import { SavedReportReview } from "@/components/saved-report-review";

export const metadata: Metadata = { title: "Revisão da importação" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function SavedReport({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { client, context } = await requireWorkspace();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const result = await client.from("report_imports").select("*").eq("id", id).eq("tenant_id", context.tenantId).maybeSingle();
  if (result.error || !result.data) notFound();
  const report = result.data;
  const company = await client.from("companies").select("id,cnpj,legal_name,tax_regime").eq("id", report.company_id).eq("tenant_id", context.tenantId).maybeSingle();
  if (company.error || !company.data) notFound();
  const parsed = report.status === "parsed" ? validatePersistedReport(report.parsed_payload, report.file_sha256) : null;
  const [profile, review] = parsed ? await Promise.all([
    client.from("company_fiscal_profiles").select("id,version,configuration").eq("company_id", company.data.id).eq("tenant_id", context.tenantId).order("version", { ascending: false }).limit(1).maybeSingle(),
    client.from("report_reviews").select("id,profile_id,version,snapshot,snapshot_sha256").eq("import_id", report.id).eq("tenant_id", context.tenantId).order("version", { ascending: false }).limit(1).maybeSingle(),
  ]) : [null, null];
  const configuration = profile?.data ? parseFiscalProfile(profile.data.configuration, company.data.cnpj, company.data.tax_regime) : null;
  const snapshot = review?.data ? readReviewSnapshot(review.data.snapshot, report.id, report.file_sha256) : null;
  const confirmation = review?.data ? await client.from("review_confirmations").select("id").eq("review_id", review.data.id).eq("tenant_id", context.tenantId).maybeSingle() : null;
  return <WorkspaceShell email={context.user.email} active="imports" companyId={company.data.id}><div className="dashboard-content report-page">
    <span className="eyebrow">Importação salva</span><h1>Revise seu relatório.</h1><p>{report.file_name}</p>
    <Link className="text-link" href={`/painel/importacoes/historico?empresa=${company.data.id}`}>Voltar às importações</Link>
    {parsed ? <ReportResults preview={parsed} companyName={company.data.legal_name} /> : <section className="dashboard-welcome">
      <h2>{report.status === "received" ? "Seu relatório está na fila." : "O arquivo precisa de atenção."}</h2>
      <p>{report.status === "received" ? "O original está salvo. O processamento pode continuar mesmo após você fechar esta página." : "Não foi possível reconhecer e validar o relatório inteiro. Confira o arquivo original e envie uma nova exportação; nenhum total parcial foi aprovado."}</p>
    </section>}
    <QueueRefresh waiting={report.status === "received"} retryAction={createAdminClient() ? retryImport.bind(null, id) : undefined} />
    {snapshot && review?.data && <SavedReportReview id={review.data.id} version={review.data.version} sha256={review.data.snapshot_sha256}
      snapshot={snapshot} confirmed={Boolean(confirmation?.data)} current={Boolean(configuration) && profile?.data?.id === review.data.profile_id} />}
    {parsed && <section className="report-back">
      {!configuration ? <><h2>Configure os dados fiscais da empresa.</h2><Link className="btn btn--secondary" href={`/painel/empresas/${company.data.id}/fiscal`}>Abrir configuração fiscal</Link></> :
          !createAdminClient() || review?.error ? <p>A preparação de revisões depende da configuração privada do servidor e da migração de revisões.</p> :
            parsed.review.rows.length > MAX_FISCAL_REVIEW_ROWS ? <p>O relatório permanece salvo. A revisão fiscal desta etapa atende até 500 linhas e não descarta valores automaticamente.</p> :
              <ReportReviewForm candidates={reviewCandidates(parsed, profile?.data?.id === review?.data?.profile_id ? snapshot ?? undefined : undefined)}
                initial={profile?.data?.id === review?.data?.profile_id ? snapshot ?? undefined : undefined}
                version={review?.data?.version ?? 0} action={prepareReportReview.bind(null, report.id)}
                foreignForAll={Boolean(configuration.serviceCountry) || configuration.issTaxation === "3"}
                currency={configuration.foreignTrade?.currency} needsIntermediary={configuration.issWithholding === "3"} />}
    </section>}
  </div></WorkspaceShell>;
}
