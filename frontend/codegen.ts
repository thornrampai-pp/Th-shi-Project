import type { CodegenConfig } from "@graphql-codegen/cli";

// Pulls the schema by introspecting the running backend (`npm run dev` in ../backend).
// Output in src/gql is committed so builds don't need the backend up.
const config: CodegenConfig = {
  schema: process.env.BACKEND_GRAPHQL_URL ?? "http://localhost:4000/graphql",
  documents: ["src/**/*.{ts,tsx}", "!src/gql/**"],
  ignoreNoDocuments: true,
  generates: {
    "src/gql/": {
      preset: "client",
      presetConfig: { fragmentMasking: false },
      config: { useTypeImports: true, enumsAsTypes: true },
    },
  },
};

export default config;
