"use client";
import Link from "next/link";
import {useRef,useState,useTransition} from "react";
import {useRouter} from "next/navigation";
import {ReportReviewForm} from "@/components/report-review-form";
import {refreshQuickReview,confirmAndQueueQuickReview} from "@/app/painel/importacoes/quick-actions";
import type {QuickReviewData} from "@/lib/nfse/quick-review";

const brl=(value:string)=>`R$ ${value.replace(/\.(\d{2})$/,",$1").replace(/\B(?=(\d{3})+(?!\d))/g,".")}`;
export function QuickReportReview({initial}: {initial:QuickReviewData}){
  const [data,setData]=useState(initial),[reviewed,setReviewed]=useState(false),[dirty,setDirty]=useState(false),[error,setError]=useState("");
  const [pending,start]=useTransition(),request=useRef<string|null>(null),router=useRouter();
  const p=data.preview;
  return <section className="quick-review report-back" aria-labelledby="quick-review-title">
    <span className="eyebrow">Revisão do lote · homologação</span><h2 id="quick-review-title">Revise e emita seu lote.</h2>
    <p>Os dados de afiliado já vêm preenchidos. Confira o resumo e confirme a revisão para colocar as notas na fila.</p>
    {p&&<><dl className="report-totals"><div><dt>Notas previstas</dt><dd>{p.groups.length}</dd></div><div><dt>Competência sugerida</dt><dd>{p.competenceDate.split("-").reverse().join("/")}</dd></div><div><dt>Total das notas</dt><dd>{brl(p.total)}</dd></div></dl>
      <div className="quick-review-context"><p><strong>{p.recipientChoice==="single_recipient"?p.groups[0].recipient.legalName:"Vendedores revisados do relatório"}</strong>{p.recipientChoice==="single_recipient"&&<span className="report-cell-note mono">{p.groups[0].recipient.document}</span>}</p><p>{p.commissionType}<br/>{p.grouping==="per_row"?"Uma nota por linha do relatório":"Consolidação de dados idênticos do mesmo tomador"}</p></div>
      <p className="field-hint">A competência inicial é uma sugestão baseada no mês do relatório. Confira a data efetiva da prestação antes de confirmar.</p>
      <div className="report-table-scroll" role="region" aria-label="Notas do lote para revisão" tabIndex={0}><table className="report-table"><thead><tr><th>Origem · linha</th><th>Tomador</th><th>Valor da nota</th></tr></thead><tbody>{p.groups.map((g,i)=><tr key={i}><td className="mono">{g.sourceRows.join(", ")}</td><td><strong>{g.recipient.legalName}</strong><span className="report-cell-note mono">{g.recipient.document} · {g.recipient.country}</span></td><td className="report-money mono">{brl(g.amount)}</td></tr>)}</tbody></table></div>
    </>}
    {data.error&&<div className="save-notice" role="status"><p>{data.error}</p>{data.issues?.length?<ul>{data.issues.slice(0,15).map((issue,i)=><li key={i}>{issue.row?`Linha ${issue.row}: `:""}{issue.code==="unsupported_amount"?"valor ou moeda incompatível; confira o original.":issue.code==="duplicate_source"?"origem repetida no relatório.":"confira os dados em Alterar dados."}</li>)}</ul>:null}</div>}
    <details className="quick-review-edit" inert={pending}><summary>Alterar dados</summary><ReportReviewForm key={JSON.stringify(data.input)} candidates={data.candidates} initial={p} defaults={data.input} version={data.version} foreignForAll={data.foreignForAll} currency={data.currency} needsIntermediary={data.needsIntermediary} previewOnly
      onEdit={()=>{setReviewed(false);setDirty(true);request.current=null;}}
      action={async(_previous,form)=>{setDirty(true);setReviewed(false);request.current=null;const result=await refreshQuickReview(data.importId,String(form.get("review")));if(result.data){setData(result.data);setDirty(false);return result.data.error?{error:result.data.error}:{success:"Prévia atualizada. Confira os dados e confirme no resumo."};}return {error:result.error};}}/>
    </details>
    {dirty&&<p className="save-notice" role="status">Atualize a prévia para incluir suas alterações antes de confirmar.</p>}
    {!data.transmissionEnabled&&<p className="field-hint">A transmissão em homologação está desativada no servidor. O lote pode ser preparado e ficará aguardando a liberação do envio.</p>}
    <form className="quick-review-confirm" onSubmit={event=>{event.preventDefault();if(!reviewed||!data.digest||dirty)return;
      const form=new FormData();form.set("reviewed","on");form.set("input",JSON.stringify(data.input));form.set("digest",data.digest);form.set("version",String(data.version));form.set("request",request.current??=crypto.randomUUID());
      start(async()=>{setError("");try{const result=await confirmAndQueueQuickReview(data.importId,form);if(result.id)router.push(`/painel/notas/lotes/${result.id}`);else setError(result.error??"Não foi possível confirmar o lote.");}catch{setError("Não foi possível confirmar o resultado. Repita esta mesma solicitação; o lote não será duplicado.");}});
    }}><label className="fiscal-checkbox"><input name="reviewed" type="checkbox" required checked={reviewed} disabled={pending||!data.digest||dirty} onChange={e=>setReviewed(e.target.checked)}/> Revisei os valores, o tomador, a competência e o agrupamento das notas e autorizo o envio deste lote em homologação.</label>
      <button className="btn btn--primary" type="submit" disabled={pending||!reviewed||!data.digest||dirty}>{pending?"Confirmando e preparando o lote…":"Confirmar e emitir em homologação"}</button>
      {error&&<p className="form-error" role="alert">{error}</p>}
    </form>
    <Link className="text-link" href={`/painel/notas?empresa=${data.companyId}`}>Consultar notas já preparadas</Link>
  </section>;
}
