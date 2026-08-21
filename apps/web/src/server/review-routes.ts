import type {
  AnalysisRunRepository,
  CompetitionConfigurationRepository,
  CompetitionMembershipLookup,
  ReviewerAssignmentRepository,
  ReviewerEvaluationRepository,
  RubricSuggestionRepository,
  SimilarityPairRepository,
  SubmissionRepository,
} from "@teknofest-ai/db";
import type {
  AnalysisRunResponse,
  ReviewerWorkspaceCriterion,
  SubmissionResponse,
} from "@teknofest-ai/shared";
import {
  deriveDecisionTrace,
  deriveScoreTotals,
  EligibleReviewerListResponseSchema,
  ReviewerAssignmentCreateRequestSchema,
  ReviewerAssignmentOperationListResponseSchema,
  ReviewerAssignmentResponseSchema,
  ReviewerEvaluationSaveRequestSchema,
  ReviewerQueueResponseSchema,
  ReviewerWorkspaceResponseSchema,
} from "@teknofest-ai/shared";
import type { Hono } from "hono";

import { ApiApplicationError, parseJsonBody } from "./api-error";
import type { AuthRuntimeBindings } from "./auth/auth";
import type { SessionResolver } from "./auth/session";
import { requireCompetitionPermission } from "./authorization/membership";
import { requireAuthenticatedUser } from "./authorization/require-auth";
import type { DocumentStorage } from "./storage/documents";
import { reportResponse } from "./storage/report-response";

export interface ReviewRouteDependencies {
  resolveSession: SessionResolver;
  findMembership: CompetitionMembershipLookup;
  reviewerAssignmentRepository: ReviewerAssignmentRepository;
  reviewerEvaluationRepository: ReviewerEvaluationRepository;
  analysisRunRepository: AnalysisRunRepository;
  rubricSuggestionRepository: RubricSuggestionRepository;
  similarityPairRepository: SimilarityPairRepository;
  submissionRepository: SubmissionRepository;
  repository: CompetitionConfigurationRepository;
  documentStorage: DocumentStorage;
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

interface RouteContext {
  req: { raw: Request; param(name: string): string | undefined };
  env: AuthRuntimeBindings;
}

/**
 * Reviewer gate. The REVIEWER role grants `submission:review`, but the role by itself is never
 * enough: the caller must also own an explicit ReviewerAssignment for the requested submission in
 * this competition. An evaluation manager holds `competition:view-operations` and never
 * `submission:review`, so it cannot reach a reviewer route at all.
 */
async function requireOwnedAssignment(
  context: RouteContext,
  dependencies: ReviewRouteDependencies,
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
    "submission:review",
    dependencies.findMembership,
  );
  const assignmentId = requiredParameter(context.req.param("assignmentId"), "assignmentId");
  const assignment = await dependencies.reviewerAssignmentRepository.getOwnedReviewerAssignment(
    context.env.DB,
    competitionId,
    assignmentId,
    user.id,
  );
  // An assignment owned by a different reviewer, or one from another competition, is reported as
  // missing rather than forbidden so the response leaks nothing about other reviewers' work.
  if (!assignment) {
    throw new ApiApplicationError({ code: "NOT_FOUND", message: "Atama bulunamadı." }, 404);
  }
  return { competitionId, user, assignment };
}

async function requireReviewerQueueAccess(
  context: RouteContext,
  dependencies: ReviewRouteDependencies,
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
    "submission:review",
    dependencies.findMembership,
  );
  return { competitionId, user };
}

async function requireAssignmentManagement(
  context: RouteContext,
  dependencies: ReviewRouteDependencies,
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
    "review:assign",
    dependencies.findMembership,
  );
  return { competitionId, user };
}

interface WorkspaceSources {
  submission: SubmissionResponse;
  analysisRun: AnalysisRunResponse;
}

/**
 * Resolves the AnalysisRun the workspace is pinned to. Once an evaluation exists it stays pinned to
 * that evaluation's own run forever, so activating a newer RubricVersion or creating a newer
 * AnalysisRun never moves an existing reviewer evaluation onto the new configuration.
 */
async function resolvePinnedRun(
  environment: AuthRuntimeBindings,
  dependencies: ReviewRouteDependencies,
  competitionId: string,
  submissionId: string,
  pinnedRunId: string | null,
): Promise<AnalysisRunResponse> {
  if (pinnedRunId !== null) {
    const pinned = await dependencies.analysisRunRepository.getAnalysisRun(
      environment.DB,
      competitionId,
      submissionId,
      pinnedRunId,
    );
    if (!pinned) {
      throw new ApiApplicationError(
        { code: "NOT_FOUND", message: "Değerlendirmeye sabitlenmiş analiz kaydı bulunamadı." },
        404,
      );
    }
    return pinned;
  }

  const runHistory = await dependencies.analysisRunRepository.listAnalysisRuns(
    environment.DB,
    competitionId,
    submissionId,
  );
  const succeeded = runHistory.find((run) => run.status === "SUCCEEDED");
  if (!succeeded) {
    throw new ApiApplicationError(
      {
        code: "CONFLICT",
        message: "Bu başvuru için tamamlanmış bir analiz çalışması bulunmuyor.",
      },
      409,
    );
  }
  return succeeded;
}

