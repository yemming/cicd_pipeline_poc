import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Non-app code: one-off scripts, e2e tests, docs/design artifacts.
    "scripts/**",
    "tests/**",
    "docs/**",
    // Root-level throwaway verify/dump scripts (round*-verify.mjs etc.).
    // Tooling config files at the root stay linted.
    "*.mjs",
    "*.js",
    "*.cjs",
    "!eslint.config.mjs",
    "!postcss.config.mjs",
  ]),
]);

export default eslintConfig;
