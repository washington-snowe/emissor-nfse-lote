import { emptyCompany, validateCompany } from "../../src/lib/companies";

declare global {
  interface Window {
    companyUiTest: { calls: number; mode: "success" | "error" | "slow"; saved: unknown[]; path: string };
  }
}

export async function consultCompany(cnpj: string) {
  window.companyUiTest.calls++;
  const mode = window.companyUiTest.mode;
  await new Promise(resolve => setTimeout(resolve, mode === "slow" ? 900 : 60));
  if (mode === "error") return { error: "Consulta de teste indisponível." };
  return { data: { ...emptyCompany, cnpj, legal_name: cnpj.startsWith("12") ? "Empresa alfanumérica de teste" : "Empresa de teste de interface", trade_name: "Teste", tax_regime: "mei", street: "Rua de teste", number: "1", city: "São Paulo", state: "SP", postal_code: "01001000", municipality_code: "3550308", main_cnae: "7319002", registration_status: "ATIVA" } };
}

export async function saveCompany(input: unknown) {
  const result = validateCompany(input);
  if (!result.data) return { error: "Confira os campos indicados.", fields: result.errors };
  window.companyUiTest.saved.push(result.data);
  return { id: "00000000-0000-4000-8000-000000000099" };
}
