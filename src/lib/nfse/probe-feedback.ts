import type { FiscalAccessResult } from "./access-check.ts";

export type FiscalContractStatus = "pending" | "storage_pending" | "unsupported" | "recognized";
type FiscalProbeFeedback = { success?: string; error?: string; notice: string; canReviewProfile: boolean };

// Presentation only. Never changes the transport result, certificate state, numbering or emission guards.
export function fiscalProbeFeedback(access: FiscalAccessResult, regime: string, contract: FiscalContractStatus): FiscalProbeFeedback {
  const notice = contract === "recognized" ? "Documentação fiscal obtida e estrutura da API reconhecida. O certificado e a operação ainda serão conferidos na SEFIN antes de qualquer envio." :
    contract === "storage_pending" ? "A documentação foi encontrada, mas a configuração de armazenamento fiscal precisa ser concluída. Referência: NFSE_CONTRACT_STORAGE." :
    contract === "unsupported" ? "A documentação foi registrada, mas sua estrutura ainda precisa de adaptação. O envio continua bloqueado. Referência: NFSE_CONTRACT_UNSUPPORTED." :
    "A documentação fiscal ainda não pôde ser obtida. O envio continua bloqueado. Referência: NFSE_CONTRACT_PENDING.";
  if (regime === "mei" && access.status === 404 && access.responseFormat === "json" && contract === "recognized") {
    return {
      success: "Documentação da SEFIN recebida e estrutura da API reconhecida. A consulta municipal auxiliar não impede a próxima etapa de validação do MEI.",
      notice: "O ADN retornou 404 para os parâmetros municipais em homologação. Para MEI, esse retorno não deve ser tratado como exigência de adesão municipal. Confira os dados fiscais; o certificado e a operação ainda serão validados na SEFIN antes do envio. Nenhuma nota foi enviada.",
      canReviewProfile: true,
    };
  }
  return {...(access.connected ? {success: access.message} : {error: access.message}), notice, canReviewProfile: access.connected && contract === "recognized"};
}
