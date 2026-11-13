import { AccountProfileForm, LoginChangeForm, ReferralLink } from "../../src/components/account-forms";
import { SubscriptionPlans } from "../../src/components/subscription-plans";
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
import { MeiFiscalSetup } from "../../src/components/mei-fiscal-setup";
import { AutomaticAffiliateSummary } from "../../src/components/automatic-affiliate-summary";
import { AutomaticCertificateStatus } from "../../src/components/automatic-certificate-status";
import {QuickReportReview} from "../../src/components/quick-report-review";
import {quickUiData} from "./quick-fixture";

const parameters = new URLSearchParams(location.search);
const screen = parameters.get("screen");
window.workflowUiTest = { calls: 0, companyId: "", fileSize: 0, passwordLength: 0 };
const companies = parameters.has("empty") ? [] : [
  { id: "test-company-a", legal_name: "Empresa sintética A", cnpj: "11222333000181" },
  { id: "test-company-b", legal_name: "Empresa sintética B", cnpj: "12ABC34501DE35" },
];
const meiSetup = <MeiFiscalSetup companyId="test-company" municipality="São Paulo / SP" today="2026-11-12"
  initial={parameters.has("saved") ? {version: 4, valid_from: "2026-10-01", configuration: { issuerMunicipality: "3550308", series: "77", simplesOption: "2", specialRegime: "0", serviceMunicipality: "3550308", nationalTaxCode: "010101", description: "Configuração personalizada já salva", issTaxation: "1", issWithholding: "1", totals: { mode: "not_informed" } }} : undefined}
  action={async (_state, form) => {
    window.workflowUiTest.calls++;
    window.workflowUiTest.reviewJson = JSON.stringify(Object.fromEntries(form.entries()));
    await new Promise(resolve => setTimeout(resolve, 100));
    return window.workflowUiTest.calls === 1 ? { error: "Falha sintética, confirmação preservada." } : {version: 1, success: "Configuração MEI sintética salva, sem banco ou emissão."};
  }} />;
const automaticSetup = <AutomaticAffiliateSummary companyId="test-company" regime={parameters.has("simples") ? "simples" : "mei"} municipality="São Paulo / SP"
  initial={parameters.has("simples") ? undefined : {valid_from:"2025-06-10",configuration:{issuerMunicipality:"3550308",series:"1",simplesOption:"2",specialRegime:"0",serviceMunicipality:"3550308",nationalTaxCode:"170601",description:"Promoção de vendas como afiliado",issTaxation:"1",issWithholding:"1",totals:{mode:"not_informed"}}}} reason={parameters.has("simples") ? "simples_data_required" : "configured"}/>;
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
  <WorkspaceShell name="Pessoa sintética de teste" email="interface@emissor.example" active={screen === "profile" ? "profile" : screen === "plans" ? "subscription" : screen === "login" ? "login" : "imports"} companies={[{id:"00000000-0000-4000-8000-000000000001",legal_name:"Empresa sintética A com nome extenso",cnpj:"11222333000181"},{id:"00000000-0000-4000-8000-000000000002",legal_name:"Empresa sintética B",cnpj:"11444777000161"}]} companyId="00000000-0000-4000-8000-000000000001">
    <div className="dashboard-content report-page">
      <p>Ambiente isolado de teste de interface · empresas e arquivo fictícios</p>
      <span className="eyebrow">{["profile","login","plans","referrals"].includes(screen ?? "") ? "Conta" : "Relatórios de comissões"}</span>
      <h1>{screen === "plans" ? "Sua assinatura." : screen === "profile" ? "Seu perfil." : screen === "login" ? "Seus dados de acesso." : screen === "standalone" ? "Sua nota de afiliado, sem começar do zero." : screen === "operations" ? "Acompanhe suas emissões." : "Confira seu relatório da Shopee."}</h1>
      <p>Escolha sua empresa e confira o CSV mensal por vendedor antes de preparar a emissão.</p>
      {screen==="quick"?<QuickReportReview initial={quickUiData()}/>:screen==="upload"?<ReportPreview companies={companies} initialCompanyId="test-company-a" automaticUpload saveAction={saveReport}/>:screen === "automatic" ? automaticSetup : screen === "automatic-certificate" ? <AutomaticCertificateStatus verification={{status:parameters.get("status")??"checking",result_code:parameters.has("verified") ? "sefin_verified" : null,http_status:parameters.has("verified")?404:null,updated_at:"2026-11-12T12:00:00Z",verified_at:null,next_attempt:null}}/> : screen === "mei" ? meiSetup : screen === "profile" ? <AccountProfileForm name="Pessoa sintética" phone="" /> : screen === "login" ? <LoginChangeForm kind="password" /> : screen === "plans" ? <SubscriptionPlans ready={!parameters.has("unavailable")} request="00000000-0000-4000-8000-000000000099" /> : screen === "referrals" ? <ReferralLink url="https://emissor.example/criar-conta?ref=aaaaaaaaaaaaaaaaaaaa" /> : screen === "standalone" ? standalone : screen === "operations" ? operations : screen === "review" ? review : screen === "review-confirmation" ? <ReviewConfirmation id="test-review" sha256={"a".repeat(64)} /> : screen === "fiscal" ? <FiscalProfileForm municipality="3550308" regime={parameters.has("simples") ? "simples" : "mei"} action={async (_state, form) => {
        window.workflowUiTest.calls++;
        await new Promise(resolve => setTimeout(resolve, 100));
        return window.workflowUiTest.calls === 1 ? { error: "Falha sintética de validação; confira os campos." } :
          { success: `Versão sintética ${Number(form.get("version")) + 1} salva sem banco ou emissão.`, version: Number(form.get("version")) + 1 };
      }} /> : screen === "certificate" ? <><CertificateForm companies={companies.slice(0,1)} /><article className="company-card certificate-card report-back"><div><h2>Empresa sintética A</h2><p>Registro sintético, sem certificado real</p></div><div className="certificate-actions"><CertificateProbe id="test-only" /><CertificateDeactivate id="test-only" /></div></article></> : <ReportPreview companies={companies} saveAction={parameters.has("persist") ? saveReport : undefined} />}
    </div>
  </WorkspaceShell>,
);
