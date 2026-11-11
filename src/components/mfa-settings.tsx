"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { enrollTotp, verifyTotp, disableTotp } from "@/app/painel/seguranca/actions";

export function MfaSettings({ verifiedFactor }: { verifiedFactor?: string }) {
  const router = useRouter();
  const [enrollment, setEnrollment] = useState<{ factorId: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [successful, setSuccessful] = useState(false);
  const [pending, start] = useTransition();
  return <section className="report-form"><h2>Verificação em duas etapas.</h2>
    <p className="field-hint">O autenticador é obrigatório para cadastrar A1 e confirmar operações fiscais.</p>
    {verifiedFactor ? <p className="save-notice">Autenticador ativo nesta conta.</p> : !enrollment && <button className="btn btn--primary report-back" disabled={pending} onClick={() => start(async () => {
      setSuccessful(false);
      try {
        const result = await enrollTotp();
        if (result.factorId && result.qr && result.secret) { setEnrollment({ factorId: result.factorId, qr: result.qr, secret: result.secret }); setMessage(""); }
        else setMessage(result.error ?? "Não foi possível iniciar.");
      } catch { setMessage("Não foi possível iniciar o cadastro do autenticador."); }
    })}>Configurar autenticador</button>}
    {enrollment && <div className="mfa-enrollment">
      <p>Leia o QR code no seu aplicativo autenticador e confirme o código de seis dígitos.</p>
      <p className="field-hint">Guarde a chave de configuração no seu gerenciador de senhas para recuperar o autenticador, se precisar.</p>
      {/* Supabase-generated SVG stays an image, never executable inline HTML. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={enrollment.qr} alt="QR code para cadastrar seu autenticador" width={240} height={240} />
      <details><summary>Usar chave de configuração manual</summary><p className="mono">{enrollment.secret}</p></details>
    </div>}
    {(enrollment || verifiedFactor) && <form className="auth-form" onSubmit={event => {
      event.preventDefault();
      start(async () => {
        setSuccessful(false);
        try {
          const result = verifiedFactor ? await disableTotp(verifiedFactor, code) : await verifyTotp(enrollment!.factorId, code);
          setCode("");
          if (result.error) setMessage(result.error);
          else { setSuccessful(true); setEnrollment(null); setMessage(verifiedFactor ? "Autenticador desativado. O cadastro de A1 e as confirmações ficam bloqueados até reativá-lo." : "Verificação em duas etapas ativada."); router.refresh(); }
        } catch { setMessage("Não foi possível confirmar. Tente novamente."); }
      });
    }}>
      <div className="field"><label htmlFor="mfa-code">{verifiedFactor ? "Código atual para desativar" : "Código do autenticador"}</label><input id="mfa-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} minLength={6} required value={code} onChange={event => setCode(event.target.value)} /></div>
      <button className="btn btn--secondary" disabled={pending} type="submit">{pending ? "Confirmando…" : verifiedFactor ? "Desativar autenticador" : "Confirmar autenticador"}</button>
    </form>}
    <p role="status" className={successful ? "form-success" : "field-error"}>{message}</p>
  </section>;
}
