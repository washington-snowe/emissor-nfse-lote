import { municipalParametersUrl, nfseGet, type NfseCredentials } from "./http.ts";
import { fiscalTransportError, type NfseTransportFailure } from "./transport-error.ts";

const transportMessages: Record<NfseTransportFailure, string> = {
  invalid_destination: "A consulta fiscal foi bloqueada porque o endereço não corresponde ao serviço oficial configurado.",
  certificate_format: "Não foi possível preparar o certificado para a conexão segura. O arquivo foi armazenado, mas seu formato de transporte precisa ser conferido.",
  client_certificate: "O serviço recusou o certificado durante a conexão segura. Precisamos conferir a cadeia do A1 e a aceitação pelo ambiente de homologação.",
  server_certificate: "Não foi possível validar o certificado de segurança do serviço de homologação. A consulta foi interrompida para preservar a conexão segura.",
  tls: "A negociação da conexão segura com a homologação falhou. Isso ainda não comprova falta de credenciamento.",
  dns: "Não foi possível localizar o endereço do serviço de homologação. Tente novamente mais tarde.",
  timeout: "O serviço de homologação não concluiu a consulta no prazo de 15 segundos. Tente novamente mais tarde.",
  connection: "A conexão com o serviço de homologação foi interrompida ou não pôde ser estabelecida. Isso ainda não comprova falta de credenciamento.",
  response_limit: "A resposta do serviço de homologação excedeu o limite seguro de leitura.",
  response: "A resposta do serviço de homologação foi interrompida antes de terminar.",
};

export type FiscalAccessResult = { connected: boolean; status: number; message: string; diagnostic: string };
type AccessRequest = typeof nfseGet;

function result(connected: boolean, status: number, diagnostic: string, message: string): FiscalAccessResult {
  return { connected, status, diagnostic, message: `${message} Nenhuma nota foi enviada. Referência: ${diagnostic}.` };
}

export async function checkHomologationAccess(municipality: string, credentials: NfseCredentials, request: AccessRequest = nfseGet): Promise<FiscalAccessResult> {
  if (!/^[1-9]\d{6}$/.test(municipality)) throw new Error("Invalid municipality for fiscal access.");
  let response: Awaited<ReturnType<AccessRequest>>;
  try {
    response = await request("homologation", municipalParametersUrl("homologation", municipality), credentials, 15000);
  } catch (error) {
    const { reason } = fiscalTransportError(error);
    return result(false, 0, `NFSE_${reason.toUpperCase()}`, transportMessages[reason]);
  }
  const status = response.status;
  if (!Number.isInteger(status) || status < 100 || status > 599)
    return result(false, 0, "NFSE_INVALID_RESPONSE", "O serviço de homologação retornou uma resposta não reconhecida.");
  if (status >= 200 && status < 300) {
    try {
      // A successful transport probe is not proof of fiscal eligibility or issuance authority.
      const data: unknown = JSON.parse(response.body.toString("utf8"));
      if (data && typeof data === "object" && !Array.isArray(data) && "parametrosConvenio" in data &&
        data.parametrosConvenio && typeof data.parametrosConvenio === "object" && !Array.isArray(data.parametrosConvenio))
        return result(true, status, "NFSE_RESPONSE_RECEIVED", "Recebemos os parâmetros municipais do ADN em homologação. Isso ainda não comprova autorização para emitir pela SEFIN.");
    } catch { /* Do not expose HTML, provider text, parsing errors or taxpayer data. */ }
    return result(false, status, "NFSE_INVALID_RESPONSE", `A consulta respondeu HTTP ${status}, mas não trouxe os parâmetros no formato esperado.`);
  }
  let message: string;
  if (status === 401 || status === 403)
    message = `O serviço de homologação recusou o acesso à consulta (HTTP ${status}). Precisamos conferir a aceitação do certificado e as permissões do serviço; essa resposta não comprova, sozinha, falta de credenciamento.`;
  else if (status === 404)
    message = "O serviço de homologação não localizou a consulta de parâmetros municipais (HTTP 404). Precisamos conferir a rota e a disponibilidade dos parâmetros; isso não comprova falta de credenciamento.";
  else if (status === 429)
    message = "O serviço de homologação limitou as consultas (HTTP 429). Aguarde antes de tentar novamente.";
  else if (status >= 500)
    message = `O serviço de homologação retornou uma falha temporária (HTTP ${status}). Tente novamente mais tarde.`;
  else if (status >= 300 && status < 400)
    message = `O serviço respondeu com um redirecionamento (HTTP ${status}). O certificado não foi encaminhado para outro endereço.`;
  else
    message = `O serviço de homologação recusou a consulta de parâmetros (HTTP ${status}). Precisamos conferir essa resposta antes de concluir sobre o acesso fiscal.`;
  return result(false, status, `NFSE_HTTP_${status}`, message);
}
