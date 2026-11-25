import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowDown, ArrowUpRight, ChevronDown } from "lucide-react";
import { LandingEligibility } from "@/components/landing-eligibility";
import { LandingFooter } from "@/components/landing-footer";
import { LandingHeader } from "@/components/landing-header";
import { LandingMotion } from "@/components/landing-motion";
import { LandingPricing } from "@/components/landing-pricing";
import { LandingReportPreview } from "@/components/landing-report-preview";
import { money, plans } from "@/lib/billing/catalog";
import { getPublicContact } from "@/lib/public-contact";
import "./landing.css";
import "./landing-motion.css";

const homeUrl = "https://www.rexnotas.com.br";
const shareImage = `${homeUrl}/brand/rex-mascote.png`;
export const metadata: Metadata = {
  alternates: { canonical: homeUrl },
  openGraph: {
    type: "website",
    url: homeUrl,
    siteName: "Rex Notas",
    title: "Rex Notas — NFS-e em lote para afiliados",
    description: "Revise e emita NFS-e em lote a partir do relatório mensal de comissões da Shopee.",
    images: [{ url: shareImage, alt: "Rex, o mascote do Rex Notas" }],
  },
  twitter: { card: "summary_large_image", images: [shareImage] },
};

const steps = [
  { title: "Importe seu relatório", copy: "Selecione o CSV mensal de comissões por vendedor da Shopee." },
  { title: "Confira a prévia", copy: "Revise o tomador, a competência, os valores e os endereços de envio." },
  { title: "Emita tudo em lote", copy: "Confirme a emissão e acompanhe as notas autorizadas no painel." },
];

const arrows = [
  ["M3 17C16 7 33 8 51 13", "M42 5Q48 8 52 13Q47 17 40 19"],
  ["M3 10C16 18 32 19 51 12", "M40 7Q47 8 52 12Q48 17 42 20"],
];

const answers = [
  { question: "Quem o Rex Notas atende?", answer: <>Afiliados da Shopee que precisam emitir NFS-e com um CNPJ. <a href="#consultar-cnpj">Consulte seu CNPJ</a> para ver o enquadramento e as etapas de liberação.</> },
  { question: "Sou afiliado pessoa física, posso usar?", answer: "Você pode consultar os planos e usar o simulador. Para emitir pelo Rex, é preciso cadastrar uma empresa com CNPJ e o certificado A1 dela." },
  { question: "Preciso de certificado digital A1 para emissão em lote?", answer: "Sim. O A1 precisa estar válido e vinculado ao CNPJ que vai emitir. O Rex usa o certificado para assinar as declarações e se conectar ao serviço fiscal." },
  { question: "Preciso digitar nota por nota?", answer: "Importe o CSV mensal de comissões por vendedor. O Rex prepara a prévia do lote para você revisar os valores, os dados fiscais e os e-mails antes de confirmar." },
  { question: "E a nota da comissão que a própria Shopee me paga?", answer: "Quando a Shopee for a tomadora, confira os dados e as instruções da plataforma para essa nota. A emissão em produção pelo Rex parte do relatório mensal de comissões por vendedor. Para emitir uma nota individual desse outro pagamento, siga as orientações da Shopee e use o emissor aplicável à sua empresa." },
  { question: "As notas são enviadas automaticamente no e-mail do vendedor?", answer: "Sim. Depois que a nota é autorizada e você confirma os destinatários na revisão, o Rex coloca o XML e o DANFS-e na fila de envio. O painel mostra o status de cada e-mail." },
  { question: "Quanto custa o Rex Notas?", answer: <>O Start custa {money(plans[0].monthlyCents)} por mês no plano mensal e inclui {plans[0].includedNotes} notas por mês. O anual tem 20% de desconto e cobrança anual. <a href="#planos">Compare as franquias e os excedentes</a>.</> },
  { question: "Posso fazer tudo pelo celular?", answer: "O painel funciona no navegador do celular. Tenha o CSV, o arquivo do A1 e a senha do certificado no dispositivo para concluir a configuração e importar o relatório." },
  { question: "Qual relatório preciso importar?", answer: <>Exporte o relatório mensal de comissões por vendedor da Shopee no formato CSV. Você pode experimentar com ele no <a href="#simulador">simulador de notas</a>.</> },
  { question: "A consulta do CNPJ já libera a emissão?", answer: "A consulta mostra se o Rex atende o perfil da empresa. A emissão depende do cadastro, do A1, da configuração fiscal e da liberação para o ambiente de produção." },
  { question: "Onde baixo as notas emitidas?", answer: "Em Notas, você acompanha cada emissão e baixa o XML e o DANFS-e das notas autorizadas." },
  { question: "Posso usar mais de um CNPJ na mesma conta?", answer: "Sim. Todos os planos permitem cadastrar mais de uma empresa. Os documentos e o certificado ficam associados a cada CNPJ, e a franquia de notas é do plano contratado." },
];

