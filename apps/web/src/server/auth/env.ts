const AUTH_ENVIRONMENT_KEYS = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
] as const;

type AuthEnvironmentKey = (typeof AUTH_ENVIRONMENT_KEYS)[number];

export type AuthBindings = Record<AuthEnvironmentKey, string>;

export interface AuthConfiguration {
  baseUrl: string;
  googleClientId: string;
  googleClientSecret: string;
  secret: string;
}

export function readAuthConfiguration(environment: Partial<AuthBindings>): AuthConfiguration {
  const invalidKeys = AUTH_ENVIRONMENT_KEYS.filter((key) => {
    const value = environment[key];

    return typeof value !== "string" || value.trim() === "" || value === "replace_me";
  });

  if (
    typeof environment.BETTER_AUTH_SECRET === "string" &&
    environment.BETTER_AUTH_SECRET.length < 32
  ) {
    invalidKeys.push("BETTER_AUTH_SECRET");
  }

  let baseUrl: URL | undefined;

  if (typeof environment.BETTER_AUTH_URL === "string") {
    try {
      baseUrl = new URL(environment.BETTER_AUTH_URL);

      if (
        !["http:", "https:"].includes(baseUrl.protocol) ||
        baseUrl.username !== "" ||
        baseUrl.password !== "" ||
        baseUrl.pathname !== "/" ||
        baseUrl.search !== "" ||
        baseUrl.hash !== ""
      ) {
        invalidKeys.push("BETTER_AUTH_URL");
      }
    } catch {
      invalidKeys.push("BETTER_AUTH_URL");
    }
  }

  const uniqueInvalidKeys = [...new Set(invalidKeys)];

  if (uniqueInvalidKeys.length > 0 || !baseUrl) {
    throw new Error(
      `Authentication configuration is missing or invalid: ${uniqueInvalidKeys.join(", ")}`,
    );
  }

  return {
    baseUrl: baseUrl.origin,
    googleClientId: environment.GOOGLE_CLIENT_ID as string,
    googleClientSecret: environment.GOOGLE_CLIENT_SECRET as string,
    secret: environment.BETTER_AUTH_SECRET as string,
  };
}
