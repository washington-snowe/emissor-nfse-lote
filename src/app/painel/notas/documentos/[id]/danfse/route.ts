import {requireWorkspace} from '@/lib/tenancy-server';
import {loadDanfse} from '@/lib/danfse-server';
export const dynamic='force-dynamic';
export const maxDuration=60;
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 const {client,context}=await requireWorkspace(),{id}=await params;
 const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"};
 if(!/^[0-9a-f-]{36}$/i.test(id))return new Response(null,{status:404,headers});
 const own=await client.from('fiscal_documents').select('id').eq('id',id).eq('tenant_id',context.tenantId).maybeSingle();
 if(own.error||!own.data)return new Response(null,{status:404,headers});
 try{
  const pdf=await loadDanfse({actorId:context.user.id,tenantId:context.tenantId,documentId:id});
  return new Response(new Uint8Array(pdf.bytes),{headers:{...headers,'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="DANFSe-${pdf.environment==='homologation'?'homologacao-':''}${pdf.accessKey}.pdf"`}});
 }catch{return new Response('Não foi possível gerar o DANFS-e. A nota está preservada. Volte à nota e use “Conferir DANFS-e” para ver a pendência.',{status:503,headers:{...headers,'Content-Type':'text/plain; charset=utf-8','Retry-After':'30'}});}
}
