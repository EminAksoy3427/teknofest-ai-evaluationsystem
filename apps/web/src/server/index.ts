import { createHealthResponse } from "@teknofest-ai/shared";
import { Hono } from "hono";

export const app = new Hono();

app.get("/api/v1/health", (context) => context.json(createHealthResponse()));

export default app;
