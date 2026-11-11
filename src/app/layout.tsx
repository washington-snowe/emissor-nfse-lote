/* eslint-disable @next/next/no-css-tags -- Serve the vendored motion layer unchanged at its original URL. */
import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "@fontsource-variable/outfit";
import "@fontsource/dm-mono/400.css";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Emissor — NFS-e para afiliados",
    template: "%s | Emissor",
  },
  description:
    "Projeto de emissão de NFS-e para afiliados PJ. Acompanhe a preparação do seu espaço de trabalho.",
  robots: { index: false, follow: false },
  other: { "page-type": "software", "site-kind": "software" },
};
export const viewport: Viewport = { themeColor: "#f8f8f8" };

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="pt-BR"
      data-type="software"
      data-radius="sharp"
      data-buttons="solid"
      data-motion="on"
      suppressHydrationWarning
    >
      <head>
        <link rel="stylesheet" href="/assets/motion/motion.css" />
      </head>
      <body>
        <Script
          id="hero-entrance"
          strategy="beforeInteractive"
        >{`document.documentElement.classList.add('m-enter');setTimeout(()=>document.documentElement.classList.add('m-enter-done'),700)`}</Script>
        <a className="skip-link" href="#conteudo">
          Pular para o conteúdo
        </a>
        {children}
        <Script
          src="/assets/motion/motion.js"
          strategy="afterInteractive"
          type="module"
        />
      </body>
    </html>
  );
}
