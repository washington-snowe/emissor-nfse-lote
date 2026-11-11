import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  { files: ["server/*.cjs"], rules: { "@typescript-eslint/no-require-imports": "off" } },
  globalIgnores([
    ".next/**",
    "next-env.d.ts",
    ".taste-skill/**",
    "shots/**",
    "public/assets/motion/**",
  ]),
]);
