// UI boundary fixtures only: no Auth, Vault, key, credential or database access.
declare global {
  interface Window { workflowUiTest: { calls: number; companyId: string; fileSize: number; passwordLength: number; reviewJson?: string; requestIds?: string[]; standaloneJson?: string; templateVersion?: string; path?: string; clipboard?: string;refreshes?:number } }
}
export async function uploadCertificate(_state: unknown, form: FormData) {
  window.workflowUiTest.calls++;
  window.workflowUiTest.companyId = String(form.get("company_id"));
  window.workflowUiTest.passwordLength = String(form.get("password")).length;
  window.workflowUiTest.fileSize = (form.get("file") as File).size;
  return { success: "Envio sintético conferido, sem armazenar certificado.",notice:"Verificação automática sintética iniciada, sem conexão oficial." };
}
export async function deactivateCertificate() { return { success: "Desativação sintética." }; }
export async function probeCertificate() { return { success: "Verificação sintética sem conexão fiscal.", notice: "Documentação sintética pendente; nenhuma conexão oficial. Referência: NFSE_CONTRACT_PENDING.", details: "Diagnóstico: nfse-adn-v1\nParâmetros ADN: HTTP 404 · consulta sintética\nContrato SEFIN: HTTP 404 · sem consulta oficial", profileHref: "/painel/empresas/test-company/fiscal?secao=servico" }; }
export async function confirmReportReview() { window.workflowUiTest.calls++; return { success: "Confirmação sintética, sem banco ou emissão." }; }
export async function enqueueReport() { window.workflowUiTest.calls++; return { success: "Fila sintética sem emissão." }; }
export async function manageOperation(_id: string, action: string) { window.workflowUiTest.calls++; return { success: `Ação sintética ${action}, sem emissão.` }; }
export async function resumeBatch() { window.workflowUiTest.calls++; return { success: "Retomada sintética sem emissão." }; }
export async function saveReport(form: FormData) {
  window.workflowUiTest.calls++;
  window.workflowUiTest.companyId = String(form.get("company_id"));
  window.workflowUiTest.fileSize = (form.get("file") as File).size;
  return { id: "00000000-0000-4000-8000-000000000088", duplicate: false };
}

export async function selectWorkspaceCompany(id: string, area: string) { window.workflowUiTest.companyId = id; window.workflowUiTest.path = area; return {}; }
export async function saveAccountProfile(_state: unknown, form: FormData) { window.workflowUiTest.calls++; return window.workflowUiTest.calls===1 ? {error:"Falha sintética de perfil."} : { success: "Perfil sintético salvo.", version: Number(form.get("version"))+1 }; }
export async function updateLogin() { window.workflowUiTest.calls++; return { success: "Acesso sintético atualizado; nenhum Auth real." }; }
export async function claimReferral() { return { success: "Indicação sintética vinculada." }; }

export async function openBilling() { window.workflowUiTest.calls++; return {error:"Checkout sintético sem cobrança ou conexão Stripe."}; }
