import { createDb } from "@teknofest-ai/db";
import * as schema from "@teknofest-ai/db/schema";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { AIBindings } from "../ai/env";
import { type AuthBindings, readAuthConfiguration } from "./env";

export type AuthRuntimeBindings = Env & AuthBindings & AIBindings;

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
      enabled: false,
    },
    socialProviders: {
      google: {
        clientId: configuration.googleClientId,
        clientSecret: configuration.googleClientSecret,
      },
    },
    account: {
      encryptOAuthTokens: true,
      accountLinking: {
        enabled: true,
        disableImplicitLinking: true,
        allowDifferentEmails: false,
      },
    },
  });
}
