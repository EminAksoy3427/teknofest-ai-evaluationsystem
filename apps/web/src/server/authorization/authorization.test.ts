import type { CompetitionMembershipLookup } from "@teknofest-ai/db";
import { describe, expect, it } from "vitest";

import type { AuthRuntimeBindings } from "../auth/auth";
import {
  requireCompetitionMembership,
  requireCompetitionPermission,
  requireCompetitionRole,
} from "./membership";
import { getPermissionsForRole } from "./policy";
import { requireAuthenticatedUser } from "./require-auth";

const environment = {} as AuthRuntimeBindings;

const reviewerMembershipLookup: CompetitionMembershipLookup = async (
  _binding,
  userId,
  competitionId,
) =>
  userId === "user-a" && competitionId === "competition-a"
    ? { userId, competitionId, role: "REVIEWER" }
    : null;

describe("server-side authorization helpers", () => {
  it("rejects a missing session with 401", async () => {
    await expect(
      requireAuthenticatedUser(new Request("http://localhost"), environment, async () => null),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });
  });

  it("rejects a non-member and cross-competition access with 403", async () => {
    await expect(
      requireCompetitionMembership(
        environment,
        "user-a",
        "competition-b",
        reviewerMembershipLookup,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  });

  it("allows membership only in the matching competition", async () => {
    await expect(
      requireCompetitionMembership(
        environment,
        "user-a",
        "competition-a",
        reviewerMembershipLookup,
      ),
    ).resolves.toEqual({
      userId: "user-a",
      competitionId: "competition-a",
      role: "REVIEWER",
    });
  });

  it("does not treat roles as a hierarchy", async () => {
    await expect(
      requireCompetitionRole(
        environment,
        "user-a",
        "competition-a",
        ["REVIEWER"],
        reviewerMembershipLookup,
      ),
    ).resolves.toMatchObject({ role: "REVIEWER" });

    await expect(
      requireCompetitionRole(
        environment,
        "user-a",
        "competition-a",
        ["COMPETITION_MANAGER"],
        reviewerMembershipLookup,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  });

  it("enforces the explicit permission instead of a client role claim", async () => {
    await expect(
      requireCompetitionPermission(
        environment,
        "user-a",
        "competition-a",
        "competition:configure",
        reviewerMembershipLookup,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  });
});

describe("explicit role permissions", () => {
  it.each([
    ["COMPETITION_MANAGER", ["competition:configure"]],
    ["EVALUATION_MANAGER", ["competition:view-operations"]],
    ["REVIEWER", ["submission:review"]],
    ["CONTESTANT", ["feedback:view-own"]],
  ] as const)("maps %s only to its intended permissions", (role, permissions) => {
    expect(getPermissionsForRole(role)).toEqual(permissions);
  });
});
