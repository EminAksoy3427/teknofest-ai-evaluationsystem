import { z } from "zod";

import {
  AnalysisRunResponseSchema,
  SemanticEvidenceSchema,
  SemanticEvidenceStrengthSchema,
} from "./analysis";
import { StableKeySchema } from "./competition-configuration";
import { SimilarityPairResponseSchema } from "./similarity";

export const MAX_REVIEWER_CRITERION_NOTE_CHARACTERS = 600;
export const MAX_REVIEWER_OVERALL_NOTE_CHARACTERS = 2_000;
export const MAX_REVIEWER_CRITERION_SCORES = 100;
export const MAX_REVIEWER_QUEUE_ITEMS = 500;
export const MAX_REVIEWER_ASSIGNMENT_OPERATIONS = 1_000;

export const REVIEWER_EVALUATION_STATUS_VALUES = ["DRAFT", "SUBMITTED"] as const;
export const ReviewerEvaluationStatusSchema = z.enum(REVIEWER_EVALUATION_STATUS_VALUES);
export type ReviewerEvaluationStatus = z.infer<typeof ReviewerEvaluationStatusSchema>;

/**
 * Reviewer queue state. It is derived on the server from the assignment, the submission's current
 * AnalysisRun and the reviewer's own evaluation; it is never a persisted flag, so it cannot drift
 * away from the underlying immutable records.
 */
export const REVIEWER_QUEUE_STATE_VALUES = [
  "ANALYSIS_PENDING",
  "ANALYSIS_UNAVAILABLE",
  "ASSIGNED",
  "DRAFT",
  "SUBMITTED",
] as const;
export const ReviewerQueueStateSchema = z.enum(REVIEWER_QUEUE_STATE_VALUES);
export type ReviewerQueueState = z.infer<typeof ReviewerQueueStateSchema>;

/**
 * Human-AI decision trace classification. `DIFFERENT_FROM_AI` is a neutral observation, never a
 * reviewer error: a reviewer is expected to score lower or higher than the AI suggestion whenever
 * their own reading of the report says so.
 */
export const DECISION_TRACE_CLASSIFICATION_VALUES = [
  "SAME_AS_AI",
  "DIFFERENT_FROM_AI",
  "NO_AI_SUGGESTION",
] as const;
export const DecisionTraceClassificationSchema = z.enum(DECISION_TRACE_CLASSIFICATION_VALUES);
export type DecisionTraceClassification = z.infer<typeof DecisionTraceClassificationSchema>;

export const DecisionTraceSchema = z
  .object({
    aiScore: z.number().int().nonnegative().nullable(),
    humanScore: z.number().int().nonnegative().nullable(),
    /** `humanScore - aiScore`; null while either side is missing. */
    difference: z.number().int().nullable(),
    classification: DecisionTraceClassificationSchema,
  })
  .strict();
export type DecisionTrace = z.infer<typeof DecisionTraceSchema>;

/**
 * Derives one criterion's decision trace. A criterion the reviewer has not scored yet is reported
 * as not-yet-agreed rather than as agreement, so an untouched rubric never reads as "AI ile ayni".
 */
export function deriveDecisionTrace(
  aiScore: number | null,
  humanScore: number | null,
): DecisionTrace {
  if (aiScore === null) {
    return { aiScore: null, humanScore, difference: null, classification: "NO_AI_SUGGESTION" };
  }
  if (humanScore === null) {
    return { aiScore, humanScore: null, difference: null, classification: "DIFFERENT_FROM_AI" };
  }
  return {
    aiScore,
    humanScore,
    difference: humanScore - aiScore,
    classification: humanScore === aiScore ? "SAME_AS_AI" : "DIFFERENT_FROM_AI",
  };
}

const ReviewerIdentitySchema = z
  .object({
    userId: z.string().min(1),
    name: z.string().min(1).max(200),
    email: z.string().min(1).max(320),
  })
  .strict();
export type ReviewerIdentity = z.infer<typeof ReviewerIdentitySchema>;

