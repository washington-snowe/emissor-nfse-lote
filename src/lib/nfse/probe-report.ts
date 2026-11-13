import type { FiscalAccessResult } from "./access-check.ts";
import type { ContractDiscoveryStep } from "./contract.ts";

const stages: Record<ContractDiscoveryStep["stage"], string> = {
  portal_index: "Índice do portal", canonical_index: "Índice SEFIN", initializer: "Configuração do leitor",
  schema: "Contrato indicado", schema_direct: "Contrato SEFIN",
};
const outcomes: Record<ContractDiscoveryStep["outcome"], string> = {
  received: "recebido", no_reference: "referência não reconhecida", invalid_contract: "formato não reconhecido",
  base_mismatch: "base incompatível", captured: "capturado", timeout: "prazo excedido", connection: "falha de conexão", tls: "falha TLS",
};
const formats: Record<ContractDiscoveryStep["format"], string> = {json: "JSON", html: "HTML", other: "outro formato", empty: "sem corpo"};
const status = (value: number) => Number.isInteger(value) && value >= 0 && value <= 599 ? value : 0;

// A support report contains only static labels, bounded statuses and categories, never URLs/bodies/credentials.
export function fiscalProbeReport(access: FiscalAccessResult, steps: readonly ContractDiscoveryStep[], commit?: string) {
  const version = commit && /^[0-9a-f]{40}$/i.test(commit) ? ` (${commit.slice(0, 7)})` : "";
  return [
    `Diagnóstico: nfse-adn-v1${version}`,
    `Parâmetros ADN: HTTP ${status(access.status)} · ${access.connected ? "parâmetros recebidos" : "consulta não concluída"}`,
    ...steps.slice(0, 20).map(step => `${stages[step.stage] ?? "Documentação"}: HTTP ${status(step.status)} · ${formats[step.format] ?? "outro formato"} · ${outcomes[step.outcome] ?? "não concluído"}`),
    ...(steps.length ? [] : ["Documentação: consulta não executada dentro do prazo."]),
    "Nenhuma nota foi enviada por esta verificação.",
  ].join("\n");
}
