"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  LoaderCircle,
  Search,
} from "lucide-react";
import {
  emptyCompany,
  normalizeCnpj,
  validCnpj,
  type CompanyDraft,
} from "@/lib/companies";
import { consultCompany, saveCompany } from "@/app/painel/empresas/actions";

export function CompanyForm({
  initial = emptyCompany,
  companyId,
}: {
  initial?: CompanyDraft;
  companyId?: string;
}) {
  const [draft, setDraft] = useState(initial);
  const [lookupState, setLookupState] = useState<
    "idle" | "loading" | "manual" | "loaded"
  >(companyId ? "manual" : "idle");
  const [lookupMessage, setLookupMessage] = useState("");
  const [error, setError] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const generation = useRef(0);
  const attempted = useRef("");
  const router = useRouter();

  async function lookup(cnpj: string) {
    const version = ++generation.current;
    attempted.current = cnpj;
    setLookupState("loading");
    setLookupMessage("");
    try {
      const result = await consultCompany(cnpj);
      if (generation.current !== version) return;
      if (result.data) {
        setDraft(result.data);
        setLookupState("loaded");
        setLookupMessage(
          "Dados preenchidos pela BrasilAPI. Revise antes de salvar.",
        );
      } else {
        setLookupState("manual");
        setLookupMessage(result.error);
      }
    } catch {
      if (generation.current === version) {
        setLookupState("manual");
        setLookupMessage(
          "A consulta está indisponível. Preencha os dados manualmente.",
        );
      }
    }
  }

  useEffect(() => {
    if (
      companyId ||
      !validCnpj(draft.cnpj) ||
      attempted.current === draft.cnpj ||
      lookupState === "manual"
    )
      return;
    const timer = setTimeout(() => {
      void lookup(draft.cnpj);
    }, 500);
    return () => clearTimeout(timer);
  }, [draft.cnpj, companyId, lookupState]);

  const showFields =
    validCnpj(draft.cnpj) && ["manual", "loaded"].includes(lookupState);
  const field = (
    name: keyof CompanyDraft,
    label: string,
    options: { required?: boolean; type?: string; max?: number } = {},
  ) => (
    <div className="field" key={name}>
      <label htmlFor={name}>
        {label}
        {options.required ? " *" : ""}
      </label>
      <input
        id={name}
        name={name}
        type={options.type ?? "text"}
        value={String(draft[name] ?? "")}
        maxLength={options.max ?? 200}
        required={options.required}
        onChange={(e) =>
          setDraft((old) => ({ ...old, [name]: e.target.value }))
        }
        aria-invalid={!!errors[name]}
        aria-describedby={errors[name] ? `${name}-error` : undefined}
      />
      <p className="field-error" id={`${name}-error`}>
        {errors[name]}
      </p>
    </div>
  );

  return (
    <form
      className="company-form"
      onSubmit={(event) => {
        event.preventDefault();
        setError("");
        setErrors({});
        startTransition(async () => {
          try {
            const result = await saveCompany(draft, companyId);
            if (result.id) {
              router.push("/painel/empresas?salvo=1");
              router.refresh();
            } else {
              setError(result.error ?? "Não foi possível salvar.");
              setErrors(result.fields ?? {});
              const first = Object.keys(result.fields ?? {})[0];
              if (first) document.getElementById(first)?.focus();
            }
          } catch {
            setError("Não foi possível salvar. Tente novamente.");
          }
        });
      }}
    >
      <div className="company-search">
        <span className="step-label">01 · Identificação</span>
        <h2>Comece pelo CNPJ.</h2>
        <p>Preenchemos os dados disponíveis para você conferir.</p>
        <div className="field cnpj-field">
          <label htmlFor="cnpj">CNPJ</label>
          <div className="cnpj-input">
            <input
              id="cnpj"
              name="cnpj"
              value={draft.cnpj}
              type="text"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              maxLength={18}
              readOnly={!!companyId}
              required
              aria-invalid={!!errors.cnpj}
              aria-describedby="cnpj-help cnpj-error"
              onChange={(e) => {
                generation.current++;
                attempted.current = "";
                setDraft({
                  ...emptyCompany,
                  cnpj: normalizeCnpj(e.target.value),
                });
                setLookupState("idle");
                setLookupMessage("");
                setErrors({});
              }}
            />
            <button
              className="btn btn--secondary"
              type="button"
              disabled={
                !validCnpj(draft.cnpj) || lookupState === "loading" || pending
              }
              onClick={() => void lookup(draft.cnpj)}
            >
              {lookupState === "loading" ? (
                <LoaderCircle
                  className="spinner"
                  size={17}
                  aria-hidden="true"
                />
              ) : (
                <Search size={17} aria-hidden="true" />
              )}{" "}
              Consultar
            </button>
          </div>
          <p className="field-hint" id="cnpj-help">
            A consulta começa ao completar um CNPJ válido. Alterar o CNPJ
            reinicia os dados do formulário.
          </p>
          <p className="field-error" id="cnpj-error">
            {errors.cnpj ||
              (draft.cnpj.length === 14 && !validCnpj(draft.cnpj)
                ? "Confira os dígitos do CNPJ."
                : "")}
          </p>
        </div>
        <p className="lookup-status" role="status" aria-live="polite">
          {lookupState === "loading"
            ? "Consultando os dados cadastrais…"
            : lookupMessage}
        </p>
        {validCnpj(draft.cnpj) && !showFields && (
          <button
            type="button"
            className="text-link plain-button"
            onClick={() => {
              generation.current++;
              attempted.current = draft.cnpj;
              setLookupState("manual");
              setLookupMessage(
                "Você pode preencher os dados disponíveis manualmente.",
              );
            }}
          >
            Preencher manualmente <ArrowRight size={16} aria-hidden="true" />
          </button>
        )}
      </div>
      {showFields && (
        <>
          <div className="company-review">
            <div className="review-heading">
              <span className="step-label">02 · Revisão</span>
              {lookupState === "loaded" && (
                <span className="source-tag">
                  <Check size={15} aria-hidden="true" /> Dados preenchidos
                </span>
              )}
            </div>
            <h2>Confira sua empresa.</h2>
            <p className="company-intro">
              Você pode ajustar os campos. Os dados salvos são cadastrais e não
              liberam a emissão fiscal.
            </p>
            <div className="form-grid">
              {field("legal_name", "Razão social", { required: true })}
              {field("trade_name", "Nome fantasia")}
              <div className="field">
                <label htmlFor="tax_regime">Enquadramento declarado *</label>
                <select
                  id="tax_regime"
                  value={draft.tax_regime}
                  required
                  onChange={(e) =>
                    setDraft((old) => ({ ...old, tax_regime: e.target.value }))
                  }
                  aria-invalid={!!errors.tax_regime}
                  aria-describedby="tax_regime-help tax_regime-error"
                >
                  <option value="">Selecione o enquadramento</option>
                  <option value="mei">MEI</option>
                  <option value="simples">ME / EPP do Simples Nacional</option>
                </select>
                <p className="field-hint" id="tax_regime-help">
                  Confirme o enquadramento atual. Empresas do regime normal não
                  são atendidas.
                </p>
                <p className="field-error" id="tax_regime-error">
                  {errors.tax_regime}
                </p>
              </div>
              {field("registration_status", "Situação cadastral", { max: 100 })}
              {field("email", "E-mail da empresa", { type: "email", max: 254 })}
              {field("phone", "Telefone", { max: 30 })}
            </div>
            <h3>Endereço</h3>
            <div className="form-grid">
              {field("postal_code", "CEP (somente números)", { max: 8 })}
              {field("street", "Logradouro")}
              {field("number", "Número", { max: 30 })}
              {field("complement", "Complemento", { max: 150 })}
              {field("district", "Bairro", { max: 100 })}
              {field("city", "Município", { max: 100 })}
              {field("state", "UF", { max: 2 })}
              {field("municipality_code", "Código IBGE do município", {
                max: 7,
              })}
            </div>
            <details className="company-details">
              <summary>Atividades e dados complementares</summary>
              <div className="form-grid">
                {field("main_cnae", "CNAE principal", { max: 7 })}
                {field("main_cnae_description", "Descrição do CNAE", {
                  max: 300,
                })}
                {field("legal_nature", "Natureza jurídica", { max: 150 })}
                {field("company_size", "Porte", { max: 100 })}
                {field("opened_on", "Data de abertura", {
                  type: "date",
                  max: 10,
                })}
                {field("secondary_phone", "Outro telefone", { max: 30 })}
              </div>
              {draft.secondary_cnaes.length > 0 && (
                <>
                  <h3>Atividades secundárias</h3>
                  <ul className="cnae-list">
                    {draft.secondary_cnaes.map((item, i) => (
                      <li key={`${item.code}-${i}`}>
                        <span className="mono">{item.code}</span>{" "}
                        {item.description}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </details>
          </div>
          <div className="company-save">
            <p className="field-error" role="alert">
              {error}
            </p>
            <div className="company-save-actions">
              <Link className="text-link" href="/painel/empresas">
                <ArrowLeft size={16} aria-hidden="true" /> Voltar às empresas
              </Link>
              <button
                className="btn btn--primary"
                type="submit"
                disabled={pending || lookupState === "loading"}
              >
                {pending ? (
                  <>
                    <LoaderCircle
                      className="spinner"
                      size={17}
                      aria-hidden="true"
                    />{" "}
                    Salvando…
                  </>
                ) : (
                  <>
                    {companyId ? "Salvar alterações" : "Salvar empresa"}
                    <Check size={17} aria-hidden="true" />
                  </>
                )}
              </button>
            </div>
          </div>
        </>
      )}
    </form>
  );
}
