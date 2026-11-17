import {randomUUID} from 'node:crypto';
import type {Metadata} from 'next';
import {WorkspaceShell} from '@/components/workspace';
import {EmailProviderTests,type ProviderTestDisplay} from '@/components/email-provider-tests';
import {FiscalRefresh} from '@/components/fiscal-refresh';
import {requireWorkspace} from '@/lib/tenancy-server';
import {emailConfig,allowedTestDestinations} from '@/lib/email/config';
export const metadata:Metadata={title:'Teste de e-mails'};
export const dynamic='force-dynamic';
export const maxDuration=60;
export default async function ProviderTests(){
 const {client,context}=await requireWorkspace(),config=emailConfig(process.env);
 const report=await client.rpc('email_provider_test_report');
 const tests=(Array.isArray(report.data)?report.data:[]) as ProviderTestDisplay[];
 const destinations=allowedTestDestinations(context.user.email,Boolean(context.user.email_confirmed_at),config.testTo);
 return <WorkspaceShell active="invoices"><div className="dashboard-content company-page"><span className="eyebrow">E-mails</span><h1>Confira a entrega.</h1>
  <EmailProviderTests request={randomUUID()} destinations={destinations} configured={config.enabled?config.providers:[]} sender={config.sender} ready={!report.error} tests={tests}/>
  <FiscalRefresh waiting={tests.some(test=>['queued','processing'].includes(test.status))}/>
 </div></WorkspaceShell>;
}
