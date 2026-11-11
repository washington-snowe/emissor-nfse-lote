import {
  normalizeRegistry,
  validCnpj,
  type CompanyDraft,
} from "./companies.ts";

export type LookupResult =
  | { data: CompanyDraft; error?: never }
  | { error: string; data?: never };

export async function fetchCnpj(
  cnpj: string,
  request: typeof fetch = fetch,
): Promise<LookupResult> {
  if (!validCnpj(cnpj)) return { error: "Informe um CNPJ válido." };
  try {
    const response = await request(
      `https://brasilapi.com.br/api/cnpj/v1/${cnpj}`,
      {
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
        headers: { Accept: "application/json", "User-Agent": "EmissorNfse/0.1 (company registration lookup)" },
      },
    );
    if (response.status === 404)
      return {
        error:
          "CNPJ não encontrado na base consultada. Você pode preencher os dados manualmente.",
      };
    if (response.status === 429)
      return {
        error:
          "A consulta está com limite temporário. Aguarde ou preencha manualmente.",
      };
    if (!response.ok)
      return {
        error: "A consulta está indisponível. Você pode preencher manualmente.",
      };
    const data = normalizeRegistry(await response.json(), cnpj);
    return data
      ? { data }
      : {
          error:
            "A fonte retornou dados incompletos. Confira o CNPJ ou preencha manualmente.",
        };
  } catch {
    return {
      error:
        "Não foi possível consultar agora. Você pode preencher os dados manualmente.",
    };
  }
}
