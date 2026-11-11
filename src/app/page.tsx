import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  Building2,
  Check,
  ChevronRight,
  FileCheck2,
  FileSpreadsheet,
  Files,
  Fingerprint,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import { Brand } from "@/components/brand";

export default function Home() {
  return (
    <>
      <header className="site-header">
        <div className="wrap header-inner">
          <Brand />
          <nav aria-label="Navegação principal">
            <a href="#fluxo" className="nav-link">
              O projeto
            </a>
            <Link href="/entrar" className="btn btn--secondary">
              Acessar minha conta <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </nav>
        </div>
      </header>
      <main id="conteudo">
        <section className="hero" aria-labelledby="hero-heading" data-enter>
          <div className="wrap hero-content">
            <div className="hero-copy">
              <span className="eyebrow">
                <span className="status-dot" />
                Projeto em desenvolvimento
              </span>
              <h1 id="hero-heading">
                NFS-e para{" "}
                <br />
                afiliados<span className="green-period">.</span>
              </h1>
              <p className="hero-lead">
                Suas comissões, empresas e notas em um só lugar. Estamos
                preparando o fluxo de importação, revisão e emissão em lote.
              </p>
              <div className="hero-actions">
                <Link className="btn btn--primary" href="/criar-conta">
                  Criar minha conta <ArrowRight size={18} aria-hidden="true" />
                </Link>
                <a className="text-link" href="#fluxo">
                  Conhecer as etapas <ArrowDown size={16} aria-hidden="true" />
                </a>
              </div>
              <p className="hero-audience">
                <ShieldCheck size={17} aria-hidden="true" /> Para MEI e empresas
                do Simples Nacional
              </p>
            </div>
            <div className="hero-workspace app-frame" data-enter-media>
              <div className="window-bar">
                <div className="window-dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </div>
                <span>Seu espaço de trabalho</span>
                <LockKeyhole size={13} aria-hidden="true" />
              </div>
              <div className="workspace-body">
                <div className="workspace-heading">
                  <div>
                    <span className="overline">Primeiros passos</span>
                    <p className="workspace-title">Uma base para suas notas.</p>
                  </div>
                  <span className="workspace-glyph">
                    <Files size={24} strokeWidth={1.5} aria-hidden="true" />
                  </span>
                </div>
                <div className="setup-step">
                  <span className="step-icon active">
                    <Fingerprint size={20} aria-hidden="true" />
                  </span>
                  <div>
                    <strong>Crie sua conta</strong>
                    <span>O primeiro passo para acessar o Emissor.</span>
                  </div>
                  <ChevronRight size={17} aria-hidden="true" />
                </div>
                <div className="setup-step">
                  <span className="step-icon">
                    <Building2 size={20} aria-hidden="true" />
                  </span>
                  <div>
                    <strong>Cadastre sua empresa</strong>
                    <span>Dados e configurações por CNPJ.</span>
                  </div>
                  <span className="small-status">Em preparação</span>
                </div>
                <div className="setup-step">
                  <span className="step-icon">
                    <FileSpreadsheet size={20} aria-hidden="true" />
                  </span>
                  <div>
                    <strong>Prepare seu primeiro lote</strong>
                    <span>Importação e revisão de comissões.</span>
                  </div>
                  <span className="small-status">Em preparação</span>
                </div>
                <div className="workspace-note">
                  <span className="note-line" />
                  <p>
                    A emissão fiscal será liberada após as validações e a
                    homologação da integração.
                  </p>
                </div>
              </div>
              <div className="workspace-footer">
                <span className="status-dot" /> Cada etapa, antes da próxima
                nota.
              </div>
            </div>
            <div className="hero-bottom">
              <span>O projeto contempla comissões de</span>
              <div className="platform-names">
                <span>Shopee</span>
                <span>TikTok Shop</span>
                <span>Mercado Livre</span>
              </div>
              <span className="mono">01 / Fundação</span>
            </div>
          </div>
        </section>
        <section
          id="fluxo"
          className="workflow-section"
          aria-labelledby="workflow-heading"
        >
          <div className="wrap">
            <div className="section-heading">
              <span className="eyebrow">O fluxo que estamos construindo</span>
              <h2 id="workflow-heading">
                Da comissão ao documento.
                <br />
                <span>Com revisão em cada etapa.</span>
              </h2>
              <p>
                A conta é o começo. Os próximos módulos vão conectar seus
                relatórios à emissão, preservando a origem de cada valor.
              </p>
            </div>
            <ol className="workflow-grid">
              <li>
                <span className="workflow-number mono">01</span>
                <FileSpreadsheet
                  size={30}
                  strokeWidth={1.4}
                  aria-hidden="true"
                />
                <h3>Importar comissões</h3>
                <p>
                  Adaptadores por plataforma, com leitura de arquivos e
                  identificação de pendências.
                </p>
                <span className="workflow-tag">Planejado</span>
              </li>
              <li>
                <span className="workflow-number mono">02</span>
                <ShieldCheck size={30} strokeWidth={1.4} aria-hidden="true" />
                <h3>Revisar os tomadores</h3>
                <p>
                  Prévia por empresa e competência, com confirmação antes de
                  solicitar a emissão.
                </p>
                <span className="workflow-tag">Planejado</span>
              </li>
              <li>
                <span className="workflow-number mono">03</span>
                <FileCheck2 size={30} strokeWidth={1.4} aria-hidden="true" />
                <h3>Acompanhar as notas</h3>
                <p>
                  Processamento em segundo plano e acompanhamento do resultado
                  fiscal de cada documento.
                </p>
                <span className="workflow-tag">Planejado</span>
              </li>
            </ol>
            <div className="workflow-end">
              <span>
                <Check size={17} aria-hidden="true" /> A emissão real ainda não
                está disponível.
              </span>
              <Link className="text-link" href="/entrar">
                Acessar minha conta <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>
      </main>
      <footer className="site-footer">
        <div className="wrap">
          <Brand />
          <p>NFS-e para afiliados PJ.</p>
          <span>Em desenvolvimento</span>
        </div>
      </footer>
    </>
  );
}
