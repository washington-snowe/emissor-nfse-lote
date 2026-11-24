"use client";

import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { ArrowRight } from "lucide-react";
import { consultEligibility } from "@/app/eligibility-actions";
import type { EligibilityResult } from "@/lib/cnpj-eligibility";
import { formatCnpj, normalizeCnpj, validCnpj } from "@/lib/companies";

const messages: Record<EligibilityResult["status"], [title: string, detail?: string]> = {
  eligible: ["Sim, seu perfil pode emitir pelo Rex"],
  unsupported: ["Ainda não atendemos esse CNPJ", "Nosso time pode avaliar a liberação para o seu perfil."],
  inactive: ["O cadastro do CNPJ precisa de atenção", "Confira a situação cadastral antes de configurar a emissão."],
  unconfirmed: ["Não conseguimos confirmar o enquadramento", "A base consultada retornou dados insuficientes. Nosso time pode conferir o seu caso."],
  invalid: ["Confira o CNPJ informado"],
  not_found: ["CNPJ não encontrado na base consultada", "Confira os dados ou tente novamente mais tarde."],
  rate_limited: ["Limite de consultas atingido", "Aguarde alguns minutos antes de consultar novamente."],
  unavailable: ["Consulta indisponível no momento", "Tente novamente em instantes."],
};

const nextSteps = {
  setup: "Cadastre a empresa e valide seu certificado A1 para começar a emitir.",
  assisted: "Para começar a emitir em produção, peça ao nosso time uma análise da liberação.",
  regularize: "Regularize a situação cadastral do CNPJ antes de pedir a liberação da emissão.",
};

export function LandingEligibility({ supportHref }: { supportHref?: string }) {
  const [cnpj, setCnpj] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<EligibilityResult | null>(null);
  const field = useRef<HTMLInputElement>(null);
  const message = result && messages[result.status];
  const nextStep = result?.status === "eligible" ? result.nextStep : undefined;
  const detail = nextStep ? nextSteps[nextStep] : message?.[1];
  const showSupport = nextStep === "assisted" || nextStep === "regularize"
    || (result && ["unsupported", "inactive", "unconfirmed"].includes(result.status));

  function changeCnpj(event: ChangeEvent<HTMLInputElement>) {
    const field = event.currentTarget;
    const typed = field.value;
    let position = (typed.slice(0, field.selectionStart ?? typed.length).match(/[a-z0-9]/gi) ?? []).length;
    let formatted = formatCnpj(typed);
    const inputType = (event.nativeEvent as InputEvent).inputType;

    // Deleting an inserted separator should still remove the adjacent character.
    if (formatted === cnpj && typed.length < cnpj.length
      && (inputType === "deleteContentBackward" || inputType === "deleteContentForward")) {
      const value = normalizeCnpj(cnpj);
      const index = position - (inputType === "deleteContentBackward" ? 1 : 0);
      if (index >= 0 && index < value.length) {
        formatted = formatCnpj(value.slice(0, index) + value.slice(index + 1));
        position = index;
      }
    }

    let cursor = 0;
    while (position > 0 && cursor < formatted.length) {
      if (/[A-Z0-9]/.test(formatted[cursor])) position -= 1;
      cursor += 1;
    }
    field.value = formatted;
    field.setSelectionRange(cursor, cursor);
    setCnpj(formatted);
    setResult(null);
  }

  async function check(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!validCnpj(cnpj)) {
      setResult({ status: "invalid" });
      field.current?.focus();
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
    <div className="wrap landing-eligibility-grid">
      <div>
        <h2 id="eligibility-title">Seu <span className="landing-ink-word">CNPJ<svg className="landing-ink-underline" viewBox="0 0 140 14" preserveAspectRatio="none" aria-hidden="true">
          <path d="M3 9C34 3 71 3 108 6c10 1 21 2 29 1M67 11c23-2 46-2 62 0" />
        </svg></span> pode emitir pelo Rex?</h2>
        <p className="landing-eligibility-intro">Consulte o município do cadastro e veja se o Rex atende o perfil da sua empresa.</p>
      </div>
      <div className="landing-eligibility-panel">
        <form onSubmit={check} aria-busy={pending}>
          <label htmlFor="eligibility-cnpj">CNPJ da empresa</label>
          <div className="landing-eligibility-fields">
            <input ref={field} id="eligibility-cnpj" value={cnpj} type="text" maxLength={30} autoComplete="off"
              autoCapitalize="characters" spellCheck={false} placeholder="00.000.000/0000-00"
              readOnly={pending} aria-invalid={result?.status === "invalid" || undefined}
              aria-describedby={result?.status === "invalid" ? "eligibility-feedback" : undefined}
              onChange={changeCnpj} />
            <button type="submit" className="btn btn--primary" aria-disabled={pending}>
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
            <p className="landing-eligibility-status" id="eligibility-feedback">{message[0]}</p>
            {"location" in result && (result.location || result.profile) && <p className="landing-eligibility-profile">
              {[result.profile, result.location].filter(Boolean).join(" · ")}
            </p>}
            {detail && <p>{detail}</p>}
          </div>
          {(result.status === "eligible" || (showSupport && supportHref)) && <div className="landing-eligibility-actions">
            {result.status === "eligible" && <a href="#planos" className="btn btn--primary">Ver planos <ArrowRight size={16} aria-hidden="true" /></a>}
            {showSupport && supportHref && <a href={supportHref} className="btn btn--secondary">Fale com nosso time <ArrowRight size={16} aria-hidden="true" /></a>}
          </div>}
        </div>}
      </div>
    </div>
  </section>;
}
