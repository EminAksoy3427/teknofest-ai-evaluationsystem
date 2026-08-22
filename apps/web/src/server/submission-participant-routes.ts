import type {
  CompetitionMembershipLookup,
  SubmissionParticipantRepository,
} from "@teknofest-ai/db";
import {
  EligibleContestantListResponseSchema,
  SubmissionParticipantCreateRequestSchema,
  SubmissionParticipantListResponseSchema,
  SubmissionParticipantSchema,
} from "@teknofest-ai/shared";
import type { Hono } from "hono";

import { ApiApplicationError, parseJsonBody } from "./api-error";
import type { AuthRuntimeBindings } from "./auth/auth";
import type { SessionResolver } from "./auth/session";
import { requireCompetitionPermission } from "./authorization/membership";
import { requireAuthenticatedUser } from "./authorization/require-auth";

export interface SubmissionParticipantRouteDependencies {
  resolveSession: SessionResolver;
  findMembership: CompetitionMembershipLookup;
  submissionParticipantRepository: SubmissionParticipantRepository;
}

function requiredParameter(value: string | undefined, name: string): string {
  if (!value) {
    throw new ApiApplicationError(
      { code: "VALIDATION_ERROR", message: `${name} parametresi gereklidir.` },
      400,
    );
  }
  return value;
}

/**
 * Participant management gate: `competition:configure`, exactly like category, template and rubric
 * management. Held only by COMPETITION_MANAGER — never by EVALUATION_MANAGER, REVIEWER or
 * CONTESTANT, so a contestant can never attach themselves (or anyone else) to a submission through
 * this route, and a reviewer/evaluation manager cannot manage ownership either.
 */
async function requireParticipantManagementPermission(
  context: {
    req: { raw: Request; param(name: string): string | undefined };
    env: AuthRuntimeBindings;
  },
  dependencies: SubmissionParticipantRouteDependencies,
) {
  const user = await requireAuthenticatedUser(
    context.req.raw,
    context.env,
    dependencies.resolveSession,
  );
  const competitionId = requiredParameter(context.req.param("competitionId"), "competitionId");
  await requireCompetitionPermission(
    context.env,
    user.id,
    competitionId,
    "competition:configure",
    dependencies.findMembership,
  );
  return competitionId;
}

export function registerSubmissionParticipantRoutes(
  app: Hono<{ Bindings: AuthRuntimeBindings }>,
  dependencies: SubmissionParticipantRouteDependencies,
) {
  app.get("/api/v1/competitions/:competitionId/contestants", async (context) => {
    const competitionId = await requireParticipantManagementPermission(context, dependencies);
    const contestants = await dependencies.submissionParticipantRepository.listEligibleContestants(
      context.env.DB,
      competitionId,
    );
    return context.json(EligibleContestantListResponseSchema.parse({ contestants }));
  });

  app.get(
    "/api/v1/competitions/:competitionId/submissions/:submissionId/participants",
    async (context) => {
      const competitionId = await requireParticipantManagementPermission(context, dependencies);
      const submissionId = requiredParameter(context.req.param("submissionId"), "submissionId");
      const participants =
        await dependencies.submissionParticipantRepository.listSubmissionParticipants(
          context.env.DB,
          competitionId,
          submissionId,
        );
      return context.json(
        SubmissionParticipantListResponseSchema.parse({ submissionId, participants }),
      );
    },
  );

  // The client picks an EXISTING competition member by user id; the server re-validates that this
  // user actually holds a CONTESTANT membership in this same competition (via the repository's own
  // guarded INSERT) before any row is written, so a client can never widen its own scope by sending
  // a mismatched or foreign user id.
  app.post(
    "/api/v1/competitions/:competitionId/submissions/:submissionId/participants",
    async (context) => {
      const competitionId = await requireParticipantManagementPermission(context, dependencies);
      const submissionId = requiredParameter(context.req.param("submissionId"), "submissionId");
      const payload = await parseJsonBody(context, SubmissionParticipantCreateRequestSchema);
      const created =
        await dependencies.submissionParticipantRepository.createSubmissionParticipant(
          context.env.DB,
          { id: crypto.randomUUID(), competitionId, submissionId, userId: payload.userId },
        );
      return context.json(SubmissionParticipantSchema.parse(created), 201);
    },
  );

  app.delete(
    "/api/v1/competitions/:competitionId/submissions/:submissionId/participants/:participantId",
    async (context) => {
      const competitionId = await requireParticipantManagementPermission(context, dependencies);
      const submissionId = requiredParameter(context.req.param("submissionId"), "submissionId");
      const participantId = requiredParameter(context.req.param("participantId"), "participantId");
      await dependencies.submissionParticipantRepository.deleteSubmissionParticipant(
        context.env.DB,
        competitionId,
        submissionId,
        participantId,
      );
      return context.body(null, 204);
    },
  );
}
