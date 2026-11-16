"use server";
import {requireWorkspace} from '@/lib/tenancy-server';
import {createAdminClient} from '@/lib/supabase/admin';
import {loadCertificateMaterial} from '@/lib/certificate-material';
import {nfseGet} from '@/lib/nfse/http';
import {diagnoseIssuedNfse} from '@/lib/nfse/issued-diagnostic';
import {hasStoredCreatedResponse} from '@/lib/nfse/durable-report';

export async function getFiscalReceiptDiagnostic(id:string):Promise<{error?:string;details?:string;verified?:boolean}>{
 const {client,context}=await requireWorkspace();
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))return {error:'Operação indisponível.'};
 const operation=await client.from('fiscal_operations').select('id,company_id,issuer_cnpj,environment,dps_id,status,transmit_count').eq('id',id).eq('tenant_id',context.tenantId).maybeSingle();
 const own=operation.data;
 if(operation.error||!own||own.environment!=='homologation'||own.transmit_count!==1||!['uncertain','intervention'].includes(own.status)||typeof own.dps_id!=='string'||!/^DPS\d{42}$/.test(own.dps_id))return {error:'Esta operação não está disponível para conferência do retorno.'};
 const traces=await client.rpc('fiscal_transport_diagnostic_report',{p_operation:own.id});
 if(traces.error||!hasStoredCreatedResponse(traces.data))return {error:'A operação não possui retorno HTTP 201 registrado para esta conferência.'};
 const admin=createAdminClient();
 if(!admin)return {error:'Conferência protegida indisponível.'};
 const snapshot=await admin.rpc('fiscal_xml_snapshot_for_diagnostic',{p_actor:context.user.id,p_operation:own.id});
 if(snapshot.error||!snapshot.data)return {error:'O XML original não está disponível ou o limite de conferências foi atingido. Tente novamente mais tarde.'};
 const contract=await admin.rpc('fiscal_contract',{p_environment:'homologation'});
 if(contract.error)return {error:'Não foi possível ler o contrato oficial da SEFIN.'};
 const deadline=Date.now()+35000;
 return diagnoseIssuedNfse({operationId:own.id,dpsId:own.dps_id,issuerCnpj:own.issuer_cnpj,snapshot:snapshot.data},{contract:contract.data,
  load:async()=>{
   const certificate=await admin.rpc('fiscal_processing_certificate',{p_operation:own.id});
   if(certificate.error||typeof certificate.data!=='string')throw new Error('Protected certificate unavailable');
   return loadCertificateMaterial({tenantId:context.tenantId,companyId:own.company_id,certificateId:certificate.data},'reconcile');
  },
  get:async(url,material)=>{
   const remaining=deadline-Date.now();
   if(remaining<12000)throw new Error('Diagnostic time budget exhausted');
   return nfseGet('homologation',url,material,Math.min(5000,remaining-12000));
  },
 },process.env.VERCEL_GIT_COMMIT_SHA);
}
