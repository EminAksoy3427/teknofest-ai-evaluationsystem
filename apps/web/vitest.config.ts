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
  },
});
