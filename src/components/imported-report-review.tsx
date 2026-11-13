import Link from "next/link";
import {after} from "next/server";
import {notFound} from "next/navigation";
import {requireWorkspace} from "@/lib/tenancy-server";
import {createAdminClient} from "@/lib/supabase/admin";
import {validatePersistedReport} from "@/lib/persisted-report";
import {loadQuickReportReview} from "@/lib/quick-report-review";
import {processReportJobs} from "@/lib/report-jobs";
import {ReportResults} from "@/components/report-results";
import {QuickReportReview} from "@/components/quick-report-review";
import {ImportProcessingRefresh} from "@/components/import-processing-refresh";

export async function ImportedReportReview({id}:{id:string}){
  const {client,context}=await requireWorkspace();
  if(!/^[0-9a-f-]{36}$/i.test(id))notFound();
  const result=await client.from("report_imports").select("id,company_id,file_name,file_sha256,parsed_payload,status").eq("id",id).eq("tenant_id",context.tenantId).maybeSingle();
  if(result.error||!result.data)notFound();
  const report=result.data;
  const company=await client.from("companies").select("id,legal_name").eq("id",report.company_id).eq("tenant_id",context.tenantId).maybeSingle();
  if(company.error||!company.data)notFound();
  if(report.status==="received"){
    if(createAdminClient())after(async()=>{try{await processReportJobs(context.tenantId,1);}catch{/* Durable report queue recovery. */}});
    return <section className="dashboard-welcome"><h2>Preparando a revisão do relatório.</h2><p>{report.file_name}</p><ImportProcessingRefresh/></section>;
  }
  const parsed=report.status==="parsed"?validatePersistedReport(report.parsed_payload,report.file_sha256):null;
  if(!parsed)return <section className="dashboard-welcome"><h2>O relatório precisa de atenção.</h2><p>Não foi possível validar o arquivo inteiro. Confira a exportação; nenhum total parcial foi aprovado.</p><Link className="text-link" href={`/painel/importacoes?empresa=${company.data.id}`}>Escolher outro relatório</Link></section>;
  const review=await loadQuickReportReview(id);
  return <><ReportResults preview={parsed} companyName={company.data.legal_name}/>{review?<QuickReportReview key={`${id}:${review.data.digest??"pending"}`} initial={review.data}/>:<section className="dashboard-welcome"><h2>A configuração fiscal precisa de atenção.</h2><p>O relatório está salvo. Conclua os dados fiscais da empresa para preparar as notas.</p><Link className="btn btn--secondary" href={`/painel/empresas/${company.data.id}/fiscal`}>Ver configuração da empresa</Link></section>}</>;
}
