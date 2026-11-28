import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

const config: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["node-forge", "xmllint-wasm"],
  outputFileTracingIncludes: { "/**/*": [
    "./server/certificate-worker.cjs", "./node_modules/node-forge/**/*",
    "./server/schema-worker.cjs", "./node_modules/xmllint-wasm/**/*", "./integrations/nfse/**/*", "./.private/danfse-fonts/*.ttf",
  ] },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
      ...["/painel/:path*", "/prototipo/:path*", "/entrar", "/criar-conta", "/recuperar-senha/:path*", "/verificar-acesso", "/auth/:path*", "/api/:path*"].map(source => ({
        source,
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }],
      })),
      ...(process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production" ? [{
        source: "/(.*)", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }],
      }] : []),
    ];
  },
};

export default function nextConfig(phase: string): NextConfig {
  if (phase === PHASE_PRODUCTION_BUILD) {
    // Vercel supplies this telemetry setting even with system exposure disabled.
    // Rex has no client telemetry integration, so exclude it before bundling.
    delete process.env.NEXT_PUBLIC_VERCEL_OBSERVABILITY_CLIENT_CONFIG;
    const publicVariables = Object.keys(process.env).filter(key => key.startsWith("NEXT_PUBLIC_"));
    if (publicVariables.length) {
      throw new Error("Configuração pública proibida neste projeto: " + publicVariables.sort().join(", "));
    }
  }
  return config;
}
