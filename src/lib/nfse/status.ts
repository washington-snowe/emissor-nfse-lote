export const fiscalStatusLabels: Record<string, string> = {
  queued: "Na fila", blocked: "Aguardando configuração", preparing: "Preparando XML", sending: "Transmissão iniciada",
  uncertain: "Resultado incerto · somente consulta", reconciling: "Consultando resultado", authorized: "Autorizada em homologação",
  rejected: "Rejeitada", intervention: "Precisa de atenção", cancelled: "Preparação cancelada",
};
export const fiscalReasonLabels: Record<string, string> = {
  transmission_disabled: "A transmissão em homologação ainda está desativada.", contract_missing: "O contrato oficial da API ainda precisa ser verificado.",
  certificate_missing: "Cadastre um certificado A1 válido para esta empresa.", certificate_unavailable: "O certificado protegido não está disponível para esta operação.",
  configuration_changed: "A revisão ou o perfil mudou. Cancele esta preparação e confira uma nova versão.",
  worker_interrupted: "O processamento foi interrompido. A fila preservou o estado para recuperação.",
  invalid_xml: "O XML não passou na validação. Revise os dados fiscais.", preparation_failed: "Não foi possível concluir a preparação com segurança.",
  preparation_retry: "A preparação será retomada numa próxima execução.", preparation_exhausted: "A preparação atingiu o limite de tentativas. Confira as pendências.",
  network_uncertain: "A resposta não foi conclusiva. A próxima tentativa será somente de consulta.",
  provider_rejection: "O serviço retornou uma rejeição fiscal identificada. Revise a operação antes de uma nova preparação.",
  response_invalid: "A resposta não comprovou uma autorização compatível com a DPS enviada.",
  not_found: "A consulta ainda não localizou a DPS. Isso não libera um novo envio.",
  source_duplicate: "A origem já está reservada para este emissor. Confira suas operações antes de prosseguir.",
  reconcile_exhausted: "As consultas automáticas chegaram ao limite. Retomar fará somente novas consultas.",
};
export function formatFiscalBrl(value: string) {
  const [whole, fraction = ""] = value.split(".");
  return `R$ ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${fraction.padEnd(2, "0")}`;
}
