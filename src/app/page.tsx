import Image from "next/image";
import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUpRight, ChevronDown } from "lucide-react";
import { LandingEligibility } from "@/components/landing-eligibility";
import { LandingFooter } from "@/components/landing-footer";
import { LandingHeader } from "@/components/landing-header";
import { LandingPricing } from "@/components/landing-pricing";
import { money, plans } from "@/lib/billing/catalog";
import { getPublicContact } from "@/lib/public-contact";
import "./landing.css";

const steps = [
  { title: "Importe seu relatório", copy: "Selecione o CSV mensal de comissões por vendedor da Shopee." },
  { title: "Confira a prévia", copy: "Revise o tomador, a competência, os valores e os endereços de envio." },
  { title: "Emita tudo em lote", copy: "Confirme a emissão e acompanhe as notas autorizadas no painel." },
];

const arrows = [
  "M3 18C14 7 34 6 53 15M45 5C48 8 52 12 54 15L41 19",
  "M3 9C17 19 34 21 52 10M40 6L53 10C51 14 47 17 44 20",
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
  return <div className="landing">
    <LandingHeader />
    <main id="conteudo">
      <section className="landing-hero" aria-labelledby="hero-heading">
        <div className="site-width landing-hero-grid">
          <div className="landing-hero-copy">
            <h1 id="hero-heading">
              Emisor de NFSe<br />em <span className="landing-circled-word">
                lote
                <svg viewBox="0 0 262 124" preserveAspectRatio="none" aria-hidden="true">
                  <path pathLength={1} d="M208 14C175 3 117 4 72 13 27 22 5 41 8 64c4 31 49 49 111 52 64 3 121-18 133-45 13-30-28-54-74-61-17-3-48-5-71-2" />
                </svg>
              </span>
            </h1>
            <p className="landing-hero-promise">Para afiliados Shopee. Fácil e completo, para focar no que realmente importa.</p>
            <Image className="landing-shopee" src="/brand/shopee.svg" width={104} height={33} alt="Shopee" />
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

      <section className="landing-flow" id="como-funciona" aria-label="Como funciona">
        <div className="site-width">
          <ol className="landing-steps">
            {steps.map(({ title, copy }, index) => <li key={title}>
              <span className="landing-step-number" aria-hidden="true">{index + 1}</span>
              <h3>{title}</h3><p>{copy}</p>
              {arrows[index] && <svg className="landing-step-arrow" viewBox="0 0 58 26" aria-hidden="true">
                <path d={arrows[index]} />
              </svg>}
            </li>)}
          </ol>
          <div className="landing-flow-action">
            <Link href="/prototipo?tela=revisar" className="text-link">Testar uma revisão <ArrowRight size={16} aria-hidden="true" /></Link>
          </div>
        </div>
      </section>

      <LandingEligibility supportHref={getPublicContact()?.href} />
      <LandingPricing />

      <section className="landing-faq" id="perguntas-frequentes" aria-labelledby="faq-title">
        <div className="site-width landing-faq-grid">
          <h2 id="faq-title">Dúvidas frequentes</h2>
          <div className="landing-questions">
            {answers.map(({ question, answer }) => <details key={question} name="landing-faq">
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
