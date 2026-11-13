import Link from "next/link";
import { Check, Clock3, Settings2 } from "lucide-react";
import type { FiscalProfile } from "@/lib/nfse/dps";

export function AutomaticAffiliateSummary({companyId,regime,municipality,initial,reason}: {
  companyId:string;regime:string;municipality:string;reason?:string;
  initial?:{configuration:FiscalProfile;valid_from:string};
}) {
  const ready=Boolean(initial), simples=regime === "simples";
  const message = reason === "simples_data_required" ? "O serviço já está pré-configurado. Falta uma fonte dos dados da apuração do Simples Nacional para concluir a tributação; não preenchemos percentuais por estimativa própria." :
    reason === "company_incomplete" ? "Complete o município no cadastro da empresa. Vamos aproveitar esse dado automaticamente." :
    reason === "profile_changed" ? "A configuração salva precisa ser revista porque o enquadramento da empresa mudou. Seus dados anteriores foram preservados." :
    "Não foi possível concluir a configuração automática agora. Seus dados estão preservados; a emissão aguarda esta etapa.";
  return <section className="mei-setup">
    <div className="mei-setup-heading"><span className="mei-setup-icon" aria-hidden="true">{ready ? <Check size={24}/> : <Clock3 size={24}/>}</span><div><h2>{ready ? `Sua configuração ${simples ? "do Simples" : "MEI"} está salva.` : "Seu serviço já vem preenchido."}</h2><p>{ready ? "Serviço e configurações avançadas serão reutilizados nas próximas notas. Você não precisa preencher parâmetros técnicos." : message}</p></div></div>
    <dl className="mei-setup-summary"><div><dt>Serviço</dt><dd>{initial?.configuration.description ?? "Promoção de vendas como afiliado"}</dd></div><div><dt>Enquadramento</dt><dd>{simples ? "ME / EPP do Simples Nacional" : "MEI"}</dd></div><div><dt>Local padrão da prestação</dt><dd>{municipality || "Município do cadastro da empresa"}</dd></div>{initial && <div><dt>Vigência da configuração</dt><dd>{initial.valid_from.split("-").reverse().join("/")}</dd></div>}</dl>
    {ready ? <Link className="btn btn--primary" href={`/painel/importacoes?empresa=${companyId}`}>Importar notas em lote</Link> : <p className="save-notice" role="status">A emissão ficará disponível após concluir a configuração fiscal. Não há parâmetros técnicos para digitar nesta tela.</p>}
    {reason === "company_incomplete" && <Link className="btn btn--secondary" href={`/painel/empresas/${companyId}`}>Completar cadastro da empresa</Link>}
    <div className="mei-setup-footer"><Link className="text-link" href={`/painel/empresas/${companyId}/fiscal?modo=completo`}><Settings2 size={16} aria-hidden="true"/> Personalizar serviço e configurações</Link><p className="field-hint">O padrão é promoção de vendas no estabelecimento, no Brasil. Se a sua operação for diferente, personalize antes de emitir. A configuração não comprova homologação nem envia notas.</p></div>
  </section>;
}
