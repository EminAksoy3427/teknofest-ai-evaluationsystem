import { describe, expect, it } from "vitest";

import { createDatabaseHealthResponse, DatabaseHealthResponseSchema } from "./database-health";

describe("DatabaseHealthResponseSchema", () => {
  it("accepts the canonical D1 health response", () => {
    expect(DatabaseHealthResponseSchema.parse(createDatabaseHealthResponse())).toEqual({
      status: "ok",
      database: "d1",
    });
  });

  it("rejects a different database", () => {
    expect(
      DatabaseHealthResponseSchema.safeParse({ status: "ok", database: "sqlite" }).success,
    ).toBe(false);
  });
});
