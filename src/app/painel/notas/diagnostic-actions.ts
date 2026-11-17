"use server";
import {requireWorkspace} from '@/lib/tenancy-server';
import {fiscalOperationReport} from '@/lib/nfse/operation-report';
import {createAdminClient} from '@/lib/supabase/admin';
import {needsStoredDpsInspection,storedContractReport,hasStoredCreatedResponse} from '@/lib/nfse/durable-report';
import {inspectStoredDps} from '@/lib/nfse/stored-dps-diagnostic';
export async function getFiscalOperationDiagnostic(id:string):Promise<{error?:string;details?:string;receiptAvailable?:boolean}>{
 const {client,context}=await requireWorkspace();
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))return {error:'Operação indisponível.'};
 const operation=await client.from('fiscal_operations').select('id,status,reason,transmit_count,reconcile_attempts,created_at,updated_at,environment').eq('id',id).eq('tenant_id',context.tenantId).maybeSingle();
 if(operation.error||!operation.data)return {error:'Operação não encontrada no seu espaço.'};
 const events=await client.from('audit_events').select('event,created_at').eq('tenant_id',context.tenantId).eq('resource_id',operation.data.id)
  .in('event',['fiscal.dispatch_started','fiscal.uncertain','fiscal.not_found','fiscal.authorized','fiscal.rejected','fiscal.intervention','fiscal.resume']).order('created_at',{ascending:true}).limit(50);
 if(events.error)return {error:'Não foi possível ler o histórico da operação.'};
 const traces=await client.rpc('fiscal_transport_diagnostic_report',{p_operation:operation.data.id});
 if(traces.error&&!['PGRST202','42883'].includes(traces.error.code))return {error:'Não foi possível ler o diagnóstico técnico da operação.'};
 let details=fiscalOperationReport(operation.data,events.data??[],process.env.VERCEL_GIT_COMMIT_SHA,Array.isArray(traces.data)?traces.data:null);
 if(needsStoredDpsInspection(traces.data)){
  const admin=createAdminClient();
  if(!admin)details+='\nXML original: análise local indisponível.';
  else{
   const snapshot=await admin.rpc('fiscal_xml_snapshot_for_diagnostic',{p_actor:context.user.id,p_operation:operation.data.id});
   if(snapshot.error)details+='\nXML original: '+(['PGRST202','42883'].includes(snapshot.error.code)?'análise local aguardando atualização do banco.':'análise local indisponível.');
   else{
    const dispatch=(events.data??[]).find(event=>event.event==='fiscal.dispatch_started')?.created_at;
    details+='\n'+(await inspectStoredDps(snapshot.data,dispatch)).join('\n');
   }
   const contract=await admin.rpc('fiscal_contract',{p_environment:operation.data.environment==='production'?'production':'homologation'});
   details+='\n'+(contract.error?['Contrato SEFIN atual: leitura indisponível.']:storedContractReport(contract.data)).join('\n');
  }
 }
 return {details,receiptAvailable:operation.data.environment!=='production'&&hasStoredCreatedResponse(traces.data)&&operation.data.transmit_count===1&&['uncertain','intervention','reconciling'].includes(operation.data.status)};
}
