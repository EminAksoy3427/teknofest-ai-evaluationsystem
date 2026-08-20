// Test-only accessor for the Node process environment used by the vitest runner.
//
// `apps/web` deliberately does not install Node typings, because production code targets the
// Cloudflare Workers runtime and must not reach for `process`. The declaration below is
// module-scoped, so it grants no global `process` to Worker code; only modules that import this
// fixture can see it.
declare const process: { env: Record<string, string | undefined> };

export const ambientEnvironment: Record<string, string | undefined> = process.env;

/** Boolean-only view of ambient OpenAI configuration. Values are never returned. */
export function ambientOpenAIConfigured(): boolean {
  const key = ambientEnvironment.OPENAI_API_KEY;
  return typeof key === "string" && key.trim().length > 0;
}
