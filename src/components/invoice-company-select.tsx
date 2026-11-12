"use client";
import { useRouter } from "next/navigation";
export function InvoiceCompanySelect({ companies, selected }: { companies: { id: string; legal_name: string }[]; selected: string }) {
  const router = useRouter();
  return <div className="field"><label htmlFor="invoice-company">Empresa emissora</label><select id="invoice-company" value={selected} onChange={e => router.push(`/painel/notas/nova?empresa=${encodeURIComponent(e.target.value)}`)}>{companies.map(company => <option key={company.id} value={company.id}>{company.legal_name}</option>)}</select></div>;
}
