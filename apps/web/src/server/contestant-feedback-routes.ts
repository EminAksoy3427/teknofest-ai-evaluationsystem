import type { CompetitionMembershipLookup, ContestantFeedbackRepository } from "@teknofest-ai/db";
import {
  ContestantFeedbackOperationSchema,
  ContestantFeedbackSaveRequestSchema,
  ContestantFeedbackSuggestionSchema,
  EligibleFeedbackSourceListResponseSchema,
} from "@teknofest-ai/shared";
import type { Hono } from "hono";

import { ApiApplicationError, parseJsonBody } from "./api-error";
import type { AuthRuntimeBindings } from "./auth/auth";
import type { SessionResolver } from "./auth/session";
import { requireCompetitionPermission } from "./authorization/membership";
import { requireAuthenticatedUser } from "./authorization/require-auth";

export interface ContestantFeedbackRouteDependencies {
  resolveSession: SessionResolver;
  findMembership: CompetitionMembershipLookup;
  contestantFeedbackRepository: ContestantFeedbackRepository;
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
 * Feedback-operations gate: `competition:view-operations`, held by both COMPETITION_MANAGER and
 * EVALUATION_MANAGER — publishing a contestant result is the culmination of evaluation operations,
 * the same permission that already unlocks the operations queue. REVIEWER holds
 * `submission:review` instead and is denied here, exactly as the security matrix requires.
 */
async function requireFeedbackOperationsPermission(
  context: {
    req: { raw: Request; param(name: string): string | undefined };
    env: AuthRuntimeBindings;
  },
  dependencies: ContestantFeedbackRouteDependencies,
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
    "competition:view-operations",
    dependencies.findMembership,
  );
  return { competitionId, user };
}

export function registerContestantFeedbackRoutes(
  app: Hono<{ Bindings: AuthRuntimeBindings }>,
  dependencies: ContestantFeedbackRouteDependencies,
) {
  app.get(
    "/api/v1/competitions/:competitionId/submissions/:submissionId/feedback/sources",
    async (context) => {
      const { competitionId } = await requireFeedbackOperationsPermission(context, dependencies);
      const submissionId = requiredParameter(context.req.param("submissionId"), "submissionId");
      const sources = await dependencies.contestantFeedbackRepository.listEligibleFeedbackSources(
        context.env.DB,
        competitionId,
        submissionId,
      );
      return context.json(EligibleFeedbackSourceListResponseSchema.parse({ sources }));
    },
  );

  app.get(
    "/api/v1/competitions/:competitionId/submissions/:submissionId/feedback",
    async (context) => {
      const { competitionId } = await requireFeedbackOperationsPermission(context, dependencies);
      const submissionId = requiredParameter(context.req.param("submissionId"), "submissionId");
      const feedback = await dependencies.contestantFeedbackRepository.getContestantFeedback(
        context.env.DB,
        competitionId,
        submissionId,
      );
      if (!feedback) {
        throw new ApiApplicationError(
          { code: "NOT_FOUND", message: "Bu başvuru için henüz bir geri bildirim taslağı yok." },
          404,
        );
      }
      return context.json(ContestantFeedbackOperationSchema.parse(feedback));
    },
  );

  // Deterministic draft suggestion, assembled from already persisted human scores and validated AI
  // rubric evidence for the given SUBMITTED evaluation. This performs no model call: it is
  // arithmetic and templating over numbers a human reviewer and an earlier, already-validated AI
  // rubric run produced. It is internal source data, never publication content.
  app.get(
    "/api/v1/competitions/:competitionId/submissions/:submissionId/feedback/suggestion",
    async (context) => {
      const { competitionId } = await requireFeedbackOperationsPermission(context, dependencies);
      const submissionId = requiredParameter(context.req.param("submissionId"), "submissionId");
      const sourceReviewerEvaluationId = requiredParameter(
        context.req.query("sourceReviewerEvaluationId"),
        "sourceReviewerEvaluationId",
      );
      // Re-validate that this evaluation is actually an eligible SUBMITTED source for THIS
      // submission in THIS competition before deriving anything from it — the query string is
      // client input and is never trusted as a bare selector.
      const sources = await dependencies.contestantFeedbackRepository.listEligibleFeedbackSources(
        context.env.DB,
        competitionId,
        submissionId,
      );
      if (!sources.some((source) => source.reviewerEvaluationId === sourceReviewerEvaluationId)) {
        throw new ApiApplicationError(
          { code: "NOT_FOUND", message: "Kaynak hakem değerlendirmesi bulunamadı." },
          404,
        );
      }
      const suggestion =
        await dependencies.contestantFeedbackRepository.getContestantFeedbackSuggestion(
          context.env.DB,
          submissionId,
          sourceReviewerEvaluationId,
        );
      return context.json(ContestantFeedbackSuggestionSchema.parse(suggestion));
    },
  );

  app.put(
    "/api/v1/competitions/:competitionId/submissions/:submissionId/feedback",
    async (context) => {
      const { competitionId, user } = await requireFeedbackOperationsPermission(
        context,
        dependencies,
      );
      const submissionId = requiredParameter(context.req.param("submissionId"), "submissionId");
      const payload = await parseJsonBody(context, ContestantFeedbackSaveRequestSchema);
      const saved = await dependencies.contestantFeedbackRepository.saveContestantFeedbackDraft(
        context.env.DB,
        {
          competitionId,
          submissionId,
          sourceReviewerEvaluationId: payload.sourceReviewerEvaluationId,
          content: {
            summary: payload.summary,
            strengths: payload.strengths,
            improvements: payload.improvements,
            recommendations: payload.recommendations,
          },
          userId: user.id,
        },
      );
      return context.json(ContestantFeedbackOperationSchema.parse(saved));
    },
  );

  // Publishing is the human-approval action: from this moment the contestant may see the content.
  // No AI call happens here or anywhere in this route file.
  app.post(
    "/api/v1/competitions/:competitionId/submissions/:submissionId/feedback/publish",
    async (context) => {
      const { competitionId, user } = await requireFeedbackOperationsPermission(
        context,
        dependencies,
      );
      const submissionId = requiredParameter(context.req.param("submissionId"), "submissionId");
      const published = await dependencies.contestantFeedbackRepository.publishContestantFeedback(
        context.env.DB,
        competitionId,
        submissionId,
        user.id,
      );
      return context.json(ContestantFeedbackOperationSchema.parse(published));
    },
  );
}