async function loadWorkspaceSources(
  environment: AuthRuntimeBindings,
  dependencies: ReviewRouteDependencies,
  competitionId: string,
  submissionId: string,
  pinnedRunId: string | null,
): Promise<WorkspaceSources> {
  const submission = await dependencies.submissionRepository.getCompetitionSubmission(
    environment.DB,
    competitionId,
    submissionId,
  );
  if (!submission) {
    throw new ApiApplicationError({ code: "NOT_FOUND", message: "Başvuru bulunamadı." }, 404);
  }
  const analysisRun = await resolvePinnedRun(
    environment,
    dependencies,
    competitionId,
    submissionId,
    pinnedRunId,
  );
  return { submission, analysisRun };
}

/**
 * Builds the workspace projection. The AI suggestion and the human score are read from two separate
 * persisted tables and reported as two separate fields per criterion; the AI suggestion is never
 * copied into `humanScore`, so an unscored criterion stays unscored no matter what the AI proposed.
 */
async function buildWorkspaceResponse(
  environment: AuthRuntimeBindings,
  dependencies: ReviewRouteDependencies,
  assignment: { id: string; competitionId: string; submissionId: string; createdAt: number },
) {
  const evaluation = await dependencies.reviewerEvaluationRepository.getReviewerEvaluation(
    environment.DB,
    assignment.id,
  );
  const { submission, analysisRun } = await loadWorkspaceSources(
    environment,
    dependencies,
    assignment.competitionId,
    assignment.submissionId,
    evaluation?.analysisRunId ?? null,
  );

  const [criteria, suggestions, similarity, humanScores] = await Promise.all([
    dependencies.repository.listCriteriaForRubric(environment.DB, analysisRun.rubricVersionId),
    dependencies.rubricSuggestionRepository.listRubricSuggestionsForRun(
      environment.DB,
      analysisRun.id,
    ),
    dependencies.similarityPairRepository.listAnalysisRunSimilarity(
      environment.DB,
      assignment.competitionId,
      analysisRun.id,
    ),
    evaluation
      ? dependencies.reviewerEvaluationRepository.listReviewerCriterionScores(
          environment.DB,
          evaluation.id,
        )
      : Promise.resolve([]),
  ]);

  const suggestionByCriterion = new Map(
    suggestions.map((suggestion) => [suggestion.criterionId, suggestion]),
  );
  const humanScoreByCriterion = new Map(humanScores.map((entry) => [entry.criterionId, entry]));

  const workspaceCriteria: ReviewerWorkspaceCriterion[] = criteria.map((criterion) => {
    const suggestion = suggestionByCriterion.get(criterion.id) ?? null;
    const human = humanScoreByCriterion.get(criterion.id) ?? null;
    return {
      criterionId: criterion.id,
      code: criterion.code,
      title: criterion.name,
      description: criterion.description,
      evidenceExpectation: criterion.evidenceExpectation,
      maxScore: criterion.maxScore,
      order: criterion.order,
      aiSuggestion: suggestion
        ? {
            suggestedScore: suggestion.suggestedScore,
            reason: suggestion.reason,
            evidenceStrength: suggestion.evidenceStrength,
            evidence: suggestion.evidence,
            missingPoints: suggestion.missingPoints,
          }
        : null,
      humanScore: human?.score ?? null,
      humanNote: human?.note ?? null,
      decisionTrace: deriveDecisionTrace(suggestion?.suggestedScore ?? null, human?.score ?? null),
    };
  });

  return ReviewerWorkspaceResponseSchema.parse({
    assignment: {
      id: assignment.id,
      competitionId: assignment.competitionId,
      submissionId: assignment.submissionId,
      assignedAt: assignment.createdAt,
    },
    submission: {
      id: submission.id,
      applicationCode: submission.applicationCode,
      projectTitle: submission.projectTitle,
      category: submission.category,
    },
    analysisRun,
    similarity,
    rubricVersionId: analysisRun.rubricVersionId,
    criteria: workspaceCriteria,
    totals: deriveScoreTotals(workspaceCriteria),
    evaluation,
    editable: evaluation === null || evaluation.status === "DRAFT",
  });
}

