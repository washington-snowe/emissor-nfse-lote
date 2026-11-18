"use client";
import Link from "next/link";
import {useCallback,useEffect,useRef,useState,useTransition} from "react";
import {useRouter} from "next/navigation";
import {X} from "lucide-react";
import {ReportReviewForm} from "@/components/report-review-form";
import {refreshQuickReview,confirmAndQueueQuickReview,adjustQuickReviewValidity} from "@/app/painel/importacoes/quick-actions";
import type {QuickReviewData} from "@/lib/nfse/quick-review";
import {ProductionAccessCheck} from '@/components/production-access-check';

const brl=(value:string)=>`R$ ${value.replace(/\.(\d{2})$/,",$1").replace(/\B(?=(\d{3})+(?!\d))/g,".")}`;
export function QuickReportReview({initial,companyName,fileName}: {initial:QuickReviewData;companyName?:string;fileName?:string}){
  const [data,setData]=useState(initial),[reviewed,setReviewed]=useState(false),[dirty,setDirty]=useState(false),[error,setError]=useState("");
  const [refreshing,setRefreshing]=useState(false),[refreshError,setRefreshError]=useState("");
  const [adjusting,setAdjusting]=useState(false),[validityNotice,setValidityNotice]=useState("");
  const editForm=useRef<HTMLFormElement>(null),editPanel=useRef<HTMLDetailsElement>(null),editing=useRef(false);
  const productionSection=useRef<HTMLDivElement>(null),validitySection=useRef<HTMLElement>(null);
  const dialog=useRef<HTMLDialogElement>(null),launcher=useRef<HTMLButtonElement>(null),title=useRef<HTMLHeadingElement>(null),bodyOverflow=useRef<string|null>(null);
  const [pending,start]=useTransition(),request=useRef<string|null>(null),router=useRouter();
  const openReview=useCallback(()=>{
    if(!dialog.current)return;
    if(bodyOverflow.current===null)bodyOverflow.current=document.body.style.overflow;
    if(!dialog.current.open)dialog.current.showModal();
    document.body.style.overflow="hidden";title.current?.focus();
  },[]);
  useEffect(()=>{openReview();return()=>{if(bodyOverflow.current!==null){document.body.style.overflow=bodyOverflow.current;bodyOverflow.current=null;}};},[openReview]);
  const p=data.preview;
  const environment=data.environment??'homologation',production=environment==='production',environmentLabel=production?'produção':'homologação';
  const refreshProduction=useCallback(async()=>{
    if(editing.current){setReviewed(false);setRefreshError('Acesso à produção conferido. Atualize a prévia para preservar e revisar suas alterações.');return;}
    setReviewed(false);request.current=null;setRefreshing(true);setRefreshError("");
    try{const next=await refreshQuickReview(data.importId,JSON.stringify(data.input));if(next.data)setData(next.data);else setRefreshError(next.error??'Atualize a prévia para conferir o acesso à produção.');}
    finally{setRefreshing(false);}
  },[data.importId,data.input]);
  const productionPending=production&&!data.production?.ready;
  const blocker=dirty?"Os dados foram alterados. Atualize a prévia e revise o resumo novamente.":data.error??(productionPending?"O acesso à produção ainda precisa ser confirmado. Confira a verificação para continuar.":!data.digest?"A prévia ainda não está pronta para emissão. Confira os dados para continuar.":undefined);
  const openChanges=()=>{if(editPanel.current)editPanel.current.open=true;};
  const remedyLabel=!dirty&&productionPending?'Ver pendência de produção':!dirty&&data.validityAdjustment?'Ver ajuste de vigência':'Conferir prévia';
  const resolvePending=()=>{
    const target=!dirty&&productionPending?productionSection.current:!dirty&&data.validityAdjustment?validitySection.current:null;
    if(target){target.scrollIntoView({block:'start'});target.focus({preventScroll:true});return;}
    openChanges();editForm.current?.requestSubmit();
  };
  async function adjustValidity(){
    const proposed=data.validityAdjustment;if(!proposed||dirty||adjusting||refreshing||pending)return;
    setAdjusting(true);setReviewed(false);setRefreshError("");setValidityNotice("");request.current=null;
    const form=new FormData();form.set("sameConfiguration","on");form.set("input",JSON.stringify(data.input));form.set("previewDigest",proposed.previewDigest);
    try{const result=await adjustQuickReviewValidity(data.importId,form);if(result.data){setData(result.data);setDirty(false);setValidityNotice("Vigência conferida. A competência e os parâmetros das notas foram mantidos. Revise o resumo atualizado antes de confirmar.");}else setRefreshError(result.error??"Não foi possível ajustar a vigência.");}
    catch{setRefreshError("Não foi possível confirmar o ajuste. Você pode repetir esta mesma solicitação sem alterar a competência das notas.");}
    finally{setAdjusting(false);setReviewed(false);}
  }
  return <section className="quick-review report-back" aria-labelledby="quick-review-launch-title">
    <div className="quick-review-launch"><div><span className="eyebrow">Relatório salvo</span><h2 id="quick-review-launch-title">Seu lote está pronto para revisão.</h2>{companyName&&<p><strong>{companyName}</strong></p>}{fileName&&<p className="field-hint">{fileName}</p>}{p&&<p>{p.groups.length} notas previstas · {brl(p.total)}</p>}</div><button ref={launcher} className="btn btn--primary" type="button" onClick={openReview}>Revisar notas</button></div>
    <dialog ref={dialog} className="quick-review-dialog" aria-labelledby="quick-review-title" aria-describedby="quick-review-description" onCancel={event=>{if(pending||refreshing||adjusting)event.preventDefault();}} onClose={()=>{
      if(bodyOverflow.current!==null){document.body.style.overflow=bodyOverflow.current;bodyOverflow.current=null;}setReviewed(false);launcher.current?.focus();
    }}>
    <header className="quick-review-dialog-header"><div><span className="eyebrow">Revisão do lote · {environmentLabel}</span><h2 id="quick-review-title" ref={title} tabIndex={-1}>Revise e emita seu lote.</h2></div><button className="quick-review-close" type="button" aria-label="Fechar revisão" disabled={pending||refreshing||adjusting} onClick={()=>dialog.current?.close()}><X size={22} aria-hidden="true"/></button></header>
    <div className="quick-review-dialog-body" tabIndex={0} role="region" aria-label="Dados e notas para revisão">
    <p id="quick-review-description">Confira as notas abaixo. Os dados de afiliado já vêm preenchidos; altere somente o que precisar.</p>
    {productionPending&&<div ref={productionSection} tabIndex={-1}><ProductionAccessCheck companyId={data.companyId} onVerified={refreshProduction}/></div>}
    {p&&<><dl className="report-totals"><div><dt>Notas previstas</dt><dd>{p.groups.length}</dd></div><div><dt>Competência sugerida</dt><dd>{p.competenceDate.split("-").reverse().join("/")}</dd></div><div><dt>Total das notas</dt><dd>{brl(p.total)}</dd></div></dl>
      <div className="quick-review-context"><p><strong>{p.recipientChoice==="single_recipient"?p.groups[0].recipient.legalName:"Vendedores revisados do relatório"}</strong>{p.recipientChoice==="single_recipient"&&<span className="report-cell-note mono">{p.groups[0].recipient.document}</span>}</p><p>{p.commissionType}<br/>{p.grouping==="per_row"?"Uma nota por linha do relatório":"Consolidação de dados idênticos do mesmo tomador"}</p></div>
      <p className="field-hint">A competência inicial é uma sugestão baseada no mês do relatório. Confira a data efetiva da prestação antes de confirmar.</p>
      {data.emailDelivery&&<p className="field-hint">{data.emailDelivery.enabled?(production?'O XML e o DANFS-e serão enviados a cada endereço de vendedor exibido abaixo.':"Entrega por e-mail preparada. Na homologação, somente o endereço de teste configurado receberá os documentos; os vendedores não receberão notas de teste."):"Envio de e-mails aguardando configuração do domínio e dos provedores. Os destinos previstos aparecem em cada nota."}</p>}
      <div className="report-table-scroll" role="region" aria-label="Notas do lote para revisão" tabIndex={0}><table className="report-table"><thead><tr><th>Origem · linha</th><th>Tomador</th><th>Valor da nota</th></tr></thead><tbody>{p.groups.map((g,i)=><tr key={i}><td className="mono">{g.sourceRows.join(", ")}</td><td><strong>{g.recipient.legalName}</strong><span className="report-cell-note mono">{g.recipient.document} · {g.recipient.country}</span>{data.emailDelivery?.routes[i]&&<span className="report-cell-note">Envio ao vendedor: {data.emailDelivery.routes[i].email??(data.emailDelivery.routes[i].reason==="ambiguous_recipient"?"agrupamento com destinos diferentes; revisar":"e-mail ausente ou inválido")}</span>}</td><td className="report-money mono">{brl(g.amount)}</td></tr>)}</tbody></table></div>
    </>}
    <details ref={editPanel} className="quick-review-edit" inert={pending||adjusting}><summary>Alterar dados</summary><ReportReviewForm formRef={editForm} key={JSON.stringify(data.input)} candidates={data.candidates} initial={p} defaults={data.input} version={data.version} foreignForAll={data.foreignForAll} currency={data.currency} needsIntermediary={data.needsIntermediary} previewOnly
      onEdit={()=>{editing.current=true;setReviewed(false);setDirty(true);setError("");setRefreshError("");request.current=null;}}
      onPreviewStart={()=>{setRefreshing(true);setRefreshError("");setError("");setDirty(true);setReviewed(false);request.current=null;}}
      action={async(_previous,form)=>{
        try{const result=await refreshQuickReview(data.importId,String(form.get("review")));if(result.data){setData(result.data);setDirty(false);editing.current=false;return result.data.error?{error:result.data.error}:{success:"Prévia atualizada. Confira os dados e confirme no resumo."};}
          const message=result.error??"Não foi possível atualizar a prévia.";setRefreshError(message);return {error:message};
        }catch{const message="Não foi possível atualizar a prévia. Confira sua conexão e tente novamente.";setRefreshError(message);return {error:message};}
        finally{setRefreshing(false);setReviewed(false);}
      }}/>
    </details>
    {data.validityAdjustment&&<section ref={validitySection} tabIndex={-1} className="save-notice quick-review-validity" aria-labelledby="validity-adjustment-title"><h3 id="validity-adjustment-title">A competência está certa? Ajuste a vigência do serviço.</h3><p>O perfil começa em {data.validityAdjustment.currentFrom.split("-").reverse().join("/")}. Se estes mesmos parâmetros já valiam em {data.validityAdjustment.targetFrom.split("-").reverse().join("/")}, aplique o perfil desde essa data.</p><p className="field-hint">Este ajuste cria uma nova versão do perfil e mantém os parâmetros atuais.</p><button className="btn btn--secondary" type="button" disabled={pending||refreshing||adjusting||dirty} onClick={()=>void adjustValidity()}>{adjusting?"Ajustando a vigência…":`Os mesmos parâmetros já valiam em ${data.validityAdjustment.targetFrom.split("-").reverse().join("/")} · Ajustar vigência`}</button></section>}
    {validityNotice&&<p className="save-notice" role="status">{validityNotice}</p>}
    {!data.transmissionEnabled&&<p className="field-hint">A transmissão em {environmentLabel} está desativada no servidor. Você pode marcar a revisão e preparar o lote; o envio ficará aguardando a liberação.</p>}
    {data.issues?.length?<div className="save-notice"><p>Confira estes dados em Alterar dados:</p><ul>{data.issues.slice(0,15).map((issue,i)=><li key={i}>{issue.row?`Linha ${issue.row}: `:""}{issue.code==="unsupported_amount"?"valor ou moeda incompatível; confira o original.":issue.code==="duplicate_source"?"origem repetida no relatório.":"confira os dados em Alterar dados."}</li>)}</ul></div>:null}
    <Link className="text-link" href={`/painel/notas?empresa=${data.companyId}`}>Consultar notas já preparadas</Link>
    </div>
    <form className="quick-review-confirm" onSubmit={event=>{event.preventDefault();if(!reviewed||!data.digest||dirty||refreshing||adjusting)return;
      const form=new FormData();form.set('environment',environment);form.set("reviewed","on");if(data.emailDelivery?.enabled)form.set("emailReviewed","on");form.set("input",JSON.stringify(data.input));form.set("digest",data.digest);form.set("version",String(data.version));form.set("request",request.current??=crypto.randomUUID());
      start(async()=>{setError("");try{const result=await confirmAndQueueQuickReview(data.importId,form);if(result.id)router.push(`/painel/notas/lotes/${result.id}`);else setError(result.error??"Não foi possível confirmar o lote.");}catch{setError("Não foi possível confirmar o resultado. Repita esta mesma solicitação; o lote não será duplicado.");}});
    }}><div id="quick-review-hint" className="quick-review-feedback" aria-live="polite">{refreshing||adjusting?<p className="field-hint" role="status">Conferindo a prévia. Aguarde para marcar a revisão do resumo atualizado…</p>:blocker||refreshError?<><p className={refreshError?"form-error":"field-hint"} role={refreshError?"alert":"status"}>{refreshError||<><strong>Antes de emitir:</strong> {blocker}</>}</p><button className="text-link quick-review-remedy" type="button" disabled={pending} onClick={resolvePending}>{remedyLabel}</button></>:!reviewed?<p className="field-hint">Marque que revisou o resumo para preparar este lote.</p>:null}</div>
      <label className="fiscal-checkbox"><input name="reviewed" type="checkbox" required aria-describedby="quick-review-hint" checked={reviewed} disabled={pending||refreshing||adjusting} onChange={e=>setReviewed(e.target.checked)}/> Revisei os valores, o tomador, a competência e o agrupamento das notas e autorizo {production?'a emissão real deste lote em produção':`o envio deste lote em ${environmentLabel}`}.{data.emailDelivery?.enabled?(production?' Também autorizo o envio do XML e do DANFS-e aos vendedores nos endereços exibidos.':" Também autorizo a entrega dos documentos no endereço de teste configurado."):""}</label>
      <button className="btn btn--primary" type="submit" aria-describedby="quick-review-hint" disabled={pending||refreshing||adjusting||!reviewed||!data.digest||dirty}>{pending?"Confirmando e preparando o lote…":`Revisei, confirmar e emitir em ${environmentLabel}`}</button>
      {error&&<p className="form-error" role="alert">{error}</p>}
    </form>
    </dialog>
  </section>;
}
