import { assertDatabaseConnection } from "@teknofest-ai/db";
import { createDatabaseHealthResponse, createHealthResponse } from "@teknofest-ai/shared";
import { Hono } from "hono";

export const app = new Hono<{ Bindings: Env }>();

app.get("/api/v1/health", (context) => context.json(createHealthResponse()));

app.get("/api/v1/health/db", async (context) => {
  await assertDatabaseConnection(context.env.DB);

  return context.json(createDatabaseHealthResponse());
});

export default app;
