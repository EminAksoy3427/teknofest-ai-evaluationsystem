import { createDb } from "@teknofest-ai/db";
import * as schema from "@teknofest-ai/db/schema";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { AIBindings } from "../ai/env";
import { type AuthBindings, readAuthConfiguration } from "./env";

export type AuthRuntimeBindings = Env & AuthBindings & AIBindings;

/**
 * Conservative linking: a new Google sign-in is never silently merged onto an
 * existing credential account merely because the emails match. Authenticated
 * users can still link a provider explicitly through Better Auth.
 *
 * `setPassword` remains a server-only Better Auth API and is not exposed to
 * the client. OAuth-only users therefore cannot establish a password from the
 * account UI in this slice.
 *
 * Password reset and verified email change require an outbound mail sender.
 * None is configured in this repository, so `sendResetPassword` is omitted on
 * purpose: Better Auth then rejects reset requests with RESET_PASSWORD_DISABLED
 * instead of pretending a message was delivered.
 */
export const ACCOUNT_LINKING_POLICY = {
  enabled: true,
  disableImplicitLinking: true,
  allowDifferentEmails: false,
} as const;

export const AUTH_PASSWORD_MIN_LENGTH = 8;
export const AUTH_PASSWORD_MAX_LENGTH = 128;

export function createAuth(environment: AuthRuntimeBindings) {
  const configuration = readAuthConfiguration(environment);

  return betterAuth({
    appName: "TEKNOFEST AI Evaluation System",
    basePath: "/api/auth",
    baseURL: configuration.baseUrl,
    secret: configuration.secret,
    trustedOrigins: [configuration.baseUrl],
    database: drizzleAdapter(createDb(environment.DB), {
      provider: "sqlite",
      schema,
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: AUTH_PASSWORD_MIN_LENGTH,
      maxPasswordLength: AUTH_PASSWORD_MAX_LENGTH,
      autoSignIn: true,
      requireEmailVerification: false,
    },
    socialProviders: {
      google: {
        clientId: configuration.googleClientId,
        clientSecret: configuration.googleClientSecret,
      },
    },
    user: {
      changeEmail: {
        enabled: false,
      },
    },
    account: {
      encryptOAuthTokens: true,
      accountLinking: { ...ACCOUNT_LINKING_POLICY },
    },
  });
}
