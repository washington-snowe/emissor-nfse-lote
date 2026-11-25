'use server';
import {requireWorkspace} from '@/lib/tenancy-server';
import {checkProductionAccess} from '@/lib/production-access';
export async function verifyProduction(companyId:string){
 const {context}=await requireWorkspace();
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(companyId))return {verified:false,message:'Empresa indisponível.'};
 const { verified, message } = await checkProductionAccess(context.user.id,companyId);
 return { verified, message };
}
