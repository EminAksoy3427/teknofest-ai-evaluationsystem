import { describe, expect, it } from "vitest";

import {
  CompetitionStatusSchema,
  LIFECYCLE_STATUS_VALUES,
  VERSION_STATUS_VALUES,
  VersionStatusSchema,
} from "./status";

describe("lifecycle status contracts", () => {
  it.each(LIFECYCLE_STATUS_VALUES)("accepts %s", (status) => {
    expect(CompetitionStatusSchema.parse(status)).toBe(status);
  });

  it.each(VERSION_STATUS_VALUES)("accepts version status %s", (status) => {
    expect(VersionStatusSchema.parse(status)).toBe(status);
  });

  it("rejects unsupported statuses", () => {
    expect(CompetitionStatusSchema.safeParse("DELETED").success).toBe(false);
    expect(VersionStatusSchema.safeParse("PUBLISHED").success).toBe(false);
    expect(VersionStatusSchema.safeParse("ARCHIVED").success).toBe(false);
  });
});
