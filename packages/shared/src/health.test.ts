import { describe, expect, it } from "vitest";

import { createHealthResponse, HealthResponseSchema } from "./health";

describe("HealthResponseSchema", () => {
  it("accepts the canonical health response", () => {
    expect(HealthResponseSchema.parse(createHealthResponse())).toEqual({
      status: "ok",
      service: "teknofest-ai-evaluationsystem",
      version: 1,
    });
  });

  it("rejects an unsupported contract version", () => {
    expect(
      HealthResponseSchema.safeParse({
        status: "ok",
        service: "teknofest-ai-evaluationsystem",
        version: 2,
      }).success,
    ).toBe(false);
  });
});
