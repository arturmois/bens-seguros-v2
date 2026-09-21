import { defineConfig } from 'orval'

// `pnpm api:generate` (repo root) exports the server's OpenAPI and runs this. Output in src/api is
// generated: never edit it by hand (ADR-007).
export default defineConfig({
  api: {
    input: { target: '../server/openapi.json' },
    output: {
      mode: 'tags-split',
      target: 'src/api/endpoints',
      schemas: 'src/api/model',
      client: 'react-query',
      httpClient: 'fetch',
      clean: true,
      override: {
        mutator: { path: 'src/lib/http.ts', name: 'http' },
        fetch: { includeHttpResponseReturnType: false },
      },
    },
  },
})
