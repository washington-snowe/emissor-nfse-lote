export type VerificationDisplay = {status:string;result_code:string|null;http_status:number|null;updated_at:string;verified_at:string|null;next_attempt:string|null};
export function certificateVerificationMessage(value: VerificationDisplay | undefined) {
  if (!value || value.status === "queued") return "Verificação automática na fila. Você não precisa iniciar uma consulta.";
  if (value.status === "checking") return "Verificando o A1 e a conexão com a SEFIN automaticamente…";
  if (value.status === "verified") return "Conexão com a SEFIN de homologação verificada com o A1. Cada nota ainda passa pela validação fiscal antes de ser autorizada.";
  const messages:Record<string,string> = {
    company_incomplete:"Complete o município no cadastro da empresa para a verificação fiscal.",
    certificate_unavailable:"Não foi possível acessar ou validar o A1 protegido. Confira o certificado e sua validade.",
    contract_missing:"A documentação oficial ainda não ficou disponível. A verificação continua pendente.",
    contract_unsupported:"A documentação oficial precisa de atualização de compatibilidade. O envio continua pendente.",
    sefin_unavailable:"A SEFIN não confirmou a conexão nesta tentativa. O certificado continua protegido.",
    service_unavailable:"A verificação automática não pôde ser concluída nesta tentativa. O certificado continua protegido.",
  };
  return (messages[value.result_code ?? ""] ?? "A verificação fiscal está pendente.") + (value.next_attempt ? " Uma nova tentativa já está agendada." : "");
}
