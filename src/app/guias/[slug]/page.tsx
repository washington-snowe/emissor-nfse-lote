import Link from "next/link";
import { notFound } from "next/navigation";
import { publicMetadata, siteOrigin, siteName, shareImage, jsonLd } from "@/lib/seo";
import { seoGuides } from "@/lib/seo-guides";

export const dynamicParams = false;
export function generateStaticParams() { return seoGuides.map(({ slug }) => ({ slug })); }

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const guide = seoGuides.find(item => item.slug === slug);
  if (!guide) return {};
  const metadata = publicMetadata(`/guias/${guide.slug}`, `${guide.title} | RexNotas`, guide.description);
  return { ...metadata, openGraph: { ...metadata.openGraph, type: "article", publishedTime: guide.published, modifiedTime: guide.published, authors: [siteName] } };
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const guide = seoGuides.find(item => item.slug === slug);
  if (!guide) notFound();
  const url = `${siteOrigin}/guias/${guide.slug}`;
  const data = { "@context": "https://schema.org", "@graph": [
    { "@type": "Article", "@id": `${url}#article`, headline: guide.title, description: guide.description, mainEntityOfPage: url,
      image: [shareImage.url], datePublished: `${guide.published}T00:00:00-03:00`, dateModified: `${guide.published}T00:00:00-03:00`, inLanguage: "pt-BR",
      author: { "@type": "Organization", name: siteName, url: siteOrigin },
      publisher: { "@type": "Organization", name: siteName, url: siteOrigin, logo: { "@type": "ImageObject", url: `${siteOrigin}/brand/rex-logo.png` } } },
    { "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Início", item: siteOrigin },
      { "@type": "ListItem", position: 2, name: "Guias", item: `${siteOrigin}/guias` },
      { "@type": "ListItem", position: 3, name: guide.title, item: url },
    ] },
  ] };
  return <article>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(data) }} />
    <nav className="guide-breadcrumb" aria-label="Caminho de navegação"><Link href="/">Início</Link><span aria-hidden="true">/</span><Link href="/guias">Guias</Link></nav>
    <header><h1>{guide.title}</h1><p>{guide.description}</p><p className="guide-byline">Por RexNotas · <time dateTime={guide.published}>28 de novembro de 2026</time></p></header>
    <nav className="guide-contents" aria-label="Neste guia"><h2>Neste guia</h2><ol>{guide.sections.map(section => <li key={section.id}><a href={`#${section.id}`}>{section.title}</a></li>)}</ol></nav>
    {guide.sections.map(section => <section id={section.id} key={section.id}><h2>{section.title}</h2>
      {section.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
      {section.steps && <ol>{section.steps.map(step => <li key={step}>{step}</li>)}</ol>}
    </section>)}
    <section><h2>Referências e próximos passos</h2><ul>{guide.sources.map(source => <li key={source.href}><a href={source.href}>{source.title}</a></li>)}</ul>
      <p>Este guia explica o uso do produto e não substitui a orientação contábil sobre a sua operação.</p>
      <p><Link href="/#simulador">Estime suas notas pelo relatório</Link> ou <Link href="/#planos">compare os planos do RexNotas</Link>.</p>
      <Link href="/criar-conta" className="btn btn--primary">Criar minha conta</Link>
    </section>
    <section><h2>Continue a leitura</h2><ul>{seoGuides.filter(item => item.slug !== guide.slug).map(item => <li key={item.slug}><Link href={`/guias/${item.slug}`}>{item.title}</Link></li>)}</ul></section>
  </article>;
}
