import Link from "next/link";
import Image from "next/image";
import { ArrowDown, ArrowRight, ArrowUpRight, Check, ChevronRight, CircleCheck, FileSpreadsheet, FileText, House, ShieldCheck, Upload } from "lucide-react";
import { Brand } from "@/components/brand";
import { LandingPricing } from "@/components/landing-pricing";

const steps = [
  { title: "Importe o relatório", copy: "Selecione o CSV mensal de comissões da Shopee. O Rex organiza os dados do lote.", Icon: FileSpreadsheet },
  { title: "Confira a prévia", copy: "Revise o tomador, a competência e os valores das notas antes de confirmar.", Icon: ShieldCheck },
  { title: "Acompanhe suas notas", copy: "Veja quais notas foram autorizadas e baixe o XML e o DANFS-e.", Icon: CircleCheck },
];

export default function Home() {
  return <div className="landing">
    <header className="site-masthead">
      <div className="site-width site-masthead-inner">
        <Brand />
        <nav aria-label="Navegação do site" className="landing-nav">
          <a href="#como-funciona">Como funciona</a>
          <a href="#planos">Planos</a>
        </nav>
        <Link href="/entrar" className="btn btn--secondary">Entrar <ArrowUpRight size={16} aria-hidden="true" /></Link>
      </div>
    </header>

    <main id="conteudo">
      <section className="landing-hero" aria-labelledby="hero-heading" data-enter>
        <div className="site-width">
          <div className="landing-hero-grid">
            <div className="landing-hero-copy">
              <p className="landing-kicker"><span aria-hidden="true" /> Para afiliados da Shopee</p>
              <h1 id="hero-heading">Suas NFS-e.<br />Um só lote.</h1>
              <p className="landing-lead">Importe as comissões da Shopee, revise a prévia e emita as notas de uma vez.</p>
              <div className="landing-actions">
                <Link href="/criar-conta" className="btn btn--primary">Criar conta <ArrowUpRight size={19} aria-hidden="true" /></Link>
                <Link href="/prototipo" className="btn btn--secondary">Explorar o painel <ArrowRight size={17} aria-hidden="true" /></Link>
              </div>
              <p className="landing-eligibility"><ShieldCheck size={17} aria-hidden="true" /> Para MEI e empresas do Simples Nacional</p>
            </div>

            <div className="landing-product" data-enter-media>
              <div className="landing-product-header">
                <span>Prévia do painel</span>
                <Image src="/brand/rex-mascote.png" width={76} height={76} alt="" unoptimized priority />
              </div>
              <div className="landing-product-window">
                <div className="landing-product-nav" aria-hidden="true">
                  <span><House size={17} /> Início</span>
                  <span className="is-active"><Upload size={17} /> Notas em lote</span>
                  <span><FileText size={17} /> Notas</span>
                </div>
                <div className="landing-product-content">
                  <div className="landing-product-path"><FileSpreadsheet size={15} aria-hidden="true" /> Notas em lote <ChevronRight size={13} aria-hidden="true" /> Revisão</div>
                  <h2>Comissões de outubro</h2>
                  <dl className="landing-product-totals">
                    <div><dt>Notas previstas</dt><dd>32</dd></div>
                    <div><dt>Total do lote</dt><dd>R$ 784,20</dd></div>
                  </dl>
                  <div className="landing-product-file">
                    <FileSpreadsheet size={20} aria-hidden="true" />
                    <span><strong>comissoes-outubro.csv</strong><small>Relatório da Shopee</small></span>
                    <span className="landing-product-ready"><Check size={13} aria-hidden="true" /> Lido</span>
                  </div>
                  <Link href="/prototipo?tela=revisar" className="btn btn--primary">Revisar lote de exemplo <ArrowRight size={16} aria-hidden="true" /></Link>
                </div>
              </div>
            </div>
          </div>
          <a href="#como-funciona" className="landing-scroll">Veja como funciona <ArrowDown size={17} aria-hidden="true" /></a>
        </div>
      </section>

      <section className="landing-flow" id="como-funciona" aria-labelledby="workflow-heading">
        <div className="site-width">
          <div className="section-intro"><h2 id="workflow-heading">Do relatório à nota fiscal</h2><p>Você revisa os dados antes de confirmar a emissão.</p></div>
          <ol className="landing-steps">
            {steps.map(({ title, copy, Icon }) => <li key={title}><Icon size={24} strokeWidth={1.7} aria-hidden="true" /><h3>{title}</h3><p>{copy}</p></li>)}
          </ol>
        </div>
      </section>
      <LandingPricing />
      <section className="landing-faq" aria-labelledby="faq-title">
        <div className="site-width landing-faq-grid">
          <div className="section-intro"><h2 id="faq-title">Antes de começar</h2></div>
          <div className="landing-questions">
            <details><summary>Qual relatório devo importar?</summary><p>Use o CSV mensal de comissões por vendedor da Shopee.</p></details>
            <details><summary>O que preciso para emitir?</summary><p>Cadastre a empresa, adicione um certificado digital A1 e confira os dados fiscais antes da primeira emissão.</p></details>
            <details><summary>Onde encontro as notas autorizadas?</summary><p>Abra Notas no painel para acompanhar o lote e baixar o XML e o DANFS-e.</p></details>
          </div>
        </div>
      </section>
    </main>
    <footer className="landing-footer"><div className="site-width site-masthead-inner"><Brand /><p>NFS-e em lote para afiliados.</p><Link href="/entrar" className="text-link">Acessar minha conta <ArrowUpRight size={16} aria-hidden="true" /></Link></div></footer>
  </div>;
}
