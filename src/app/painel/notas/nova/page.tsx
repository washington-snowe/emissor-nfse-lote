import {redirect} from 'next/navigation';
import {requireWorkspace} from '@/lib/tenancy-server';
export const dynamic='force-dynamic';
export default async function NewInvoice(){await requireWorkspace();redirect('/painel/importacoes');}