const AssignedSubmissionSchema = z
  .object({
    id: z.string().min(1),
    applicationCode: z.string().min(1).max(80),
    projectTitle: z.string().min(1).max(240),
    category: z
      .object({ id: z.string().min(1), code: StableKeySchema, name: z.string().min(1).max(160) })
      .strict(),
  })
  .strict();
export type AssignedSubmission = z.infer<typeof AssignedSubmissionSchema>;

// ---------------------------------------------------------------------------
// Reviewer queue
// ---------------------------------------------------------------------------

export const ReviewerQueueItemSchema = z
  .object({
    assignmentId: z.string().min(1),
    competitionId: z.string().min(1),
    submission: AssignedSubmissionSchema,
    state: ReviewerQueueStateSchema,
    analysisRunId: z.string().min(1).nullable(),
    evaluationStatus: ReviewerEvaluationStatusSchema.nullable(),
    submittedAt: z.number().int().nonnegative().nullable(),
    assignedAt: z.number().int().nonnegative(),
  })
  .strict();
export type ReviewerQueueItem = z.infer<typeof ReviewerQueueItemSchema>;

export const ReviewerQueueResponseSchema = z
  .object({
    competitionId: z.string().min(1),
    assignments: z.array(ReviewerQueueItemSchema).max(MAX_REVIEWER_QUEUE_ITEMS),
  })
  .strict();
export type ReviewerQueueResponse = z.infer<typeof ReviewerQueueResponseSchema>;

// ---------------------------------------------------------------------------
// Reviewer workspace
// ---------------------------------------------------------------------------

export const ReviewerCriterionAiSuggestionSchema = z
  .object({
    suggestedScore: z.number().int().nonnegative(),
    reason: z.string().min(1),
    evidenceStrength: SemanticEvidenceStrengthSchema,
    evidence: z.array(SemanticEvidenceSchema),
    missingPoints: z.array(z.string().min(1)),
  })
  .strict();
export type ReviewerCriterionAiSuggestion = z.infer<typeof ReviewerCriterionAiSuggestionSchema>;

export const ReviewerWorkspaceCriterionSchema = z
  .object({
    criterionId: z.string().min(1),
    code: StableKeySchema,
    title: z.string().min(1).max(160),
    description: z.string(),
    evidenceExpectation: z.string(),
    maxScore: z.number().int().positive(),
    order: z.number().int().positive(),
    /** Null when this AnalysisRun produced no suggestion for the criterion. */
    aiSuggestion: ReviewerCriterionAiSuggestionSchema.nullable(),
    humanScore: z.number().int().nonnegative().nullable(),
    humanNote: z.string().nullable(),
    decisionTrace: DecisionTraceSchema,
  })
  .strict()
  .refine((value) => value.humanScore === null || value.humanScore <= value.maxScore, {
    message: "Hakem puanı kriterin azami puanını aşamaz.",
    path: ["humanScore"],
  });
export type ReviewerWorkspaceCriterion = z.infer<typeof ReviewerWorkspaceCriterionSchema>;

/**
 * Both totals are always computed on the server from persisted per-criterion rows. The AI total and
 * the human total are separate fields on purpose and must never be merged into a single score.
 */
export const ReviewerScoreTotalsSchema = z
  .object({
    aiSuggestedTotal: z.number().int().nonnegative().nullable(),
    aiMaxTotal: z.number().int().nonnegative(),
    humanTotal: z.number().int().nonnegative().nullable(),
    humanMaxTotal: z.number().int().nonnegative(),
    scoredCriterionCount: z.number().int().nonnegative(),
    criterionCount: z.number().int().nonnegative(),
    disagreementCount: z.number().int().nonnegative(),
  })
  .strict();
export type ReviewerScoreTotals = z.infer<typeof ReviewerScoreTotalsSchema>;

