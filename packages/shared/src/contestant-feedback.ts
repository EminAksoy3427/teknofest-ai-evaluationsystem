import { z } from "zod";

/**
 * ContestantFeedback is a controlled PUBLICATION boundary, not a mirror of internal analysis or
 * reviewer tables. A contestant never queries `AnalysisCheck`, `SimilarityPair`, `RubricSuggestion`
 * or `ReviewerEvaluation` directly; the only thing a contestant can ever receive is the explicit,
 * human-approved projection defined by `PublishedContestantFeedbackResponseSchema` below.
 *
 * DRAFT is manager-editable and invisible to the contestant — its existence is not revealed, not
 * just its content. PUBLISHED is immutable and contestant-visible. There is no reopen/versioning in
 * this MVP: correcting a published result is a deliberately deferred workflow.
 */

export const CONTESTANT_FEEDBACK_STATUS_VALUES = ["DRAFT", "PUBLISHED"] as const;
export const ContestantFeedbackStatusSchema = z.enum(CONTESTANT_FEEDBACK_STATUS_VALUES);
export type ContestantFeedbackStatus = z.infer<typeof ContestantFeedbackStatusSchema>;

export const MAX_FEEDBACK_SUMMARY_CHARACTERS = 2_000;
export const MAX_FEEDBACK_POINT_CHARACTERS = 300;
export const MAX_FEEDBACK_POINTS = 10;

function nullableText(field: string, maximum: number) {
  return z
    .string()
    .max(maximum, `${field} çok uzun.`)
    .nullable()
    .transform((value) => {
      const trimmed = value === null ? "" : value.trim();
      return trimmed === "" ? null : trimmed;
    });
}

const pointListSchema = z
  .array(z.string().trim().min(1).max(MAX_FEEDBACK_POINT_CHARACTERS))
  .max(MAX_FEEDBACK_POINTS);

/**
 * The editable PUBLICATION content — what a manager writes and what a contestant eventually reads.
 * This is deliberately a different shape from any internal analysis/reviewer record: it holds only
 * the fields a contestant is allowed to ever see.
 */
export const ContestantFeedbackContentSchema = z
  .object({
    summary: nullableText("Özet", MAX_FEEDBACK_SUMMARY_CHARACTERS),
    strengths: pointListSchema,
    improvements: pointListSchema,
    recommendations: pointListSchema,
  })
  .strict();
export type ContestantFeedbackContent = z.infer<typeof ContestantFeedbackContentSchema>;

/**
 * Saves (creates or updates) the DRAFT. `sourceReviewerEvaluationId` names the SUBMITTED
 * ReviewerEvaluation this feedback is based on; the server re-validates that it is actually
 * SUBMITTED and belongs to this same submission and competition — a client can never select an
 * evaluation from another submission or competition. Once a draft exists, its source is pinned: a
 * request naming a different evaluation is rejected rather than silently moved.
 */
export const ContestantFeedbackSaveRequestSchema = ContestantFeedbackContentSchema.extend({
  sourceReviewerEvaluationId: z.string().min(1),
}).strict();
export type ContestantFeedbackSaveRequest = z.infer<typeof ContestantFeedbackSaveRequestSchema>;

const requiredPointListSchema = (field: string) =>
  pointListSchema.min(1, `${field} en az bir madde içermelidir.`);

/**
 * The completeness bar a PUBLICATION must clear. A DRAFT may stay partial for as long as the
 * manager needs, but the Problem 4 contestant flow promises the contestant strengths, areas for
 * improvement AND recommendations, so a summary alone is not a publishable result. Entries are
 * trimmed before the length check, so whitespace-only text never counts as a written point.
 *
 * Nothing here is ever auto-filled: if a project genuinely has no obvious weakness, the human
 * writes a truthful continuation/development note themselves. The server refuses to publish rather
 * than inventing content.
 */
export const PublishableContestantFeedbackContentSchema = z
  .object({
    summary: z
      .string()
      .trim()
      .min(1, "Özet boş bırakılamaz.")
      .max(MAX_FEEDBACK_SUMMARY_CHARACTERS, "Özet çok uzun."),
    strengths: requiredPointListSchema("Güçlü yönler"),
    improvements: requiredPointListSchema("Gelişim alanları"),
    recommendations: requiredPointListSchema("Öneriler"),
  })
  .strict();
export type PublishableContestantFeedbackContent = z.infer<
  typeof PublishableContestantFeedbackContentSchema
>;

/** Whether the given draft content may be published as-is. */
export function isPublishableFeedbackContent(content: ContestantFeedbackContent): boolean {
  return PublishableContestantFeedbackContentSchema.safeParse(content).success;
}

/**
 * Manager-facing operational record: the full publication row, including its pinned source and
 * lifecycle timestamps. This shape is NEVER returned to a contestant.
 */
