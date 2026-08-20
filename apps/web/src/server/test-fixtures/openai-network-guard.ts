// Test-only defensive network guard. It is registered as a vitest setup file so that no test in
// this package can reach an OpenAI endpoint, even when the developer has valid local OpenAI
// credentials configured. The guard is never imported by production composition; it exists so the
// "no OpenAI request" property of the historical milestone smokes is enforced instead of assumed.

const OPENAI_HOST_SUFFIXES = ["openai.com", "openai.azure.com"];

let installed = false;
let attemptCount = 0;
const attemptedHosts: string[] = [];

function hostOf(input: RequestInfo | URL): string | null {
  try {
    if (typeof input === "string") return new URL(input).hostname;
    if (input instanceof URL) return input.hostname;
    return new URL(input.url).hostname;
  } catch {
    return null;
  }
}

function isOpenAIHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return OPENAI_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

export function openAINetworkAttemptCount(): number {
  return attemptCount;
}

export function openAINetworkAttemptHosts(): readonly string[] {
  return [...attemptedHosts];
}

export function resetOpenAINetworkGuard(): void {
  attemptCount = 0;
  attemptedHosts.length = 0;
}

export function installOpenAINetworkGuard(): void {
  if (installed) return;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const hostname = hostOf(input);
    if (hostname && isOpenAIHost(hostname)) {
      attemptCount += 1;
      attemptedHosts.push(hostname);
      throw new Error(
        `Test-only OpenAI network guard blocked an outbound request to ${hostname}. Automated tests must never call the live provider.`,
      );
    }
    return originalFetch(input, init);
  }) as typeof fetch;
  installed = true;
}

installOpenAINetworkGuard();
