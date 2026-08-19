import { describe, expect, it } from "vitest";

import {
  CompetitionAccessResponseSchema,
  CompetitionRoleSchema,
  createCompetitionAccessResponse,
  createForbiddenResponse,
  createMembershipListResponse,
  ForbiddenResponseSchema,
  MembershipListResponseSchema,
  PermissionSchema,
} from "./authorization";

describe("competition authorization contracts", () => {
  it.each(["COMPETITION_MANAGER", "REVIEWER", "CONTESTANT", "EVALUATION_MANAGER"] as const)(
    "accepts official role %s",
    (role) => {
      expect(CompetitionRoleSchema.parse(role)).toBe(role);
    },
  );

  it("rejects an invalid role", () => {
    expect(CompetitionRoleSchema.safeParse("ADMIN").success).toBe(false);
  });

  it("validates the initial permission vocabulary", () => {
    expect(PermissionSchema.parse("submission:review")).toBe("submission:review");
    expect(PermissionSchema.safeParse("competition:delete").success).toBe(false);
  });

  it("creates a strict membership list response", () => {
    const response = createMembershipListResponse([
      {
        competitionId: "competition-a",
        competitionName: "Yarışma A",
        competitionSlug: "yarisma-a",
        role: "REVIEWER",
      },
    ]);

    expect(MembershipListResponseSchema.parse(response)).toEqual(response);
    expect(
      MembershipListResponseSchema.safeParse({
        ...response,
        userId: "must-not-leak",
      }).success,
    ).toBe(false);
  });

  it("creates the competition access and forbidden responses", () => {
    const access = createCompetitionAccessResponse({
      competitionId: "competition-a",
      role: "REVIEWER",
      permissions: ["submission:review"],
    });

    expect(CompetitionAccessResponseSchema.parse(access)).toEqual(access);
    expect(ForbiddenResponseSchema.parse(createForbiddenResponse())).toEqual({
      code: "FORBIDDEN",
      message: "Bu yarışma için erişim yetkiniz yok.",
    });
  });
});
