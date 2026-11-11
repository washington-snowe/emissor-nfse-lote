import type { NextConfig } from "next";

const config: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["node-forge", "xmllint-wasm"],
  outputFileTracingIncludes: { "/**/*": [
    "./server/certificate-worker.cjs", "./node_modules/node-forge/**/*",
    "./server/schema-worker.cjs", "./node_modules/xmllint-wasm/**/*", "./integrations/nfse/**/*",
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

export default config;
