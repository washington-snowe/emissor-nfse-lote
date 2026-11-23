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
    ];
  },
};

export default function nextConfig(phase: string): NextConfig {
  if (phase === PHASE_PRODUCTION_BUILD) {
    const publicVariables = Object.keys(process.env).filter(key => key.startsWith("NEXT_PUBLIC_"));
    if (publicVariables.length) {
      throw new Error("Configuração pública proibida neste projeto: " + publicVariables.sort().join(", "));
    }
  }
  return config;
}