export const ContestantFeedbackOperationSchema = z
  .object({
    id: z.string().min(1),
    competitionId: z.string().min(1),
    submissionId: z.string().min(1),
    status: ContestantFeedbackStatusSchema,
    sourceReviewerEvaluationId: z.string().min(1),
    content: ContestantFeedbackContentSchema,
    createdByUserId: z.string().min(1),
    publishedByUserId: z.string().min(1).nullable(),
    createdAt: z.number().int().nonnegative(),
    updatedAt: z.number().int().nonnegative(),
    publishedAt: z.number().int().nonnegative().nullable(),
  })
  .strict()
  .refine(
    (value) =>
      (value.status === "PUBLISHED" &&
        value.publishedAt !== null &&
        value.publishedByUserId !== null) ||
      (value.status === "DRAFT" && value.publishedAt === null && value.publishedByUserId === null),
    { message: "Yayımlanma bilgisi durumla eşleşmelidir." },
  );
export type ContestantFeedbackOperation = z.infer<typeof ContestantFeedbackOperationSchema>;

/**
 * A deterministic DRAFT SUGGESTION assembled from already-persisted, server-validated data: the
 * source evaluation's human criterion scores/notes and the run's validated `RubricSuggestion`
 * missing points. This is NOT a second AI call and NOT publication content — it is offered so the
 * manager does not start from a blank page, and the manager must review and edit it into
 * `ContestantFeedbackContentSchema` themselves before anything can be published. Nothing here is
 * ever written directly to a `ContestantFeedback` row.
 */
export const ContestantFeedbackSuggestionSchema = z
  .object({
    summary: z.string().min(1).max(MAX_FEEDBACK_SUMMARY_CHARACTERS),
    strengths: pointListSchema,
    improvements: pointListSchema,
  })
  .strict();
export type ContestantFeedbackSuggestion = z.infer<typeof ContestantFeedbackSuggestionSchema>;

/**
 * The SAFE published projection — the only shape a contestant ever receives. It deliberately omits
 * every internal identifier and signal: no `AnalysisRunId`, no reviewer identity, no similarity or
 * priority data, no raw AnalysisCheck details, no AI provider output. A numeric final score is
 * intentionally not included; the product policy is qualitative feedback, not a published score.
 *
 * All four content sections are required rather than optional: publication already enforces
 * `PublishableContestantFeedbackContentSchema`, so a published result that reached a contestant
 * without strengths, improvements or recommendations would be a contract violation, not a valid
 * partial response.
 */
export const PublishedContestantFeedbackResponseSchema = z
  .object({
    submissionId: z.string().min(1),
    applicationCode: z.string().min(1).max(80),
    projectTitle: z.string().min(1).max(240),
    categoryName: z.string().min(1).max(160),
    publishedAt: z.number().int().nonnegative(),
    summary: z.string().trim().min(1).max(MAX_FEEDBACK_SUMMARY_CHARACTERS),
    strengths: requiredPointListSchema("Güçlü yönler"),
    improvements: requiredPointListSchema("Gelişim alanları"),
    recommendations: requiredPointListSchema("Öneriler"),
  })
  .strict();
export type PublishedContestantFeedbackResponse = z.infer<
  typeof PublishedContestantFeedbackResponseSchema
>;

/**
 * One SUBMITTED ReviewerEvaluation the manager may pick as this submission's feedback source. Only
 * evaluations that are actually SUBMITTED are ever listed; a DRAFT evaluation never appears here, so
 * a client cannot select an unfinished evaluation even by guessing its id.
 */
export const EligibleFeedbackSourceSchema = z
  .object({
    reviewerEvaluationId: z.string().min(1),
    reviewerName: z.string().min(1).max(200),
    reviewerEmail: z.string().min(1).max(320),
    submittedAt: z.number().int().nonnegative(),
    humanTotal: z.number().int().nonnegative(),
    humanMaxTotal: z.number().int().nonnegative(),
  })
  .strict();
export type EligibleFeedbackSource = z.infer<typeof EligibleFeedbackSourceSchema>;

export const EligibleFeedbackSourceListResponseSchema = z
  .object({ sources: z.array(EligibleFeedbackSourceSchema).max(50) })
  .strict();
export type EligibleFeedbackSourceListResponse = z.infer<
  typeof EligibleFeedbackSourceListResponseSchema
>;

/** One row of `/api/v1/me/submissions` — only the submissions this session user participates in. */
export const ContestantOwnedSubmissionSchema = z
  .object({
    submissionId: z.string().min(1),
    applicationCode: z.string().min(1).max(80),
    projectTitle: z.string().min(1).max(240),
    categoryName: z.string().min(1).max(160),
    feedbackPublished: z.boolean(),
  })
  .strict();
export type ContestantOwnedSubmission = z.infer<typeof ContestantOwnedSubmissionSchema>;

export const ContestantOwnedSubmissionListResponseSchema = z
  .object({ submissions: z.array(ContestantOwnedSubmissionSchema).max(500) })
  .strict();
export type ContestantOwnedSubmissionListResponse = z.infer<
  typeof ContestantOwnedSubmissionListResponseSchema
>;