/**
 * Derives both totals from the pinned criteria. The AI total and the human total are summed
 * independently and returned as separate fields: they are never merged, and an unscored criterion
 * contributes nothing to the human total instead of silently inheriting the AI suggestion.
 *
 * `humanTotal` stays null until the reviewer has scored at least one criterion, so an untouched
 * rubric does not read as a real score of zero.
 */
export function deriveScoreTotals(
  criteria: readonly {
    maxScore: number;
    aiSuggestion: { suggestedScore: number } | null;
    humanScore: number | null;
  }[],
): ReviewerScoreTotals {
  let aiSuggestedTotal = 0;
  let aiSuggestionCount = 0;
  let humanTotal = 0;
  let scoredCriterionCount = 0;
  let disagreementCount = 0;
  let maxTotal = 0;

  for (const criterion of criteria) {
    maxTotal += criterion.maxScore;
    const aiScore = criterion.aiSuggestion?.suggestedScore ?? null;
    if (aiScore !== null) {
      aiSuggestedTotal += aiScore;
      aiSuggestionCount += 1;
    }
    if (criterion.humanScore !== null) {
      humanTotal += criterion.humanScore;
      scoredCriterionCount += 1;
      if (aiScore !== null && aiScore !== criterion.humanScore) disagreementCount += 1;
    }
  }

  return {
    aiSuggestedTotal: aiSuggestionCount === 0 ? null : aiSuggestedTotal,
    aiMaxTotal: maxTotal,
    humanTotal: scoredCriterionCount === 0 ? null : humanTotal,
    humanMaxTotal: maxTotal,
    scoredCriterionCount,
    criterionCount: criteria.length,
    disagreementCount,
  };
}

export const ReviewerEvaluationSummarySchema = z
  .object({
    id: z.string().min(1),
    assignmentId: z.string().min(1),
    analysisRunId: z.string().min(1),
    rubricVersionId: z.string().min(1),
    status: ReviewerEvaluationStatusSchema,
    overallNote: z.string().nullable(),
    createdAt: z.number().int().nonnegative(),
    updatedAt: z.number().int().nonnegative(),
    submittedAt: z.number().int().nonnegative().nullable(),
  })
  .strict();
export type ReviewerEvaluationSummary = z.infer<typeof ReviewerEvaluationSummarySchema>;

export const ReviewerWorkspaceResponseSchema = z
  .object({
    assignment: z
      .object({
        id: z.string().min(1),
        competitionId: z.string().min(1),
        submissionId: z.string().min(1),
        assignedAt: z.number().int().nonnegative(),
      })
      .strict(),
    submission: AssignedSubmissionSchema,
    /** The AnalysisRun this workspace is pinned to, with its already persisted AI checks. */
    analysisRun: AnalysisRunResponseSchema,
    similarity: z.array(SimilarityPairResponseSchema),
    rubricVersionId: z.string().min(1),
    criteria: z.array(ReviewerWorkspaceCriterionSchema).max(MAX_REVIEWER_CRITERION_SCORES),
    totals: ReviewerScoreTotalsSchema,
    evaluation: ReviewerEvaluationSummarySchema.nullable(),
    /** False once this reviewer's evaluation is SUBMITTED; a submitted evaluation is immutable. */
    editable: z.boolean(),
  })
  .strict();
export type ReviewerWorkspaceResponse = z.infer<typeof ReviewerWorkspaceResponseSchema>;

// ---------------------------------------------------------------------------
// Reviewer evaluation write contract
// ---------------------------------------------------------------------------

function nullableNote(maximum: number) {
  return z
    .string()
    .max(maximum)
    .nullable()
    .transform((value) => {
      const trimmed = value === null ? "" : value.trim();
      return trimmed === "" ? null : trimmed;
    });
}

/**
 * The reviewer identity, the assignment ownership, the pinned RubricVersion and both totals are
 * deliberately absent from this request: they are resolved server-side from the session and from
 * immutable persisted records. `analysisRunId` is present only so the server can reject a stale
 * workspace; it is re-validated against the assignment's own submission and is never trusted as a
 * free selector.
 */
