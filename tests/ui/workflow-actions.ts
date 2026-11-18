// UI boundary fixtures only: no Auth, Vault, key, credential or database access.
import {quickUiData} from "./quick-fixture";
declare global {
  interface Window { workflowUiTest: { calls: number; companyId: string; fileSize: number; passwordLength: number; reviewJson?: string; requestIds?: string[]; standaloneJson?: string; templateVersion?: string; path?: string; clipboard?: string;refreshes?:number;validityAdjustments?:number;validityInput?:string;emailOptIn?:FormDataEntryValue|null;emailCorrection?:FormDataEntryValue|null;manageError?:boolean;holdManage?:boolean;finishManage?:()=>void;updateOperation?:(status:string)=>void;productionChecks?:number;productionVerified?:boolean;submittedEnvironment?:FormDataEntryValue|null;providerTestDestination?:FormDataEntryValue|null } }
}
export async function uploadCertificate(_state: unknown, form: FormData) {
  window.workflowUiTest.calls++;
  window.workflowUiTest.companyId = String(form.get("company_id"));
  window.workflowUiTest.passwordLength = String(form.get("password")).length;
  window.workflowUiTest.fileSize = (form.get("file") as File).size;
  return { success: "Envio sintético conferido, sem armazenar certificado.",notice:"Verificação automática sintética iniciada, sem conexão oficial." };
}
export async function deactivateCertificate() { return { success: "Desativação sintética." }; }
export async function diagnoseCertificateSefin() { return {success:"Diagnóstico sintético, sem consulta fiscal.",details:"Diagnóstico: nfse-sefin-v3 (local)\nA1 protegido: aberto e validado localmente\nResultado: sefin_verified\nConsulta: GET /dps/{id} · HTTP 404 · JSON\nAmbiente declarado: não reconhecido\nRepresentação do ambiente: número 0\nCódigos fiscais: E2404\nResposta compatível com o contrato: não\nCritério de acesso: compatibilidade restrita GET DPS · 404/E2404 · ambiente 0\nNenhuma nota foi enviada por este diagnóstico."}; }
export async function probeCertificate() { return { success: "Verificação sintética sem conexão fiscal.", notice: "Documentação sintética pendente; nenhuma conexão oficial. Referência: NFSE_CONTRACT_PENDING.", details: "Diagnóstico: nfse-adn-v1\nParâmetros ADN: HTTP 404 · consulta sintética\nContrato SEFIN: HTTP 404 · sem consulta oficial", profileHref: "/painel/empresas/test-company/fiscal?secao=servico" }; }
export async function confirmReportReview() { window.workflowUiTest.calls++; return { success: "Confirmação sintética, sem banco ou emissão." }; }
export async function enqueueReport() { window.workflowUiTest.calls++; return { success: "Fila sintética sem emissão." }; }
export async function manageOperation(_id: string, action: string) {
  window.workflowUiTest.calls++;
  if(window.workflowUiTest.holdManage)await new Promise<void>(resolve=>{window.workflowUiTest.finishManage=resolve;});
  return window.workflowUiTest.manageError?{error:'A operação mudou ou não permite essa ação. Recusa sintética, sem emissão.'}:{ success: `Ação sintética ${action}, sem emissão.` };
}
export async function getFiscalOperationDiagnostic(){return {receiptAvailable:true,details:'Diagnóstico: nfse-operation-v2 (local)\nCorrelação técnica: abcdef0123456789\nEstado: Resultado incerto · somente consulta\nInícios de envio registrados: 1\nPrimeiro envio: HTTP 201 · JSON · homologação · códigos não identificados\nIdentidade na resposta: não corresponde integralmente ao identificador esperado.\nEste relatório analisa apenas registros já armazenados. Não consulta a SEFIN nem envia notas.'};}
export async function resumeBatch() { window.workflowUiTest.calls++; return { success: "Retomada sintética sem emissão." }; }
export async function saveReport(form: FormData) {
  window.workflowUiTest.calls++;
  window.workflowUiTest.companyId = String(form.get("company_id"));
  window.workflowUiTest.fileSize = (form.get("file") as File).size;
  return { id: "00000000-0000-4000-8000-000000000088", duplicate: false };
}
export async function refreshQuickReview(_id:string,payload:string){await new Promise(resolve=>setTimeout(resolve,250));const parameters=new URLSearchParams(location.search);if(parameters.has("preview-error"))throw new Error("Synthetic preview failure");const data=quickUiData(JSON.parse(payload),parameters.has("production"));if(parameters.has("production-failure")){data.production={ready:false};data.digest=undefined;}return {data};}
export async function adjustQuickReviewValidity(_id:string,form:FormData){if(form.get("sameConfiguration")!=="on")return {error:"Confirmação sintética ausente."};window.workflowUiTest.validityAdjustments=(window.workflowUiTest.validityAdjustments??0)+1;window.workflowUiTest.validityInput=String(form.get("input"));await new Promise(resolve=>setTimeout(resolve,150));const data=quickUiData(JSON.parse(String(form.get("input"))));data.preview!.profileVersion=2;data.digest="c".repeat(64);return {data};}
export async function confirmAndQueueQuickReview(_id:string,form:FormData){window.workflowUiTest.submittedEnvironment=form.get("environment");window.workflowUiTest.emailOptIn=form.get("emailReviewed");window.workflowUiTest.calls++;window.workflowUiTest.reviewJson=String(form.get("input"));(window.workflowUiTest.requestIds??=[]).push(String(form.get("request")));await new Promise(resolve=>setTimeout(resolve,120));return window.workflowUiTest.calls===1?{error:"Falha sintética preserva a confirmação."}:{id:"test-quick-batch",duplicate:true};}

