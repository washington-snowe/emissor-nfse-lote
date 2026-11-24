"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight } from "lucide-react";
import { consultEligibility } from "@/app/eligibility-actions";
import type { EligibilityResult } from "@/lib/cnpj-eligibility";
import { validCnpj } from "@/lib/companies";

const messages: Record<EligibilityResult["status"], [title: string, detail?: string]> = {
  available: ["Seu perfil é atendido pelo Rex", "Cadastre a empresa e valide o certificado A1 para confirmar o acesso à emissão."],
  assisted: ["Seu perfil é atendido com liberação assistida", "Fale com nosso time para verificar a liberação da emissão em produção."],
  unsupported: ["Ainda não atendemos esse CNPJ", "Nosso time pode avaliar a liberação para o seu perfil."],
  inactive: ["O cadastro do CNPJ precisa de atenção", "Confira a situação cadastral antes de configurar a emissão."],
  unconfirmed: ["Não conseguimos confirmar o enquadramento", "A base consultada retornou dados insuficientes. Nosso time pode conferir o seu caso."],
  invalid: ["Confira o CNPJ informado"],
  not_found: ["CNPJ não encontrado na base consultada", "Confira os dados ou tente novamente mais tarde."],
  rate_limited: ["Limite de consultas atingido", "Aguarde alguns minutos antes de consultar novamente."],
  unavailable: ["Consulta indisponível no momento", "Tente novamente em instantes."],
};

export function LandingEligibility({ supportHref }: { supportHref?: string }) {
  const [cnpj, setCnpj] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<EligibilityResult | null>(null);
  const message = result && messages[result.status];
  const showSupport = result && ["assisted", "unsupported", "inactive", "unconfirmed"].includes(result.status);

  async function check(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!validCnpj(cnpj)) {
      setResult({ status: "invalid" });
      return;
    }
    setResult(null);
    setPending(true);
    try {
      setResult(await consultEligibility(cnpj));
    } catch {
      setResult({ status: "unavailable" });
    } finally {
      setPending(false);
    }
  }

  return <section className="landing-eligibility" id="consultar-cnpj" aria-labelledby="eligibility-title">
    <div className="site-width landing-eligibility-grid">
      <div>
        <h2 id="eligibility-title">Seu CNPJ pode emitir pelo Rex?</h2>
        <p className="landing-eligibility-intro">Consulte o município do cadastro e veja se o Rex atende o perfil da sua empresa.</p>
      </div>
      <div className="landing-eligibility-panel">
        <form onSubmit={check} aria-busy={pending}>
          <label htmlFor="eligibility-cnpj">CNPJ da empresa</label>
          <div className="landing-eligibility-fields">
            <input id="eligibility-cnpj" value={cnpj} type="text" maxLength={30} autoComplete="off"
              autoCapitalize="characters" spellCheck={false} placeholder="00.000.000/0000-00"
              readOnly={pending} aria-invalid={result?.status === "invalid" || undefined}
              onChange={event => {
                setCnpj(event.target.value);
                setResult(null);
              }} />
            <button type="submit" className="btn btn--primary" disabled={pending}>
              {pending ? "Consultando…" : "Consultar CNPJ"}
            </button>
          </div>
        </form>
        {pending && <div className="landing-estimate landing-estimate-skeleton" role="status">
          <span className="sr-only">Consultando cadastro…</span>
          <span aria-hidden="true" /><span aria-hidden="true" />
        </div>}
        {result && message && <div className="landing-eligibility-result" data-eligibility={result.status}>
          <div role={result.status === "invalid" ? "alert" : "status"}>
            <p className="landing-eligibility-status">{message[0]}</p>
            {"location" in result && (result.location || result.profile) && <p className="landing-eligibility-profile">
              {[result.profile, result.location].filter(Boolean).join(" · ")}
            </p>}
            {message[1] && <p>{message[1]}</p>}
          </div>
          {result.status === "available" && <a href="#planos" className="text-link">Ver planos <ArrowRight size={16} aria-hidden="true" /></a>}
          {showSupport && supportHref && <a href={supportHref} className="btn btn--secondary">Fale com nosso time <ArrowRight size={16} aria-hidden="true" /></a>}
        </div>}
      </div>
    </div>
  </section>;
}
