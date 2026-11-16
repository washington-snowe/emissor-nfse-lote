import {fiscalCorrelation} from './transport-observation.ts';
import {fiscalReasonLabels,fiscalStatusLabels} from './status.ts';
export type OperationReportInput={id:string;status:string;reason:string|null;transmit_count:number;reconcile_attempts:number;created_at:string;updated_at:string};
const labels:Record<string,string>={'fiscal.dispatch_started':'início de envio registrado','fiscal.uncertain':'resultado incerto','fiscal.not_found':'DPS não localizada','fiscal.authorized':'autorização registrada','fiscal.rejected':'rejeição registrada','fiscal.intervention':'atenção necessária','fiscal.resume':'consulta retomada'};
function time(value:string){const parsed=Date.parse(value);return Number.isFinite(parsed)?new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'medium',hour12:false}).format(new Date(parsed))+' (São Paulo)':'indisponível';}
export function fiscalOperationReport(operation:OperationReportInput,events:{event:string;created_at:string}[],revision?:string){
 const stamp=revision&&/^[a-f0-9]{7,40}$/i.test(revision)?revision.slice(0,7):'local';
 const safeEvents=events.filter(event=>Object.hasOwn(labels,event.event)&&Number.isFinite(Date.parse(event.created_at))).slice(0,50).sort((a,b)=>Date.parse(a.created_at)-Date.parse(b.created_at));
 const dispatch=safeEvents.find(event=>event.event==='fiscal.dispatch_started');
 const outcome=dispatch?safeEvents.find(event=>['fiscal.uncertain','fiscal.rejected','fiscal.authorized','fiscal.intervention'].includes(event.event)&&Date.parse(event.created_at)>=Date.parse(dispatch.created_at)):undefined;
 const elapsed=dispatch&&outcome?Date.parse(outcome.created_at)-Date.parse(dispatch.created_at):NaN;
 const lines=[`Diagnóstico: nfse-operation-v1 (${stamp})`,`Correlação técnica: ${fiscalCorrelation(operation.id)}`,
 `Estado: ${Object.hasOwn(fiscalStatusLabels,operation.status)?fiscalStatusLabels[operation.status]:'não reconhecido'}`,
 `Motivo atual: ${operation.reason&&Object.hasOwn(fiscalReasonLabels,operation.reason)?fiscalReasonLabels[operation.reason]:'não informado'}`,
 `Inícios de envio registrados: ${operation.transmit_count===1?'1':operation.transmit_count===0?'0':'não reconhecido'}`,
 `Consultas na rodada: ${Number.isInteger(operation.reconcile_attempts)&&operation.reconcile_attempts>=0&&operation.reconcile_attempts<=12?operation.reconcile_attempts:'não reconhecido'}`,
 `Operação criada: ${time(operation.created_at)}`,`Última atualização: ${time(operation.updated_at)}`,
 `Intervalo entre início e primeiro resultado: ${elapsed>=0&&elapsed<=86_400_000?`${Math.round(elapsed/100)/10} s`:'indisponível'}`,
 'Detalhe HTTP do primeiro envio: não armazenado no histórico do banco.',
 'Registros técnicos novos: procurar nfse_transport nos logs da Vercel usando a correlação acima.'];
 for(const event of safeEvents)lines.push(`${time(event.created_at)} · ${labels[event.event]}`);
 lines.push('Este relatório só lê o histórico. Não consulta a SEFIN nem envia notas.');
 return lines.join('\n');
}