export async function selectWorkspaceCompany(id: string, area: string) { window.workflowUiTest.companyId = id; window.workflowUiTest.path = area; return {}; }
export async function saveAccountProfile(_state: unknown, form: FormData) { window.workflowUiTest.calls++; return window.workflowUiTest.calls===1 ? {error:"Falha sintética de perfil."} : { success: "Perfil sintético salvo.", version: Number(form.get("version"))+1 }; }
export async function updateLogin() { window.workflowUiTest.calls++; return { success: "Acesso sintético atualizado; nenhum Auth real." }; }
export async function claimReferral() { return { success: "Indicação sintética vinculada." }; }

export async function openBilling() { window.workflowUiTest.calls++; return {error:"Checkout sintético sem cobrança ou conexão Stripe."}; }

export async function enableBatchEmails(){return {success:"Entrega sintética preparada, sem envio."};}
export async function retryInvoiceEmail(_id:string,_state:unknown,form:FormData){window.workflowUiTest.emailCorrection=form.get("destination");return {success:"Nova tentativa sintética, sem envio."};}

export async function getFiscalReceiptDiagnostic(){return {verified:false,details:"Diagnóstico: nfse-receipt-v1 (local)\nConsulta da DPS original: HTTP 200.\nXSD da NFS-e: estrutura aceita.\nConteúdo autenticado da DPS preservado: não validado.\nEstado da operação preservado. Nenhuma nota foi enviada."};}
export async function getDanfseDiagnostic(){return {available:false,details:'Diagnóstico: nfse-danfse-v4 (local)\nModo: geração local pelo XML autorizado · NT008/2026 v1.02.\nPreparação do PDF: não concluída · document_invalid.\nDANFS-e disponível: não.\nEsta conferência não libera produção, não altera a operação e não envia notas ou e-mails.'};}
export async function requestProviderTests(_state:unknown,form:FormData){window.workflowUiTest.calls++;window.workflowUiTest.providerTestDestination=form.get('destination');return {success:'Três testes sintéticos preparados, sem envio real.'};}

export async function verifyProduction(){window.workflowUiTest.productionChecks=(window.workflowUiTest.productionChecks??0)+1;await new Promise(resolve=>setTimeout(resolve,200));const verified=!new URLSearchParams(location.search).has("production-failure");window.workflowUiTest.productionVerified=verified;return {verified,message:verified?"Acesso de produção sintético conferido, sem emissão.":"A verificação de produção sintética não foi concluída. Confira o diagnóstico.",details:"Diagnóstico sintético GET de produção. Nenhuma nota enviada."};}
