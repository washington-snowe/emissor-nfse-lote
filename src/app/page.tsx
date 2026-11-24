import Image from "next/image";
import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUpRight, ChevronDown } from "lucide-react";
import { Brand } from "@/components/brand";
import { LandingEligibility } from "@/components/landing-eligibility";
import { LandingHeader } from "@/components/landing-header";
import { LandingPricing } from "@/components/landing-pricing";
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
  { question: "Quem pode usar o Rex?", answer: "O Rex atende afiliados da Shopee que emitem NFS-e como MEI ou empresa do Simples Nacional." },
  { question: "Qual relatório preciso importar?", answer: "Exporte o relatório mensal de comissões por vendedor da Shopee no formato CSV." },
  { question: "Preciso de certificado digital?", answer: "Sim. Cadastre a empresa e adicione o certificado digital A1 para verificar o acesso à emissão." },
  { question: "Posso enviar as notas por e-mail?", answer: "Ao revisar um lote em produção, confira os endereços e autorize o envio aos vendedores. O painel mostra o status de cada entrega." },
  { question: "Onde baixo as notas emitidas?", answer: "Em Notas, você acompanha cada emissão e baixa o XML e o DANFS-e das notas autorizadas." },
];

function supportHref() {
  const raw = process.env.REX_SUPPORT_URL?.trim();
  if (!raw) return;
  try {
    const url = new URL(raw);
    if (["https:", "mailto:"].includes(url.protocol) && !url.username && !url.password) return url.href;
  } catch {
    // Leave the support link unavailable when it has no valid destination.
  }
}

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

      <LandingEligibility supportHref={supportHref()} />
      <LandingPricing />

      <section className="landing-faq" aria-labelledby="faq-title">
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
    <footer className="landing-footer">
      <div className="site-width site-masthead-inner">
        <Brand />
        <a href="#conteudo" className="text-link">Voltar ao topo</a>
      </div>
    </footer>
  </div>;
}
