import type { Metadata } from "next";
import { plans, planPrice } from "./billing/catalog.ts";

export const siteOrigin = "https://www.rexnotas.com.br";
export const siteName = "RexNotas";
export const homeTitle = "Emissor de NFS-e em lote para afiliados Shopee | RexNotas";
export const homeDescription = "Emita NFS-e em lote com o relatório mensal da Shopee. Revise as comissões, acompanhe as notas e envie XML e DANFS-e por e-mail. Conheça o RexNotas.";
export const shareImage = { url: `${siteOrigin}/opengraph-image`, width: 1200, height: 630, alt: "RexNotas — NFS-e em lote para afiliados Shopee" };

export function publicIndexingEnabled(env: Record<string, string | undefined> = process.env) {
  return env.VERCEL_ENV === "production" || (!env.VERCEL_ENV && env.NODE_ENV === "production");
}

export function publicMetadata(path: string, title: string, description: string): Metadata {
  const url = `${siteOrigin}${path === "/" ? "" : path}`;
  return {
    title: { absolute: title }, description,
    alternates: { canonical: url },
    robots: publicIndexingEnabled()
      ? { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 } }
      : { index: false, follow: false },
    openGraph: { type: "website", locale: "pt_BR", url, siteName, title, description, images: [shareImage] },
    twitter: { card: "summary_large_image", title, description, images: [shareImage.url] },
  };
}

export function homeStructuredData() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", "@id": `${siteOrigin}/#organization`, name: siteName, url: siteOrigin,
        logo: { "@type": "ImageObject", url: `${siteOrigin}/brand/rex-logo.png` } },
      { "@type": "WebSite", "@id": `${siteOrigin}/#website`, url: siteOrigin, name: siteName,
        inLanguage: "pt-BR", publisher: { "@id": `${siteOrigin}/#organization` } },
      { "@type": "SoftwareApplication", "@id": `${siteOrigin}/#software`, name: siteName, url: siteOrigin,
        description: homeDescription, applicationCategory: "BusinessApplication", operatingSystem: "Web",
        inLanguage: "pt-BR", image: shareImage.url, publisher: { "@id": `${siteOrigin}/#organization` },
        featureList: ["Importação do relatório mensal da Shopee", "Emissão de NFS-e em lote", "Download de XML e DANFS-e", "Envio de documentos por e-mail"],
        offers: plans.flatMap(plan => (["monthly", "annual"] as const).map(cadence => {
          const cents = planPrice(plan, cadence);
          const price = `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
          return { "@type": "Offer", name: `${plan.name} · ${cadence === "monthly" ? "mensal" : "anual"}`,
            url: `${siteOrigin}/#planos`, price, priceCurrency: "BRL",
            description: `${plan.includedNotes} notas por mês. ${cadence === "monthly" ? "Cobrança mensal." : "Cobrança anual com 20% de desconto."} Excedentes cobrados à parte conforme o plano.`,
            priceSpecification: { "@type": "UnitPriceSpecification", price, priceCurrency: "BRL", billingDuration: cadence === "monthly" ? "P1M" : "P1Y" } };
        })),
      },
    ],
  };
}

export function jsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
