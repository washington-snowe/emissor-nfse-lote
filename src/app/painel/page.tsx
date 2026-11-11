import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowUpRight,
  Building2,
  FileSpreadsheet,
  LayoutDashboard,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { createSupabaseClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenancy";
import { signOut } from "@/app/auth/actions";

export const metadata: Metadata = { title: "Meu espaço" };
export const dynamic = "force-dynamic";

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const supabase = await createSupabaseClient();
  if (!supabase) redirect("/entrar");
  const context = await getTenantContext(supabase);
  if (context.status === "unauthenticated") redirect("/entrar");
  if (context.status !== "ready") {
    throw new Error("Workspace initialization unavailable.");
  }
  const { status } = await searchParams;
  return (
    <div className="dashboard-shell">
      <aside className="sidebar">
        <Brand />
        <nav aria-label="Seu espaço">
          <span className="sidebar-label">Área de trabalho</span>
          <Link href="/painel" className="sidebar-active" aria-current="page">
            <LayoutDashboard size={19} aria-hidden="true" /> Visão geral
          </Link>
        </nav>
        <div className="sidebar-bottom">
          <span className="small-status">Versão inicial</span>
          <form action={signOut}>
            <button className="btn btn--secondary" type="submit">
              <LogOut size={17} aria-hidden="true" /> Sair da conta
            </button>
          </form>
        </div>
      </aside>
      <main id="conteudo" className="dashboard-main">
        <header className="dashboard-header">
          <span>Seu espaço de trabalho</span>
          <span className="user-email">{context.user.email}</span>
        </header>
        <div className="dashboard-content">
          <span className="eyebrow">Primeiros passos</span>
          <h1>Sua conta é o começo.</h1>
          <p>
            O acesso foi confirmado. Os módulos de empresas e emissão estão em
            preparação.
          </p>
          {status === "logout-error" && (
            <p className="field-error" role="alert">
              Não foi possível encerrar a sessão. Tente sair novamente.
            </p>
          )}
          <section className="dashboard-welcome" aria-labelledby="next-steps">
            <span className="welcome-icon">
              <Building2 size={36} strokeWidth={1.4} aria-hidden="true" />
            </span>
            <h2 id="next-steps">O próximo passo é sua empresa.</h2>
            <p>
              O cadastro de CNPJs e as configurações fiscais serão
              disponibilizados na próxima etapa de desenvolvimento.
            </p>
            <span className="pill">
              <span className="status-dot" /> Em preparação
            </span>
          </section>
          <div className="dashboard-info">
            <div>
              <FileSpreadsheet size={24} aria-hidden="true" />
              <h2>Comissões e relatórios</h2>
              <p>
                A importação será liberada após a validação dos layouts de cada
                plataforma.
              </p>
            </div>
            <div>
              <ShieldCheck size={24} aria-hidden="true" />
              <h2>Emissão fiscal</h2>
              <p>
                A integração precisa de homologação antes de transmitir
                documentos reais.
              </p>
            </div>
          </div>
          <Link className="text-link" href="/">
            Conhecer o projeto <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </main>
    </div>
  );
}
