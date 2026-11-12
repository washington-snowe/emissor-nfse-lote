export type WorkspaceArea = "overview" | "companies" | "imports" | "invoices" | "standalone" | "service" | "advanced" | "certificates" | "profile" | "login" | "subscription" | "referrals";
export type NavigationCompany = { id: string; legal_name: string; cnpj: string };
export const COMPANY_COOKIE = "emissor_company";
export function workspaceDestination(area: string, companyId?: string) {
  const company = companyId && /^[0-9a-f-]{36}$/i.test(companyId) ? companyId : undefined;
  const paths: Record<WorkspaceArea, string> = {
    overview: "/painel", invoices: "/painel/notas", imports: "/painel/importacoes", standalone: "/painel/notas/nova",
    companies: company ? `/painel/empresas/${company}` : "/painel/empresas",
    service: company ? `/painel/empresas/${company}/fiscal?secao=servico` : "/painel/empresas",
    advanced: company ? `/painel/empresas/${company}/fiscal?secao=avancado` : "/painel/empresas",
    certificates: "/painel/certificados", profile: "/painel/conta/perfil", login: "/painel/conta/login",
    subscription: "/painel/conta/assinatura", referrals: "/painel/conta/indicacoes",
  };
  const path = Object.hasOwn(paths, area) ? paths[area as WorkspaceArea] : "/painel";
  return company && ["overview","invoices","imports","standalone","certificates"].includes(area) ? `${path}?empresa=${company}` : path;
}
export function chooseCompany(companies: NavigationCompany[], requested?: string) {
  return companies.find(company => company.id === requested) ?? companies[0] ?? null;
}

export function formatCompanyDocument(value: string) { return value.replace(/^([A-Z0-9]{2})([A-Z0-9]{3})([A-Z0-9]{3})([A-Z0-9]{4})([0-9]{2})$/, "$1.$2.$3/$4-$5"); }