export const ReviewerEvaluationSaveRequestSchema = z
  .object({
    analysisRunId: z.string().min(1),
    overallNote: nullableNote(MAX_REVIEWER_OVERALL_NOTE_CHARACTERS),
    scores: z
      .array(
        z
          .object({
            criterionId: z.string().min(1),
            score: z.number().int().nonnegative().max(1_000),
            note: nullableNote(MAX_REVIEWER_CRITERION_NOTE_CHARACTERS),
          })
          .strict(),
      )
      .max(MAX_REVIEWER_CRITERION_SCORES),
  })
  .strict()
  .superRefine(({ scores }, context) => {
    const seen = new Set<string>();
    scores.forEach((entry, index) => {
      if (seen.has(entry.criterionId)) {
        context.addIssue({
          code: "custom",
          message: "Bir kriter için yalnız bir hakem puanı gönderilebilir.",
          path: ["scores", index, "criterionId"],
        });
      }
      seen.add(entry.criterionId);
    });
  });
export type ReviewerEvaluationSaveRequest = z.infer<typeof ReviewerEvaluationSaveRequestSchema>;

// ---------------------------------------------------------------------------
// Assignment management and operations visibility
// ---------------------------------------------------------------------------

export const ReviewerAssignmentCreateRequestSchema = z
  .object({ submissionId: z.string().min(1), reviewerUserId: z.string().min(1) })
  .strict();
export type ReviewerAssignmentCreateRequest = z.infer<typeof ReviewerAssignmentCreateRequestSchema>;

export const ReviewerAssignmentResponseSchema = z
  .object({
    id: z.string().min(1),
    competitionId: z.string().min(1),
    submissionId: z.string().min(1),
    reviewerUserId: z.string().min(1),
    assignedByUserId: z.string().min(1),
    createdAt: z.number().int().nonnegative(),
    updatedAt: z.number().int().nonnegative(),
  })
  .strict();
export type ReviewerAssignmentResponse = z.infer<typeof ReviewerAssignmentResponseSchema>;

export const EligibleReviewerSchema = ReviewerIdentitySchema.extend({
  assignedSubmissionCount: z.number().int().nonnegative(),
}).strict();
export type EligibleReviewer = z.infer<typeof EligibleReviewerSchema>;

export const EligibleReviewerListResponseSchema = z
  .object({ reviewers: z.array(EligibleReviewerSchema) })
  .strict();
export type EligibleReviewerListResponse = z.infer<typeof EligibleReviewerListResponseSchema>;

/** Minimal evaluation-operations projection for COMPETITION_MANAGER / EVALUATION_MANAGER. */
export const ReviewerAssignmentOperationSchema = z
  .object({
    assignmentId: z.string().min(1),
    submission: AssignedSubmissionSchema,
    reviewer: ReviewerIdentitySchema,
    assignedByUserId: z.string().min(1),
    assignedAt: z.number().int().nonnegative(),
    evaluationStatus: ReviewerEvaluationStatusSchema.nullable(),
    submittedAt: z.number().int().nonnegative().nullable(),
    analysisRunId: z.string().min(1).nullable(),
    humanTotal: z.number().int().nonnegative().nullable(),
    humanMaxTotal: z.number().int().nonnegative().nullable(),
    aiSuggestedTotal: z.number().int().nonnegative().nullable(),
    aiMaxTotal: z.number().int().nonnegative().nullable(),
    disagreementCount: z.number().int().nonnegative().nullable(),
  })
  .strict();
export type ReviewerAssignmentOperation = z.infer<typeof ReviewerAssignmentOperationSchema>;

export const ReviewerAssignmentOperationListResponseSchema = z
  .object({
    competitionId: z.string().min(1),
    assignments: z.array(ReviewerAssignmentOperationSchema).max(MAX_REVIEWER_ASSIGNMENT_OPERATIONS),
  })
  .strict();
export type ReviewerAssignmentOperationListResponse = z.infer<
  typeof ReviewerAssignmentOperationListResponseSchema
>;
