import { assertDatabaseConnection } from "@teknofest-ai/db";
import {
  createCurrentUserResponse,
  createDatabaseHealthResponse,
  createHealthResponse,
  createUnauthorizedResponse,
} from "@teknofest-ai/shared";
import { Hono } from "hono";

import { type AuthRuntimeBindings, createAuth } from "./auth/auth";
import { resolveCurrentSession, type SessionResolver } from "./auth/session";

interface AppDependencies {
  resolveSession: SessionResolver;
}

export function createApp(
  dependencies: AppDependencies = { resolveSession: resolveCurrentSession },
) {
  const app = new Hono<{ Bindings: AuthRuntimeBindings }>();

  app.on(["GET", "POST"], "/api/auth/*", (context) =>
    createAuth(context.env).handler(context.req.raw),
  );

  app.get("/api/v1/health", (context) => context.json(createHealthResponse()));

  app.get("/api/v1/health/db", async (context) => {
    await assertDatabaseConnection(context.env.DB);

    return context.json(createDatabaseHealthResponse());
  });

  app.get("/api/v1/me", async (context) => {
    const currentSession = await dependencies.resolveSession(context.req.raw, context.env);

    if (!currentSession) {
      return context.json(createUnauthorizedResponse(), 401);
    }

    const { user } = currentSession;

    return context.json(
      createCurrentUserResponse({
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image ?? null,
      }),
    );
  });

  return app;
}

export const app = createApp();

export default app;
