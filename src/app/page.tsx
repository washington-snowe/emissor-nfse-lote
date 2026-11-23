import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ArrowUpRight, Check, FileCheck2, FileSpreadsheet, FileText, ShieldCheck, Upload } from "lucide-react";
import { Brand } from "@/components/brand";
import { LandingPricing } from "@/components/landing-pricing";

const steps = [
  { title: "Importe o CSV", copy: "Envie o relatório mensal da Shopee. O Rex identifica os valores e organiza as notas do lote.", Icon: FileSpreadsheet },
  { title: "Revise e confirme", copy: "Confira competência, tomador e valores em uma única revisão antes de emitir.", Icon: ShieldCheck },
  { title: "Acompanhe a emissão", copy: "Veja o resultado de cada nota, baixe o XML e o DANFS-e e acompanhe o envio ao vendedor.", Icon: FileCheck2 },
];

export default function Home() {
  return (
    <div className="rex-site">
      <header className="rex-site-header">
        <div className="rex-wrap rex-header-inner">
          <Brand />
          <nav aria-label="Navegação principal">
            <a href="#como-funciona">Como funciona</a><a href="#planos">Planos</a>
            <Link href="/entrar" className="btn btn--secondary">Entrar <ArrowUpRight size={16} aria-hidden="true" /></Link>
          </nav>
        </div>
      </header>
      <main id="conteudo">
        <section className="rex-hero" aria-labelledby="hero-heading" data-enter>
          <div className="rex-wrap rex-hero-grid">
            <div className="rex-hero-copy">
              <p className="rex-hero-label"><span /> Para afiliados da Shopee</p>
              <h1 id="hero-heading">Emita suas notas em lote.</h1>
              <p>Importe o relatório de comissões, revise os dados e emita suas NFS-e pelo Rex.</p>
              <div className="rex-hero-actions">
                <Link href="/criar-conta" className="btn rex-btn-light">Criar conta <ArrowUpRight size={18} aria-hidden="true" /></Link>
                <a href="#como-funciona" className="rex-hero-link">Como funciona <ArrowRight size={16} aria-hidden="true" /></a>
              </div>
              <p className="rex-hero-audience"><ShieldCheck size={16} aria-hidden="true" /> Para MEI e empresas do Simples Nacional</p>
            </div>
            <div className="rex-hero-visual" data-enter-media>
              <div className="rex-hero-paper">
                <div className="rex-preview-head"><span><FileText size={18} aria-hidden="true" /> Visão do lote</span><span className="rex-preview-status"><Check size={13} aria-hidden="true" /> Autorizado</span></div>
                <div className="rex-preview-body">
                  <span className="rex-preview-label">Relatório de comissões</span>
                  <strong>Outubro</strong>
                  <div className="rex-preview-stats"><div><span>Notas autorizadas</span><b>32</b></div><div><span>Total do lote</span><b>R$ 784,20</b></div></div>
                  <div className="rex-preview-rows">
                    <span><Check size={16} aria-hidden="true" /> Relatório importado</span>
                    <span><Check size={16} aria-hidden="true" /> Lote revisado</span>
                    <span><Check size={16} aria-hidden="true" /> XML e DANFS-e disponíveis</span>
                  </div>
                </div>
              </div>
              <div className="rex-hero-mascot">
                <Image src="/brand/rex-mascote.png" width={160} height={160} alt="" unoptimized priority />
              </div>
            </div>
          </div>
        </section>
        <section className="rex-workflow" id="como-funciona" aria-labelledby="workflow-heading">
          <div className="rex-wrap">
            <div className="rex-section-head">
              <div><h2 id="workflow-heading">Do relatório à NFS-e.</h2><p>Prepare um lote com os dados que você já tem no relatório da Shopee.</p></div>
              <Link href="/criar-conta" className="text-link">Criar conta <ArrowRight size={16} aria-hidden="true" /></Link>
            </div>
            <ol className="rex-step-grid">
              {steps.map(({ title, copy, Icon }) => <li key={title}><span className="rex-step-icon"><Icon size={24} strokeWidth={1.7} aria-hidden="true" /></span><h3>{title}</h3><p>{copy}</p></li>)}
            </ol>
            <div className="rex-workflow-note"><Upload size={20} aria-hidden="true" /><p>Já tem seu CSV? Comece pelo relatório do mês que quer emitir.</p></div>
          </div>
        </section>
        <LandingPricing />
        <section className="rex-faq" aria-labelledby="faq-title">
          <div className="rex-wrap rex-faq-inner">
            <h2 id="faq-title">Antes de começar</h2>
            <div>
              <details><summary>Qual relatório devo importar?</summary><p>Use o CSV do relatório mensal de comissões da Shopee.</p></details>
              <details><summary>O que preciso para emitir?</summary><p>Cadastre a empresa, configure o certificado digital A1 e confira os dados fiscais antes da primeira emissão.</p></details>
              <details><summary>Onde encontro as notas autorizadas?</summary><p>Abra Notas no painel para acompanhar o lote e baixar o XML e o DANFS-e.</p></details>
            </div>
          </div>
        </section>
      </main>
      <footer className="rex-site-footer"><div className="rex-wrap"><Brand /><p>NFS-e em lote para afiliados.</p><Link href="/entrar">Acessar minha conta <ArrowUpRight size={16} aria-hidden="true" /></Link></div></footer>
    </div>
  );
}
