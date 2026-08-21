import {
  CompetitionAccessResponseSchema,
  CurrentUserResponseSchema,
  createHealthResponse,
  ForbiddenResponseSchema,
  HealthResponseSchema,
  MembershipListResponseSchema,
  UnauthorizedResponseSchema,
} from "@teknofest-ai/shared";
import { describe, expect, it } from "vitest";

import type { AuthRuntimeBindings } from "./auth/auth";
import { app, createApp } from "./index";

const testEnvironment = { DB: {} as D1Database } as AuthRuntimeBindings;

function requestWithEnvironment(application: ReturnType<typeof createApp>, url: string) {
  return application.request(url, undefined, testEnvironment);
}

const fixtureMemberships = [
  {
    id: "membership-a",
    userId: "user-a",
    competitionId: "competition-a",
    competitionName: "Yarışma A",
    competitionSlug: "yarisma-a",
    role: "REVIEWER" as const,
  },
  {
    id: "membership-b",
    userId: "user-b",
    competitionId: "competition-b",
    competitionName: "Yarışma B",
    competitionSlug: "yarisma-b",
    role: "COMPETITION_MANAGER" as const,
  },
];

function createFixtureApp(userId: "user-a" | "user-b") {
  return createApp({
    resolveSession: async () => ({
      user: {
        id: userId,
        name: userId === "user-a" ? "Kullanıcı A" : "Kullanıcı B",
        email: `${userId}@example.com`,
        image: null,
      },
    }),
    findMembership: async (_binding, requestedUserId, competitionId) => {
      const membership = fixtureMemberships.find(
        (candidate) =>
          candidate.userId === requestedUserId && candidate.competitionId === competitionId,
      );

      return membership
        ? {
            competitionId: membership.competitionId,
            userId: membership.userId,
            role: membership.role,
          }
        : null;
    },
    listMemberships: async (_binding, requestedUserId) =>
      fixtureMemberships
        .filter((membership) => membership.userId === requestedUserId)
        .map(({ competitionId, competitionName, competitionSlug, role }) => ({
          competitionId,
          competitionName,
          competitionSlug,
          role,
        })),
  });
}

describe("GET /api/v1/health", () => {
  it("returns the versioned health contract", async () => {
    const response = await app.request("http://localhost/api/v1/health");
    const payload: unknown = await response.json();

    expect(response.status).toBe(200);
    expect(HealthResponseSchema.parse(payload)).toEqual(createHealthResponse());
  });
});

describe("GET /api/v1/me/memberships", () => {
  it("returns 401 without a session", async () => {
    const response = await app.request("http://localhost/api/v1/me/memberships");
    const payload: unknown = await response.json();

    expect(response.status).toBe(401);
    expect(UnauthorizedResponseSchema.parse(payload)).toEqual({
      code: "UNAUTHORIZED",
      message: "Oturum açmanız gerekiyor.",
    });
  });

  it("returns only the authenticated user's memberships", async () => {
    const response = await requestWithEnvironment(
      createFixtureApp("user-a"),
      "http://localhost/api/v1/me/memberships",
    );
    const payload: unknown = await response.json();

    expect(response.status).toBe(200);
    expect(MembershipListResponseSchema.parse(payload)).toEqual({
      memberships: [
        {
          competitionId: "competition-a",
          competitionName: "Yarışma A",
          competitionSlug: "yarisma-a",
          role: "REVIEWER",
        },
      ],
    });
  });

  it("returns an empty list for an authenticated user without memberships", async () => {
    const noMembershipApp = createApp({
      resolveSession: async () => ({
        user: {
          id: "user-without-membership",
          name: "Üyeliksiz Kullanıcı",
          email: "no-membership@example.com",
          image: null,
        },
      }),
      listMemberships: async () => [],
    });
    const response = await requestWithEnvironment(
      noMembershipApp,
      "http://localhost/api/v1/me/memberships",
    );

    expect(response.status).toBe(200);
    expect(MembershipListResponseSchema.parse(await response.json())).toEqual({
      memberships: [],
    });
  });
});

describe("GET /api/v1/competitions/:competitionId/access", () => {
  it("returns 401 without a session", async () => {
    const response = await app.request("http://localhost/api/v1/competitions/competition-a/access");

    expect(response.status).toBe(401);
    expect(UnauthorizedResponseSchema.parse(await response.json())).toEqual({
      code: "UNAUTHORIZED",
      message: "Oturum açmanız gerekiyor.",
    });
  });

  it("returns 403 to an authenticated non-member", async () => {
    const response = await requestWithEnvironment(
      createFixtureApp("user-a"),
      "http://localhost/api/v1/competitions/competition-b/access",
    );

    expect(response.status).toBe(403);
    expect(ForbiddenResponseSchema.parse(await response.json())).toEqual({
      code: "FORBIDDEN",
      message: "Bu yarışma için erişim yetkiniz yok.",
    });
  });

  it("allows the matching competition and returns only the role's permissions", async () => {
    const response = await requestWithEnvironment(
      createFixtureApp("user-a"),
      "http://localhost/api/v1/competitions/competition-a/access",
    );
    const payload: unknown = await response.json();

    expect(response.status).toBe(200);
    expect(CompetitionAccessResponseSchema.parse(payload)).toEqual({
      competitionId: "competition-a",
      role: "REVIEWER",
      permissions: ["submission:review"],
    });
  });

  it("isolates memberships between users and competitions", async () => {
    const userACompetitionB = await requestWithEnvironment(
      createFixtureApp("user-a"),
      "http://localhost/api/v1/competitions/competition-b/access",
    );
    const userBCompetitionB = await requestWithEnvironment(
      createFixtureApp("user-b"),
      "http://localhost/api/v1/competitions/competition-b/access",
    );

    expect(userACompetitionB.status).toBe(403);
    expect(userBCompetitionB.status).toBe(200);
    expect(CompetitionAccessResponseSchema.parse(await userBCompetitionB.json())).toEqual({
      competitionId: "competition-b",
      role: "COMPETITION_MANAGER",
      permissions: ["competition:configure", "competition:view-operations", "review:assign"],
    });
  });
});

describe("GET /api/v1/me", () => {
  it("returns 401 without a session or auth credentials", async () => {
    const response = await app.request("http://localhost/api/v1/me");
    const payload: unknown = await response.json();

    expect(response.status).toBe(401);
    expect(UnauthorizedResponseSchema.parse(payload)).toEqual({
      code: "UNAUTHORIZED",
      message: "Oturum açmanız gerekiyor.",
    });
  });

  it("returns only the safe authenticated user projection", async () => {
    const authenticatedApp = createApp({
      resolveSession: async () => ({
        user: {
          id: "user-id",
          name: "Test Kullanıcısı",
          email: "test@example.com",
          image: "https://example.com/avatar.png",
        },
      }),
    });

    const response = await authenticatedApp.request("http://localhost/api/v1/me");
    const payload: unknown = await response.json();
    const currentUser = CurrentUserResponseSchema.parse(payload);

    expect(response.status).toBe(200);
    expect(currentUser).toEqual({
      id: "user-id",
      name: "Test Kullanıcısı",
      email: "test@example.com",
      image: "https://example.com/avatar.png",
    });
    expect(Object.keys(currentUser).sort()).toEqual(["email", "id", "image", "name"]);
  });
});
