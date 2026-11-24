import Image from "next/image";
import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUpRight, ChevronDown } from "lucide-react";
import { Brand } from "@/components/brand";
import { LandingPricing } from "@/components/landing-pricing";
import "./landing.css";

const steps = [
  { title: "Importe o CSV", copy: "Use o relatório mensal de comissões por vendedor da Shopee." },
  { title: "Revise o lote", copy: "Confira o tomador, a competência, os valores e o e-mail de entrega." },
  { title: "Emita e acompanhe", copy: "Confirme a emissão e baixe o XML e o DANFS-e das notas autorizadas." },
];

const answers = [
  { question: "Quem pode usar o Rex?", answer: "O Rex atende afiliados da Shopee que emitem NFS-e como MEI ou empresa do Simples Nacional." },
  { question: "Qual arquivo devo usar?", answer: "Exporte o relatório mensal de comissões por vendedor da Shopee no formato CSV." },
  { question: "Preciso de certificado digital?", answer: "Sim. Cadastre a empresa e adicione o certificado digital A1 para verificar o acesso à emissão." },
  { question: "As notas são enviadas aos vendedores?", answer: "Na revisão de um lote em produção, confira os endereços e autorize a entrega. Você pode acompanhar o status do e-mail no painel." },
  { question: "Onde encontro os documentos?", answer: "Na página Notas, você pode acompanhar a emissão e baixar o XML e o DANFS-e das notas autorizadas." },
];

export default function Home() {
  return <div className="landing">
    <header className="site-masthead landing-header">
      <div className="site-width landing-header-inner">
        <Brand />
        <nav aria-label="Navegação do site" className="landing-nav">
          <a href="#como-funciona">Como funciona</a>
          <a href="#planos">Preços</a>
          <a href="#simulador">Simulador</a>
        </nav>
        <Link href="/entrar" className="btn btn--primary">Entrar <ArrowUpRight size={16} aria-hidden="true" /></Link>
      </div>
    </header>

    <main id="conteudo">
      <section className="landing-hero" aria-labelledby="hero-heading">
        <div className="site-width landing-hero-grid">
          <div className="landing-hero-copy">
            <h1 id="hero-heading">
              Suas NFS-e.<br />Um só <span className="landing-circled-word">
                lote
                <svg viewBox="0 0 262 124" preserveAspectRatio="none" aria-hidden="true">
                  <path pathLength={1} d="M208 14C175 3 117 4 72 13 27 22 5 41 8 64c4 31 49 49 111 52 64 3 121-18 133-45 13-30-28-54-74-61-17-3-48-5-71-2" />
                </svg>
              </span>.
            </h1>
            <p className="landing-lead">Importe suas comissões da Shopee, revise os dados e emita as notas de uma vez.</p>
            <div className="landing-actions">
              <Link href="/criar-conta" className="btn btn--primary">Criar conta <ArrowUpRight size={18} aria-hidden="true" /></Link>
              <a href="#planos" className="btn btn--secondary">Explorar valores <ArrowDown size={17} aria-hidden="true" /></a>
            </div>
          </div>

          <div className="landing-mascot">
            <Image src="/brand/rex-mascote.png" width={1254} height={1254}
              alt="Rex, o dinossauro de óculos escuros" sizes="(max-width: 720px) 84vw, 42vw" preload />
          </div>
        </div>
      </section>

      <section className="landing-flow" id="como-funciona" aria-labelledby="workflow-heading">
        <div className="site-width">
          <div className="landing-section-head">
            <h2 id="workflow-heading">Do CSV à nota fiscal</h2>
            <Link href="/prototipo?tela=revisar" className="text-link">Testar a revisão <ArrowRight size={16} aria-hidden="true" /></Link>
          </div>
          <ol className="landing-steps">
            {steps.map(({ title, copy }) => <li key={title}>
              <div><h3>{title}</h3><p>{copy}</p></div>
            </li>)}
          </ol>
        </div>
      </section>

      <LandingPricing />

      <section className="landing-faq" aria-labelledby="faq-title">
        <div className="site-width landing-faq-grid">
          <h2 id="faq-title">Dúvidas<br className="landing-faq-break" /> frequentes</h2>
          <div className="landing-questions">
            {answers.map(({ question, answer }) => <details key={question} name="landing-faq">
              <summary>{question}<ChevronDown size={17} aria-hidden="true" /></summary>
              <p>{answer}</p>
            </details>)}
          </div>
        </div>
      </section>
    </main>
    <footer className="landing-footer">
      <div className="site-width site-masthead-inner">
        <Brand />
        <a href="#conteudo" className="text-link">Voltar ao topo</a>
      </div>
    </footer>
  </div>;
}
