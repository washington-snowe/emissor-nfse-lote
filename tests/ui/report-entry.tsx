import { createRoot } from "react-dom/client";
import { ReportPreview } from "../../src/components/report-preview";
import { WorkspaceShell } from "../../src/components/workspace-shell";
import { CertificateForm } from "../../src/components/certificate-form";
import { CertificateProbe } from "../../src/components/certificate-probe";
import { CertificateDeactivate } from "../../src/components/certificate-deactivate";
import { saveReport } from "./workflow-actions";
import { FiscalProfileForm } from "../../src/components/fiscal-profile-form";
import { ReportReviewForm } from "../../src/components/report-review-form";
import { ReviewConfirmation } from "../../src/components/review-confirmation";
import { StandaloneInvoiceForm } from "../../src/components/standalone-invoice-form";
import { FiscalOperationList } from "../../src/components/fiscal-operation-list";

const parameters = new URLSearchParams(location.search);
const screen = parameters.get("screen");
window.workflowUiTest = { calls: 0, companyId: "", fileSize: 0, passwordLength: 0 };
const companies = parameters.has("empty") ? [] : [
  { id: "test-company-a", legal_name: "Empresa sintética A", cnpj: "11222333000181" },
  { id: "test-company-b", legal_name: "Empresa sintética B", cnpj: "12ABC34501DE35" },
];
const review = <ReportReviewForm candidates={[
  { row: 2, storeName: "Loja sintética A", referencePeriod: "2026-10", amount: "1.10", person: { kind: "cnpj", document: "11222333000181", country: "BR", legalName: "Empresa sintética A" } },
  { row: 3, storeName: "Loja sintética exterior", referencePeriod: "2026-10", amount: "2.20", person: { kind: "foreign", document: "SYNTHETIC-NIF", country: "CN", legalName: "Synthetic foreign company" } },
]} foreignForAll={false} currency="986" needsIntermediary={false} action={async (_state, form) => {
  window.workflowUiTest.calls++;
  window.workflowUiTest.reviewJson = String(form.get("review"));
  return window.workflowUiTest.calls === 1 ? { error: "Revisão sintética precisa de conferência." } :
    { id: "test-review", version: Number(form.get("version")) + 1, sha256: "a".repeat(64), success: "Revisão sintética salva, sem banco ou emissão." };
}} />;
const standalone = <StandaloneInvoiceForm initial={{ configuration: { issuerMunicipality: "3550308", series: "1", simplesOption: "2", specialRegime: "0", serviceMunicipality: "3550308", nationalTaxCode: "010101", description: "Serviço sintético de afiliado", issTaxation: "1", issWithholding: "1", totals: { mode: "not_informed" } }, commissionType: "Comissões sintéticas Shopee", recipient: { kind: "cnpj", country: "BR", document: "11444777000161", legalName: "Tomador sintético Shopee", address: { country: "BR", postalCode: "00000000", municipalityCode: "3550308", street: "Endereço sintético", number: "1", district: "Distrito sintético" } } }}
  companyId="test-company" competenceDate="2026-11-11" profileVersion={1} templateVersion={0} requestId="00000000-0000-4000-8000-000000000099" readiness="teste de interface; nenhuma conexão fiscal." action={async form => {
    window.workflowUiTest.calls++;
    (window.workflowUiTest.requestIds ??= []).push(String(form.get("request_id")));
    window.workflowUiTest.standaloneJson = String(form.get("payload"));
    window.workflowUiTest.templateVersion = String(form.get("template_version"));
    await new Promise(resolve => setTimeout(resolve, 150));
    return window.workflowUiTest.calls === 1 ? { error: "Falha sintética preserva sua solicitação." } : { id: "test-batch", templateVersion: 1, success: "Preparação sintética, sem banco ou emissão." };
  }} />;
const operations = <FiscalOperationList operations={[
  { id: "test-queued", batch_id: "test-batch", status: "queued", reason: null, amount: "999999999999999.99", recipient: { legalName: "Tomador sintético A" }, dps_id: "DPS" + "1".repeat(42), transmit_count: 0, competence_date: "2026-10-31" },
  { id: "test-uncertain", batch_id: "test-batch", status: "uncertain", reason: "not_found", amount: "2.20", recipient: { legalName: "Tomador sintético B" }, dps_id: "DPS" + "2".repeat(42), transmit_count: 1, competence_date: "2026-10-31" },
  { id: "test-authorized", batch_id: "test-batch", status: "authorized", reason: null, amount: "3.30", recipient: { legalName: "Tomador sintético C" }, dps_id: "DPS" + "3".repeat(42), transmit_count: 1, competence_date: "2026-10-31", document: { id: "test-document", access_key: "1".repeat(50) } },
]} />;
createRoot(document.getElementById("root")!).render(
  <WorkspaceShell email="interface@emissor.example" active="imports">
    <div className="dashboard-content report-page">
      <p>Ambiente isolado de teste de interface · empresas e arquivo fictícios</p>
      <span className="eyebrow">Relatórios de comissões</span>
      <h1>{screen === "standalone" ? "Sua nota de afiliado, sem começar do zero." : screen === "operations" ? "Acompanhe suas emissões." : "Confira seu relatório da Shopee."}</h1>
      <p>Escolha sua empresa e confira o CSV mensal por vendedor antes de preparar a emissão.</p>
      {screen === "standalone" ? standalone : screen === "operations" ? operations : screen === "review" ? review : screen === "review-confirmation" ? <ReviewConfirmation id="test-review" sha256={"a".repeat(64)} /> : screen === "fiscal" ? <FiscalProfileForm municipality="3550308" regime={parameters.has("simples") ? "simples" : "mei"} action={async (_state, form) => {
        window.workflowUiTest.calls++;
        await new Promise(resolve => setTimeout(resolve, 100));
        return window.workflowUiTest.calls === 1 ? { error: "Falha sintética de validação; confira os campos." } :
          { success: `Versão sintética ${Number(form.get("version")) + 1} salva sem banco ou emissão.`, version: Number(form.get("version")) + 1 };
      }} /> : screen === "certificate" ? <><CertificateForm companies={companies.slice(0,1)} /><article className="company-card certificate-card report-back"><div><h2>Empresa sintética A</h2><p>Registro sintético, sem certificado real</p></div><div className="certificate-actions"><CertificateProbe id="test-only" /><CertificateDeactivate id="test-only" /></div></article></> : <ReportPreview companies={companies} saveAction={parameters.has("persist") ? saveReport : undefined} />}
    </div>
  </WorkspaceShell>,
);