export default function Home() {
  return <div className="landing" data-landing-motion>
    <LandingMotion />
    <LandingHeader />
    <main id="conteudo">
      <section className="landing-hero" aria-labelledby="hero-heading">
        <div className="wrap landing-hero-grid">
          <div className="landing-hero-copy">
            <h1 id="hero-heading">
              Emissor de NFS-e<br />em <span className="landing-circled-word">
                lote
                <svg viewBox="0 0 262 124" preserveAspectRatio="none" aria-hidden="true">
                  <path pathLength={1} d="M208 14C175 3 117 4 72 13 27 22 5 41 8 64c4 31 49 49 111 52 64 3 121-18 133-45 13-30-28-54-74-61-17-3-48-5-71-2" />
                </svg>
              </span>
            </h1>
            <div className="landing-hero-context">
              <p className="landing-hero-promise">Simples e completo. Para você focar no que realmente importa.</p>
              <Image className="landing-shopee" src="/brand/shopee.svg" width={104} height={33} alt="Shopee" />
            </div>
            <div className="landing-actions">
              <Link href="/criar-conta" className="btn btn--primary">Criar conta <ArrowUpRight size={18} aria-hidden="true" /></Link>
              <a href="#planos" className="btn btn--secondary">Explorar valores <ArrowDown size={17} aria-hidden="true" /></a>
            </div>
          </div>

          <div className="landing-mascot">
            <div className="landing-mascot-art">
              <Image src="/brand/rex-mascote.png" width={1254} height={1254}
                alt="Rex, o dinossauro de óculos escuros" sizes="(max-width: 720px) 94vw, (max-width: 1200px) 50vw, 710px" preload />
              <svg className="landing-glasses" viewBox="0 0 627 627" aria-hidden="true">
                <defs>
                  <clipPath id="rex-lenses">
                    <path d="M198 123Q209 119 232 129L284 147C278 169 257 187 235 186C211 184 195 166 194 146Q193 134 198 123Z" />
                    <path d="M300 152L391 181C380 207 363 218 344 218C320 218 300 204 295 181C293 169 295 160 300 152Z" />
                  </clipPath>
                </defs>
                <g clipPath="url(#rex-lenses)">
                  <path className="landing-glasses-sweep" d="M153 237L263 102M173 238L282 104" />
                </g>
              </svg>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-flow" id="como-funciona" aria-labelledby="workflow-title">
        <div className="wrap">
          <h2 id="workflow-title" data-landing-reveal="heading">Emissão em três passos</h2>
          <ol className="landing-steps">
            {steps.map(({ title, copy }, index) => <li key={title} data-landing-reveal="card">
              <span className="landing-step-number" aria-hidden="true">
                {index + 1}
                <svg viewBox="0 0 36 36" aria-hidden="true">
                  <path pathLength={1} d="M27 6C20 0 8 4 5 11C1 18 4 29 12 32C20 35 30 31 33 23C36 14 30 5 21 4" />
                </svg>
              </span>
              <h3>{title}</h3><p>{copy}</p>
              {arrows[index] && <svg className="landing-step-arrow" viewBox="0 0 58 26" aria-hidden="true">
                {arrows[index].map(path => <path key={path} pathLength={1} d={path} />)}
              </svg>}
            </li>)}
          </ol>
          <LandingReportPreview />
        </div>
      </section>

      <LandingEligibility supportHref={getPublicContact()?.href} />
      <LandingPricing />

      <section className="landing-faq" id="perguntas-frequentes" aria-labelledby="faq-title">
        <div className="wrap landing-faq-grid">
          <h2 id="faq-title" data-landing-reveal="heading">Dúvidas frequentes</h2>
          <div className="landing-questions">
            {answers.map(({ question, answer }) => <details key={question} name="landing-faq" data-landing-reveal="row">
              <summary>{question}<ChevronDown size={17} aria-hidden="true" /></summary>
              <p>{answer}</p>
            </details>)}
          </div>
        </div>
      </section>
    </main>
    <LandingFooter />
  </div>;
}
