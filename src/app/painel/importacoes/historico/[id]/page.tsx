import type {Metadata} from "next";
import Link from "next/link";
import {notFound} from "next/navigation";
import {requireWorkspace} from "@/lib/tenancy-server";
import {WorkspaceShell} from "@/components/workspace";
import {ImportedReportReview} from "@/components/imported-report-review";
export const metadata:Metadata={title:"Revisão da importação"};
export const dynamic="force-dynamic";
export const maxDuration=60;
export default async function SavedReport({params}:{params:Promise<{id:string}>}){
  const {id}=await params,{client,context}=await requireWorkspace();
  if(!/^[0-9a-f-]{36}$/i.test(id))notFound();
  const report=await client.from("report_imports").select("company_id,file_name").eq("id",id).eq("tenant_id",context.tenantId).maybeSingle();
  if(report.error||!report.data)notFound();
  return <WorkspaceShell email={context.user.email} active="imports" companyId={report.data.company_id}><div className="dashboard-content report-page">
    <span className="eyebrow">Importação salva</span><h1>Revise seu relatório.</h1><p>{report.data.file_name}</p>
    <Link className="text-link" href={`/painel/importacoes/historico?empresa=${report.data.company_id}`}>Voltar às importações</Link>
    <ImportedReportReview id={id}/>
  </div></WorkspaceShell>;
}
