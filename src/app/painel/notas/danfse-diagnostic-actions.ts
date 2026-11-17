'use server';
import {requireWorkspace} from '@/lib/tenancy-server';
import {inspectOfficialDanfse} from '@/lib/danfse-server';

export async function getDanfseDiagnostic(documentId:string):Promise<{error?:string;available?:boolean;details?:string}>{
 const {client,context}=await requireWorkspace();
 if(!/^[0-9a-f-]{36}$/i.test(documentId))return {error:'Documento indisponível.'};
 const own=await client.from('fiscal_documents').select('id').eq('id',documentId).eq('tenant_id',context.tenantId).maybeSingle();
 if(own.error||!own.data)return {error:'Documento indisponível.'};
 return inspectOfficialDanfse({actorId:context.user.id,tenantId:context.tenantId,documentId});
}
