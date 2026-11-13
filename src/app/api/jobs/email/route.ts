import {after,NextResponse} from 'next/server';
import {validWorkerAuthorization} from '@/lib/worker-auth';
import {processInvoiceEmails} from '@/lib/email/jobs';
export const runtime='nodejs';
export const maxDuration=60;
export const dynamic='force-dynamic';
export async function POST(request:Request){
 if(!validWorkerAuthorization(request.headers.get('authorization'),process.env.EMAIL_WORKER_SECRET))return new NextResponse(null,{status:401});
 after(async()=>{try{await processInvoiceEmails();}catch{/* Durable metadata and leases recover without logging XML or addresses. */}});
 return NextResponse.json({accepted:true},{status:202,headers:{'Cache-Control':'no-store'}});
}