export function registerReviewRoutes(
  app: Hono<{ Bindings: AuthRuntimeBindings }>,
  dependencies: ReviewRouteDependencies,
) {
  // ---------------------------------------------------------------------------
  // Reviewer workspace
  // ---------------------------------------------------------------------------

  app.get("/api/v1/competitions/:competitionId/review/assignments", async (context) => {
    const { competitionId, user } = await requireReviewerQueueAccess(context, dependencies);
    const assignments = await dependencies.reviewerAssignmentRepository.listReviewerQueue(
      context.env.DB,
      competitionId,
      user.id,
    );
    return context.json(ReviewerQueueResponseSchema.parse({ competitionId, assignments }));
  });

  app.get(
    "/api/v1/competitions/:competitionId/review/assignments/:assignmentId/workspace",
    async (context) => {
      const { assignment } = await requireOwnedAssignment(context, dependencies);
      return context.json(await buildWorkspaceResponse(context.env, dependencies, assignment));
    },
  );

  // The reviewer reads the report through their own assignment. No R2 key, bucket name or public
  // URL ever reaches the browser; every request is re-authorized server-side.
  app.get(
    "/api/v1/competitions/:competitionId/review/assignments/:assignmentId/report",
    async (context) => {
      const { competitionId, assignment } = await requireOwnedAssignment(context, dependencies);
      const metadata = await dependencies.submissionRepository.getCompetitionSubmissionFileMetadata(
        context.env.DB,
        competitionId,
        assignment.submissionId,
      );
      if (!metadata) {
        throw new ApiApplicationError(
          { code: "NOT_FOUND", message: "Başvuru raporu bulunamadı." },
          404,
        );
      }
      return reportResponse(
        context.env,
        dependencies.documentStorage,
        metadata,
        competitionId,
        assignment.submissionId,
      );
    },
  );

  app.put(
    "/api/v1/competitions/:competitionId/review/assignments/:assignmentId/evaluation",
    async (context) => {
      const { competitionId, user, assignment } = await requireOwnedAssignment(
        context,
        dependencies,
      );
      const payload = await parseJsonBody(context, ReviewerEvaluationSaveRequestSchema);
      await dependencies.reviewerEvaluationRepository.saveReviewerEvaluation(context.env.DB, {
        competitionId,
        assignmentId: assignment.id,
        reviewerUserId: user.id,
        analysisRunId: payload.analysisRunId,
        overallNote: payload.overallNote,
        scores: payload.scores,
        submit: false,
      });
      return context.json(await buildWorkspaceResponse(context.env, dependencies, assignment));
    },
  );

  // Submitting finalizes THIS reviewer's evaluation only. It does not eliminate the project, select
  // a winner or produce any competition-wide decision.
  app.post(
    "/api/v1/competitions/:competitionId/review/assignments/:assignmentId/evaluation/submit",
    async (context) => {
      const { competitionId, user, assignment } = await requireOwnedAssignment(
        context,
        dependencies,
      );
      const payload = await parseJsonBody(context, ReviewerEvaluationSaveRequestSchema);
      await dependencies.reviewerEvaluationRepository.saveReviewerEvaluation(context.env.DB, {
        competitionId,
        assignmentId: assignment.id,
        reviewerUserId: user.id,
        analysisRunId: payload.analysisRunId,
        overallNote: payload.overallNote,
        scores: payload.scores,
        submit: true,
      });
      return context.json(await buildWorkspaceResponse(context.env, dependencies, assignment));
    },
  );

  // ---------------------------------------------------------------------------
  // Assignment management and evaluation operations
  // ---------------------------------------------------------------------------

  app.get("/api/v1/competitions/:competitionId/reviewers", async (context) => {
    const { competitionId } = await requireAssignmentManagement(context, dependencies);
    const reviewers = await dependencies.reviewerAssignmentRepository.listEligibleReviewers(
      context.env.DB,
      competitionId,
    );
    return context.json(EligibleReviewerListResponseSchema.parse({ reviewers }));
  });

  app.get("/api/v1/competitions/:competitionId/reviewer-assignments", async (context) => {
    const { competitionId } = await requireAssignmentManagement(context, dependencies);
    const assignments =
      await dependencies.reviewerAssignmentRepository.listReviewerAssignmentOperations(
        context.env.DB,
        competitionId,
      );
    return context.json(
      ReviewerAssignmentOperationListResponseSchema.parse({ competitionId, assignments }),
    );
  });

  app.post("/api/v1/competitions/:competitionId/reviewer-assignments", async (context) => {
    const { competitionId, user } = await requireAssignmentManagement(context, dependencies);
    const payload = await parseJsonBody(context, ReviewerAssignmentCreateRequestSchema);
    const created = await dependencies.reviewerAssignmentRepository.createReviewerAssignment(
      context.env.DB,
      {
        id: crypto.randomUUID(),
        competitionId,
        submissionId: payload.submissionId,
        reviewerUserId: payload.reviewerUserId,
        assignedByUserId: user.id,
      },
    );
    return context.json(ReviewerAssignmentResponseSchema.parse(created), 201);
  });

  app.delete(
    "/api/v1/competitions/:competitionId/reviewer-assignments/:assignmentId",
    async (context) => {
      const { competitionId } = await requireAssignmentManagement(context, dependencies);
      const assignmentId = requiredParameter(context.req.param("assignmentId"), "assignmentId");
      await dependencies.reviewerAssignmentRepository.deleteReviewerAssignment(
        context.env.DB,
        competitionId,
        assignmentId,
      );
      return context.body(null, 204);
    },
  );
}
