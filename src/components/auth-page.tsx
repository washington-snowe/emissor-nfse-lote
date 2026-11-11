import Link from "next/link";
import { ArrowLeft, Check, LockKeyhole } from "lucide-react";
import { Brand } from "@/components/brand";
import { AuthForm } from "@/components/auth-form";

export function AuthPage({
  signup,
  ready,
  confirmationError = false,
}: {
  signup: boolean;
  ready: boolean;
  confirmationError?: boolean;
}) {
  return (
    <main id="conteudo" className="auth-layout">
      <aside className="auth-story">
        <Brand inverse />
        <div>
          <span className="eyebrow">Seu espaço de trabalho</span>
          <h2>
            O começo de uma
            <br />
            rotina mais organizada.
          </h2>
          <p>
            Uma conta para acompanhar a preparação das suas empresas, comissões
            e notas.
          </p>
          <ul>
            <li>
              <Check size={18} aria-hidden="true" /> Foco em afiliados PJ
            </li>
            <li>
              <Check size={18} aria-hidden="true" /> Empresas com configurações
              independentes
            </li>
            <li>
              <Check size={18} aria-hidden="true" /> Revisão antes de cada
              emissão
            </li>
          </ul>
        </div>
        <span className="auth-story-footer">
          Emissor · Projeto em desenvolvimento
        </span>
      </aside>
      <div className="auth-main">
        <Link className="text-link back-link" href="/">
          <ArrowLeft size={16} aria-hidden="true" /> Voltar ao início
        </Link>
        <div className="auth-card">
          <span className="auth-lock">
            <LockKeyhole size={22} aria-hidden="true" />
          </span>
          <h1>{signup ? "Crie sua conta." : "Acesse sua conta."}</h1>
          <p>
            {signup
              ? "Comece pelo seu e-mail e uma senha."
              : "Entre para acessar seu espaço de trabalho."}
          </p>
          {confirmationError && (
            <p className="field-error" role="alert">
              Não foi possível confirmar o acesso. O link pode ter expirado ou
              ter sido aberto em outro navegador. Solicite um novo acesso pelo
              cadastro.
            </p>
          )}
          {ready ? (
            <AuthForm signup={signup} />
          ) : (
            <div className="setup-notice" role="status">
              <strong>Acesso em preparação</strong>
              <p>
                Estamos configurando o serviço de contas. O cadastro e o login
                ainda não estão disponíveis.
              </p>
              <Link className="text-link" href="/">
                Acompanhar o projeto <ArrowLeft size={16} aria-hidden="true" />
              </Link>
            </div>
          )}
        </div>
        <p className="auth-footnote">
          A emissão de notas ainda não está disponível nesta versão.
        </p>
      </div>
    </main>
  );
}
