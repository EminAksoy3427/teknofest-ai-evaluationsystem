import { z } from "zod";

import {
  ANALYSIS_CHECK_TYPE_VALUES,
  AnalysisCheckStatusSchema,
  AnalysisCheckTypeSchema,
  AnalysisErrorCodeSchema,
  AnalysisRunStatusSchema,
  AnalysisStageSchema,
} from "./analysis";
import { StableKeySchema } from "./competition-configuration";
import { ReviewerEvaluationStatusSchema } from "./review";
import { ReviewPriorityAssessmentSchema } from "./review-priority";
import { SimilarityLevelSchema } from "./similarity";

/**
 * Evaluation-operations projection for `competition:view-operations`.
 *
 * Everything in this response is DERIVED on demand from already persisted rows — submissions,
 * AnalysisRuns, AnalysisChecks, SimilarityPairs, RubricSuggestions, ReviewerAssignments and
 * ReviewerEvaluations. There is no risk table, no persisted priority column and no cached score, so
 * the queue can never drift away from the immutable records it summarises, and recomputing it
 * performs zero AI inference.
 *
 * Sorting and filtering are deliberately client-side over this bounded list rather than query
 * parameters: the list is capped, the manager needs several orderings of the same data at once, and
 * keeping the server contract parameter-free removes a whole class of injectable selectors.
 */

export const MAX_REVIEW_OPERATIONS_ITEMS = 200;
export const MAX_REVIEW_OPERATIONS_REVIEWERS = 20;

export const ReviewOperationsCheckSchema = z
  .object({ type: AnalysisCheckTypeSchema, status: AnalysisCheckStatusSchema })
  .strict();
export type ReviewOperationsCheck = z.infer<typeof ReviewOperationsCheckSchema>;

/**
 * `latestRun*` describes the submission's newest AnalysisRun, which is what the operations column
 * must report. `referenceRunId` names the newest SUCCEEDED run — the only run whose persisted checks
 * are allowed to feed the priority signals, so an in-flight or failed run never silently replaces
 * the evidence a reviewer actually has.
 */
export const ReviewOperationsAnalysisSchema = z
  .object({
    latestRunId: z.string().min(1).nullable(),
    latestRunStatus: AnalysisRunStatusSchema.nullable(),
    latestRunStage: AnalysisStageSchema.nullable(),
    errorCode: AnalysisErrorCodeSchema.nullable(),
    referenceRunId: z.string().min(1).nullable(),
    checks: z.array(ReviewOperationsCheckSchema).max(ANALYSIS_CHECK_TYPE_VALUES.length),
    /** Level recorded by the reference run's SIMILARITY check; an attention signal, not a verdict. */
    similarityLevel: SimilarityLevelSchema.nullable(),
    similarityObservationCount: z.number().int().nonnegative(),
    exactDocumentMatch: z.boolean(),
  })
  .strict();
export type ReviewOperationsAnalysis = z.infer<typeof ReviewOperationsAnalysisSchema>;

export const ReviewOperationsReviewerSchema = z
  .object({
    assignmentId: z.string().min(1),
    userId: z.string().min(1),
    name: z.string().min(1).max(200),
    email: z.string().min(1).max(320),
    evaluationStatus: ReviewerEvaluationStatusSchema.nullable(),
    submittedAt: z.number().int().nonnegative().nullable(),
    /** This reviewer's own total, kept separate from the AI suggested total at every layer. */
    humanTotal: z.number().int().nonnegative().nullable(),
    humanMaxTotal: z.number().int().nonnegative().nullable(),
    disagreementCount: z.number().int().nonnegative().nullable(),
  })
  .strict();
export type ReviewOperationsReviewer = z.infer<typeof ReviewOperationsReviewerSchema>;

export const ReviewOperationsItemSchema = z
  .object({
    submissionId: z.string().min(1),
    applicationCode: z.string().min(1).max(80),
    projectTitle: z.string().min(1).max(240),
    category: z
      .object({ id: z.string().min(1), code: StableKeySchema, name: z.string().min(1).max(160) })
      .strict(),
    analysis: ReviewOperationsAnalysisSchema,
    priority: ReviewPriorityAssessmentSchema,
    reviewers: z.array(ReviewOperationsReviewerSchema).max(MAX_REVIEW_OPERATIONS_REVIEWERS),
    /** AI suggested total for the reference run. A suggestion, never a reviewer score. */
    aiSuggestedTotal: z.number().int().nonnegative().nullable(),
    aiMaxTotal: z.number().int().nonnegative().nullable(),
    submittedEvaluationCount: z.number().int().nonnegative(),
    /** Criteria across all reviewers where the human score differs from the AI suggestion. */
    disagreementCount: z.number().int().nonnegative(),
  })
  .strict();
export type ReviewOperationsItem = z.infer<typeof ReviewOperationsItemSchema>;

export const ReviewOperationsSummarySchema = z
  .object({
    high: z.number().int().nonnegative(),
    medium: z.number().int().nonnegative(),
    low: z.number().int().nonnegative(),
  })
  .strict();
export type ReviewOperationsSummary = z.infer<typeof ReviewOperationsSummarySchema>;

export const ReviewOperationsResponseSchema = z
  .object({
    competitionId: z.string().min(1),
    items: z.array(ReviewOperationsItemSchema).max(MAX_REVIEW_OPERATIONS_ITEMS),
    summary: ReviewOperationsSummarySchema,
  })
  .strict();
export type ReviewOperationsResponse = z.infer<typeof ReviewOperationsResponseSchema>;

export function summarizeReviewPriorities(
  items: readonly { priority: { level: "HIGH" | "MEDIUM" | "LOW" } }[],
): ReviewOperationsSummary {
  return {
    high: items.filter((item) => item.priority.level === "HIGH").length,
    medium: items.filter((item) => item.priority.level === "MEDIUM").length,
    low: items.filter((item) => item.priority.level === "LOW").length,
  };
}
