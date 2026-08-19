import {
  assertDatabaseConnection,
  type CompetitionConfigurationRepository,
  type CompetitionMembershipLookup,
  ConfigurationRepositoryError,
  competitionConfigurationRepository,
  findCompetitionMembership,
  listMembershipSummaries,
  type MembershipSummaryList,
  type SubmissionRepository,
  SubmissionRepositoryError,
  submissionRepository,
} from "@teknofest-ai/db";
import {
  createCompetitionAccessResponse,
  createCurrentUserResponse,
  createDatabaseHealthResponse,
  createForbiddenResponse,
  createHealthResponse,
  createMembershipListResponse,
  createUnauthorizedResponse,
} from "@teknofest-ai/shared";
import { Hono } from "hono";

import { ApiApplicationError, mapRepositoryError, mapSubmissionRepositoryError } from "./api-error";
import { type AuthRuntimeBindings, createAuth } from "./auth/auth";
import { resolveCurrentSession, type SessionResolver } from "./auth/session";
import { AuthorizationError } from "./authorization/error";
import { requireCompetitionMembership } from "./authorization/membership";
import { getPermissionsForRole } from "./authorization/policy";
import { requireAuthenticatedUser } from "./authorization/require-auth";
import { registerCompetitionConfigurationRoutes } from "./competition-configuration-routes";
import { type DocumentStorage, documentStorage } from "./storage/documents";
import { registerSubmissionRoutes } from "./submission-routes";

interface AppDependencies {
  resolveSession: SessionResolver;
  findMembership: CompetitionMembershipLookup;
  listMemberships: MembershipSummaryList;
  repository: CompetitionConfigurationRepository;
  submissionRepository: SubmissionRepository;
  documentStorage: DocumentStorage;
}

const defaultDependencies: AppDependencies = {
  resolveSession: resolveCurrentSession,
  findMembership: findCompetitionMembership,
  listMemberships: listMembershipSummaries,
  repository: competitionConfigurationRepository,
  submissionRepository,
  documentStorage,
};

export function createApp(dependencyOverrides: Partial<AppDependencies> = {}) {
  const dependencies: AppDependencies = {
    ...defaultDependencies,
    ...dependencyOverrides,
  };
  const app = new Hono<{ Bindings: AuthRuntimeBindings }>();

  app.onError((error, context) => {
    if (error instanceof AuthorizationError) {
      if (error.code === "UNAUTHORIZED") {
        return context.json(createUnauthorizedResponse(), 401);
      }

      return context.json(createForbiddenResponse(), 403);
    }

    if (error instanceof ConfigurationRepositoryError) {
      const mapped = mapRepositoryError(error);
      return context.json(mapped.response, mapped.status);
    }

    if (error instanceof SubmissionRepositoryError) {
      const mapped = mapSubmissionRepositoryError(error);
      return context.json(mapped.response, mapped.status);
    }

    if (error instanceof ApiApplicationError) {
      return context.json(error.response, error.status);
    }

    return context.json(
      { code: "INTERNAL_ERROR", message: "Beklenmeyen bir sunucu hatası oluştu." },
      500,
    );
  });

  app.on(["GET", "POST"], "/api/auth/*", (context) =>
    createAuth(context.env).handler(context.req.raw),
  );

  app.get("/api/v1/health", (context) => context.json(createHealthResponse()));

  app.get("/api/v1/health/db", async (context) => {
    await assertDatabaseConnection(context.env.DB);

    return context.json(createDatabaseHealthResponse());
  });

  app.get("/api/v1/me", async (context) => {
    const user = await requireAuthenticatedUser(
      context.req.raw,
      context.env,
      dependencies.resolveSession,
    );

    return context.json(
      createCurrentUserResponse({
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image ?? null,
      }),
    );
  });

  app.get("/api/v1/me/memberships", async (context) => {
    const user = await requireAuthenticatedUser(
      context.req.raw,
      context.env,
      dependencies.resolveSession,
    );
    const memberships = await dependencies.listMemberships(context.env.DB, user.id);

    return context.json(createMembershipListResponse(memberships));
  });

  app.get("/api/v1/competitions/:competitionId/access", async (context) => {
    const user = await requireAuthenticatedUser(
      context.req.raw,
      context.env,
      dependencies.resolveSession,
    );
    const competitionId = context.req.param("competitionId");
    const membership = await requireCompetitionMembership(
      context.env,
      user.id,
      competitionId,
      dependencies.findMembership,
    );

    return context.json(
      createCompetitionAccessResponse({
        competitionId,
        role: membership.role,
        permissions: getPermissionsForRole(membership.role),
      }),
    );
  });

  registerCompetitionConfigurationRoutes(app, dependencies);
  registerSubmissionRoutes(app, dependencies);

  return app;
}

export const app = createApp();

export default app;
