import type { MetadataRoute } from "next";
import { publicIndexingEnabled, siteOrigin } from "@/lib/seo";
import { seoGuides } from "@/lib/seo-guides";

export default function sitemap(): MetadataRoute.Sitemap {
  if (!publicIndexingEnabled()) return [];
  return [
    ...["", "/guias", "/termos-de-uso", "/politica-de-privacidade"].map(path => ({ url: `${siteOrigin}${path}` })),
    ...seoGuides.map(guide => ({ url: `${siteOrigin}/guias/${guide.slug}`, lastModified: guide.published })),
  ];
}
