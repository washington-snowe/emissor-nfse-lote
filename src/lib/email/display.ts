import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {OperationDisplay} from '@/components/fiscal-operation-list';
export async function attachEmailStatuses(client:SupabaseClient,tenantId:string,operations:OperationDisplay[]){
 if(!operations.length)return operations;
 const result=await client.from('invoice_email_deliveries').select('id,operation_id,status,reason,destination,provider,test_mode').eq('tenant_id',tenantId).in('operation_id',operations.map(o=>o.id)).limit(500);
 if(result.error)return operations; // Forward deployment: migration may still be pending.
 const states=new Map((result.data??[]).map(e=>[e.operation_id,e]));
 return operations.map(o=>({...o,email:states.get(o.id)}));
}
