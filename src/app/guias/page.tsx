import Link from "next/link";
import { publicMetadata, siteOrigin, jsonLd } from "@/lib/seo";
import { seoGuides } from "@/lib/seo-guides";

export const metadata = publicMetadata("/guias", "Guias de NFS-e para afiliados Shopee | RexNotas", "Aprenda a preparar o relatório mensal da Shopee, configurar o certificado A1 e revisar suas notas fiscais de serviço antes da emissão em lote.");

export default function GuidesPage() {
  return <article>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd({ "@context": "https://schema.org", "@type": "CollectionPage", name: "Guias de NFS-e para afiliados Shopee", url: `${siteOrigin}/guias`, inLanguage: "pt-BR" }) }} />
    <nav className="guide-breadcrumb" aria-label="Caminho de navegação"><Link href="/">Início</Link><span aria-hidden="true">/</span><span aria-current="page">Guias</span></nav>
    <header><h1>NFS-e para afiliados, passo a passo</h1><p>Prepare sua empresa, entenda o relatório da Shopee e revise os dados antes de emitir.</p></header>
    {seoGuides.map(guide => <section key={guide.slug}><h2><Link href={`/guias/${guide.slug}`}>{guide.title}</Link></h2><p>{guide.description}</p></section>)}
    <section><h2>Descubra o volume do seu relatório</h2><p>Use o <Link href="/#simulador">simulador de notas pelo CSV</Link> para conferir a estimativa de emissões e comparar o custo dos planos.</p></section>
  </article>;
}
