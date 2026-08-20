import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "cloudflare:workers": new URL(
        "./src/server/test-fixtures/cloudflare-workers.ts",
        import.meta.url,
      ).pathname,
    },
  },
  test: {
    environment: "node",
    // Defensive: blocks any outbound OpenAI request from the automated suite.
    setupFiles: ["./src/server/test-fixtures/openai-network-guard.ts"],
  },
});
