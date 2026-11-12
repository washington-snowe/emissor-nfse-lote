import { createRoot } from "react-dom/client";
import { ReportPreview } from "../../src/components/report-preview";
import { WorkspaceShell } from "../../src/components/workspace-shell";
import { MfaSettings } from "../../src/components/mfa-settings";
import { MfaChallenge } from "../../src/components/mfa-challenge";
import { CertificateForm } from "../../src/components/certificate-form";
import { CertificateProbe } from "../../src/components/certificate-probe";
import { CertificateDeactivate } from "../../src/components/certificate-deactivate";
import { saveReport } from "./workflow-actions";
import { FiscalProfileForm } from "../../src/components/fiscal-profile-form";
import { ReportReviewForm } from "../../src/components/report-review-form";
import { ReviewConfirmation } from "../../src/components/review-confirmation";

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
createRoot(document.getElementById("root")!).render(
  <WorkspaceShell email="interface@emissor.example" active="imports">
    <div className="dashboard-content report-page">
      <p>Ambiente isolado de teste de interface · empresas e arquivo fictícios</p>
      <span className="eyebrow">Relatórios de comissões</span>
      <h1>Confira seu relatório da Shopee.</h1>
      <p>Escolha sua empresa e confira o CSV mensal por vendedor antes de preparar a emissão.</p>
      {screen === "review" ? review : screen === "review-confirmation" ? <ReviewConfirmation id="test-review" sha256={"a".repeat(64)} /> : screen === "fiscal" ? <FiscalProfileForm municipality="3550308" regime={parameters.has("simples") ? "simples" : "mei"} action={async (_state, form) => {
        window.workflowUiTest.calls++;
        await new Promise(resolve => setTimeout(resolve, 100));
        return window.workflowUiTest.calls === 1 ? { error: "Falha sintética de validação; confira os campos." } :
          { success: `Versão sintética ${Number(form.get("version")) + 1} salva sem banco ou emissão.`, version: Number(form.get("version")) + 1 };
      }} /> : screen === "security" ? <MfaSettings /> : screen === "challenge" ? <MfaChallenge factorId="00000000-0000-4000-8000-000000000099" /> : screen === "certificate" ? <><CertificateForm companies={companies.slice(0,1)} /><article className="company-card certificate-card report-back"><div><h2>Empresa sintética A</h2><p>Registro sintético, sem certificado real</p></div><div className="certificate-actions"><CertificateProbe id="test-only" /><CertificateDeactivate id="test-only" /></div></article></> : <ReportPreview companies={companies} saveAction={parameters.has("persist") ? saveReport : undefined} />}
    </div>
  </WorkspaceShell>,
);
