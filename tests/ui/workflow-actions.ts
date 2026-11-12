// UI boundary fixtures only: no Auth, Vault, key, credential or database access.
declare global {
  interface Window { workflowUiTest: { calls: number; companyId: string; fileSize: number; passwordLength: number; reviewJson?: string; requestIds?: string[]; standaloneJson?: string; templateVersion?: string; path?: string } }
}
export async function enrollTotp() {
  return { factorId: "00000000-0000-4000-8000-000000000099", qr: 'data:image/svg+xml;utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><rect width="240" height="240" fill="white"/><text x="80" y="120">TEST ONLY</text></svg>'), secret: "SYNTHETIC-SECRET-TEST-ONLY" };
}
export async function verifyTotp(_factor: string, code: string) { return code === "123456" ? { success: true } : { error: "Código sintético inválido." }; }
export const disableTotp = verifyTotp;
export async function challengeTotp(_state: unknown, form: FormData) { return { error: form.get("code") === "123456" ? "Sessão real não simulada neste teste." : "Código sintético inválido." }; }
export async function uploadCertificate(_state: unknown, form: FormData) {
  window.workflowUiTest.calls++;
  window.workflowUiTest.companyId = String(form.get("company_id"));
  window.workflowUiTest.passwordLength = String(form.get("password")).length;
  window.workflowUiTest.fileSize = (form.get("file") as File).size;
  return { success: "Envio sintético conferido, sem armazenar certificado." };
}
export async function deactivateCertificate() { return { success: "Desativação sintética." }; }
export async function probeCertificate() { return { success: "Verificação sintética sem conexão fiscal." }; }
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
