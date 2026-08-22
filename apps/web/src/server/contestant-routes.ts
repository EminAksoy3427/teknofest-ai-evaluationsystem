import type { ContestantFeedbackRepository } from "@teknofest-ai/db";
import {
  ContestantOwnedSubmissionListResponseSchema,
  PublishedContestantFeedbackResponseSchema,
} from "@teknofest-ai/shared";
import type { Hono } from "hono";

import { ApiApplicationError } from "./api-error";
import type { AuthRuntimeBindings } from "./auth/auth";
import type { SessionResolver } from "./auth/session";
import { requireAuthenticatedUser } from "./authorization/require-auth";

export interface ContestantRouteDependencies {
  resolveSession: SessionResolver;
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
 * Contestant-facing surface. There is deliberately no `:competitionId` in either path: identity
 * comes only from the session, ownership comes only from `submission_participant`, and a contestant
 * never supplies a userId. Both routes read from the same SAFE published projection — never from
 * `AnalysisCheck`, `SimilarityPair`, `RubricSuggestion` or `ReviewerEvaluation` directly, and never
 * from an unpublished (DRAFT) `ContestantFeedback` row.
 */
export function registerContestantRoutes(
  app: Hono<{ Bindings: AuthRuntimeBindings }>,
  dependencies: ContestantRouteDependencies,
) {
  app.get("/api/v1/me/submissions", async (context) => {
    const user = await requireAuthenticatedUser(
      context.req.raw,
      context.env,
      dependencies.resolveSession,
    );
    const submissions = await dependencies.contestantFeedbackRepository.listMySubmissions(
      context.env.DB,
      user.id,
    );
    return context.json(ContestantOwnedSubmissionListResponseSchema.parse({ submissions }));
  });

  app.get("/api/v1/me/submissions/:submissionId/feedback", async (context) => {
    const user = await requireAuthenticatedUser(
      context.req.raw,
      context.env,
      dependencies.resolveSession,
    );
    const submissionId = requiredParameter(context.req.param("submissionId"), "submissionId");
    const feedback =
      await dependencies.contestantFeedbackRepository.getPublishedFeedbackForContestant(
        context.env.DB,
        user.id,
        submissionId,
      );
    // An unowned submission and an owned-but-unpublished (or nonexistent) result are
    // indistinguishable on purpose: both simply report "not published yet" rather than leaking
    // which case actually applies.
    if (!feedback) {
      throw new ApiApplicationError(
        {
          code: "NOT_FOUND",
          message: "Değerlendirme sonucu henüz yayımlanmadı.",
        },
        404,
      );
    }
    return context.json(PublishedContestantFeedbackResponseSchema.parse(feedback));
  });
}
