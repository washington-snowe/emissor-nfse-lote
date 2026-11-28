import type { MetadataRoute } from "next";
import { publicIndexingEnabled, siteOrigin } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  if (!publicIndexingEnabled()) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/painel", "/api/", "/auth/", "/prototipo", "/verificar-acesso"] },
    sitemap: `${siteOrigin}/sitemap.xml`,
  };
}
