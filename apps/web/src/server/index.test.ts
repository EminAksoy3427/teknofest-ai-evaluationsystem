import { createHealthResponse, HealthResponseSchema } from "@teknofest-ai/shared";
import { describe, expect, it } from "vitest";

import { app } from "./index";

describe("GET /api/v1/health", () => {
  it("returns the versioned health contract", async () => {
    const response = await app.request("http://localhost/api/v1/health");
    const payload: unknown = await response.json();

    expect(response.status).toBe(200);
    expect(HealthResponseSchema.parse(payload)).toEqual(createHealthResponse());
  });
});
