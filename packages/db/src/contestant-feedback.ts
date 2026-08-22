import type {
  ContestantFeedbackContent,
  ContestantFeedbackOperation,
  ContestantFeedbackStatus,
  ContestantFeedbackSuggestion,
  ContestantOwnedSubmission,
  EligibleFeedbackSource,
  PublishedContestantFeedbackResponse,
} from "@teknofest-ai/shared";
import {
  ContestantFeedbackSuggestionSchema,
  isPublishableFeedbackContent,
  MAX_FEEDBACK_POINTS,
} from "@teknofest-ai/shared";

export type ContestantFeedbackRepositoryErrorCode = "NOT_FOUND" | "CONFLICT" | "VALIDATION";
export type ContestantFeedbackRepositoryErrorReason =
  | "SUBMISSION"
  | "EVALUATION"
  | "STALE_SOURCE"
  | "PUBLISHED_IMMUTABLE"
  | "INCOMPLETE"
  | "RESOURCE";

export class ContestantFeedbackRepositoryError extends Error {
  readonly code: ContestantFeedbackRepositoryErrorCode;
  readonly reason: ContestantFeedbackRepositoryErrorReason;

  constructor(
    code: ContestantFeedbackRepositoryErrorCode,
    reason: ContestantFeedbackRepositoryErrorReason,
  ) {
    super(`${code}:${reason}`);
    this.name = "ContestantFeedbackRepositoryError";
    this.code = code;
    this.reason = reason;
  }
}

export interface ContestantFeedbackDraftInput {
  competitionId: string;
  submissionId: string;
  sourceReviewerEvaluationId: string;
  content: ContestantFeedbackContent;
  userId: string;
}

interface FeedbackRow {
  id: string;
  competition_id: string;
  submission_id: string;
  source_reviewer_evaluation_id: string;
  status: ContestantFeedbackStatus;
  summary: string | null;
  strengths_json: string;
  improvements_json: string;
  recommendations_json: string;
  created_by_user_id: string;
  published_by_user_id: string | null;
  created_at: number;
  updated_at: number;
  published_at: number | null;
}

function parsePointList(value: string): string[] {
  const parsed = JSON.parse(value);
  return Array.isArray(parsed) ? parsed.filter((entry) => typeof entry === "string") : [];
}

function mapFeedback(row: FeedbackRow): ContestantFeedbackOperation {
  return {
    id: row.id,
    competitionId: row.competition_id,
    submissionId: row.submission_id,
    status: row.status,
    sourceReviewerEvaluationId: row.source_reviewer_evaluation_id,
    content: {
      summary: row.summary,
      strengths: parsePointList(row.strengths_json),
      improvements: parsePointList(row.improvements_json),
      recommendations: parsePointList(row.recommendations_json),
    },
    createdByUserId: row.created_by_user_id,
    publishedByUserId: row.published_by_user_id,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    publishedAt: row.published_at === null ? null : Number(row.published_at),
  };
}

/**
 * Competition-scoped read of the manager-facing operational record, including its pinned source
 * and lifecycle timestamps. This shape is never returned to a contestant.
 */
export async function getContestantFeedback(
  binding: D1Database,
  competitionId: string,
  submissionId: string,
): Promise<ContestantFeedbackOperation | null> {
  const row = await binding
    .prepare(
      `SELECT * FROM contestant_feedback WHERE competition_id = ? AND submission_id = ? LIMIT 1`,
    )
    .bind(competitionId, submissionId)
    .first<FeedbackRow>();
  return row ? mapFeedback(row) : null;
}

interface SourceEvaluationRow {
  id: string;
}

/**
 * Resolves the pinned source: a ReviewerEvaluation that is SUBMITTED, belongs to this submission,
 * and whose assignment belongs to this same competition. A client can therefore never select an
 * evaluation from another submission or another competition, and can never build a publication out
 * of a draft (unfinished) evaluation.
 */
async function resolveSourceEvaluation(
  binding: D1Database,
  competitionId: string,
  submissionId: string,
  sourceReviewerEvaluationId: string,
): Promise<void> {
  const row = await binding
    .prepare(
      `SELECT evaluation.id AS id
       FROM reviewer_evaluation evaluation
       INNER JOIN reviewer_assignment assignment ON assignment.id = evaluation.assignment_id
       WHERE evaluation.id = ?
         AND evaluation.submission_id = ?
         AND evaluation.status = 'SUBMITTED'
         AND assignment.competition_id = ?
       LIMIT 1`,
    )
    .bind(sourceReviewerEvaluationId, submissionId, competitionId)
    .first<SourceEvaluationRow>();
  if (!row) {
    throw new ContestantFeedbackRepositoryError("NOT_FOUND", "EVALUATION");
  }
}

interface EligibleSourceRow {
  evaluation_id: string;
  reviewer_name: string;
  reviewer_email: string;
  submitted_at: number;
  human_total: number | null;
  max_total: number | null;
}

/**
 * SUBMITTED ReviewerEvaluations for this submission, competition-scoped through the owning
 * assignment. Only these may ever be picked as a feedback source: a DRAFT evaluation is never
 * listed, so a manager (and therefore a client) cannot select an unfinished evaluation.
 */
export async function listEligibleFeedbackSources(
  binding: D1Database,
  competitionId: string,
  submissionId: string,
): Promise<EligibleFeedbackSource[]> {
  const { results } = await binding
    .prepare(
      `SELECT
         evaluation.id AS evaluation_id,
         reviewer.name AS reviewer_name,
         reviewer.email AS reviewer_email,
         evaluation.submitted_at AS submitted_at,
         (SELECT sum(score.score) FROM reviewer_criterion_score score
            WHERE score.reviewer_evaluation_id = evaluation.id) AS human_total,
         (SELECT sum(criterion.max_score) FROM criterion
            WHERE criterion.rubric_version_id = evaluation.rubric_version_id) AS max_total
       FROM reviewer_evaluation evaluation
       INNER JOIN reviewer_assignment assignment ON assignment.id = evaluation.assignment_id
       INNER JOIN "user" reviewer ON reviewer.id = assignment.reviewer_user_id
       WHERE assignment.competition_id = ?
         AND evaluation.submission_id = ?
         AND evaluation.status = 'SUBMITTED'
       ORDER BY evaluation.submitted_at DESC, evaluation.id DESC
       LIMIT 50`,
    )
    .bind(competitionId, submissionId)
    .all<EligibleSourceRow>();

  return results.map((row) => ({
    reviewerEvaluationId: row.evaluation_id,
    reviewerName: row.reviewer_name,
    reviewerEmail: row.reviewer_email,
    submittedAt: Number(row.submitted_at),
    humanTotal: row.human_total === null ? 0 : Number(row.human_total),
    humanMaxTotal: row.max_total === null ? 0 : Number(row.max_total),
  }));
}

/**
 * Creates or updates the DRAFT publication. The AI-assisted suggestion surface (deterministically
 * derived from the same submitted evaluation and its validated rubric suggestions) is never read or
 * written here: this function only ever persists whatever content the manager explicitly submitted,
 * exactly as `saveReviewerEvaluation` never touches the AI suggestion rows it displays alongside the
 * human score.
 *
 * `source_reviewer_evaluation_id` is pinned on first save: once a DRAFT exists, a request naming a
 * different evaluation is rejected as `STALE_SOURCE` rather than moving the pin, the same historical
 * discipline `ReviewerEvaluation.analysisRunId` uses. A `PUBLISHED` row is immutable; every write
 * here is guarded on `status = 'DRAFT'`.
 */
export async function saveContestantFeedbackDraft(
  binding: D1Database,
  input: ContestantFeedbackDraftInput,
): Promise<ContestantFeedbackOperation> {
  await resolveSourceEvaluation(
    binding,
    input.competitionId,
    input.submissionId,
    input.sourceReviewerEvaluationId,
  );

  const now = Date.now();
  const id = crypto.randomUUID();
  const strengthsJson = JSON.stringify(input.content.strengths);
  const improvementsJson = JSON.stringify(input.content.improvements);
  const recommendationsJson = JSON.stringify(input.content.recommendations);

  const result = await binding
    .prepare(
      `INSERT INTO contestant_feedback (
         id, competition_id, submission_id, source_reviewer_evaluation_id, status,
         summary, strengths_json, improvements_json, recommendations_json,
         created_by_user_id, created_at, updated_at
       ) VALUES (?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (submission_id) DO UPDATE SET
         summary = excluded.summary,
         strengths_json = excluded.strengths_json,
         improvements_json = excluded.improvements_json,
         recommendations_json = excluded.recommendations_json,
         updated_at = excluded.updated_at
       WHERE contestant_feedback.status = 'DRAFT'
         AND contestant_feedback.source_reviewer_evaluation_id = excluded.source_reviewer_evaluation_id`,
    )
    .bind(
      id,
      input.competitionId,
      input.submissionId,
      input.sourceReviewerEvaluationId,
      input.content.summary,
      strengthsJson,
      improvementsJson,
      recommendationsJson,
      input.userId,
      now,
      now,
    )
    .run();

  if (result.meta.changes !== 1) {
    const existing = await getContestantFeedback(binding, input.competitionId, input.submissionId);
    if (existing?.status === "PUBLISHED") {
      throw new ContestantFeedbackRepositoryError("CONFLICT", "PUBLISHED_IMMUTABLE");
    }
    if (existing && existing.sourceReviewerEvaluationId !== input.sourceReviewerEvaluationId) {
      throw new ContestantFeedbackRepositoryError("CONFLICT", "STALE_SOURCE");
    }
    throw new ContestantFeedbackRepositoryError("CONFLICT", "RESOURCE");
  }

  const saved = await getContestantFeedback(binding, input.competitionId, input.submissionId);
  if (!saved) {
    throw new ContestantFeedbackRepositoryError("NOT_FOUND", "RESOURCE");
  }
  return saved;
}

/**
 * Publishes the DRAFT. A DRAFT may stay partial indefinitely, but a PUBLICATION must carry every
 * section the contestant flow promises: a summary plus at least one strength, one area for
 * improvement and one recommendation (`PublishableContestantFeedbackContentSchema`). Incomplete
 * content is rejected rather than completed here — the manager remains the author, and nothing on
 * this path performs AI inference or invents a missing section. No unfinished ReviewerEvaluation can
 * be the source either (`resolveSourceEvaluation` above already required SUBMITTED at draft-save
 * time).
 */
export async function publishContestantFeedback(
  binding: D1Database,
  competitionId: string,
  submissionId: string,
  userId: string,
): Promise<ContestantFeedbackOperation> {
  const draft = await getContestantFeedback(binding, competitionId, submissionId);
  if (!draft) {
    throw new ContestantFeedbackRepositoryError("NOT_FOUND", "SUBMISSION");
  }
  if (draft.status === "PUBLISHED") {
    throw new ContestantFeedbackRepositoryError("CONFLICT", "PUBLISHED_IMMUTABLE");
  }
  if (!isPublishableFeedbackContent(draft.content)) {
    throw new ContestantFeedbackRepositoryError("VALIDATION", "INCOMPLETE");
  }

  const now = Date.now();
  // The guards are repeated in SQL so a concurrent publish/edit racing between the read above and
  // this write can never slip an incomplete or already-published row through.
  const result = await binding
    .prepare(
      `UPDATE contestant_feedback
       SET status = 'PUBLISHED', published_at = ?, published_by_user_id = ?, updated_at = ?
       WHERE competition_id = ?
         AND submission_id = ?
         AND status = 'DRAFT'
         AND summary IS NOT NULL
         AND json_array_length(strengths_json) > 0
         AND json_array_length(improvements_json) > 0
         AND json_array_length(recommendations_json) > 0`,
    )
    .bind(now, userId, now, competitionId, submissionId)
    .run();

  if (result.meta.changes !== 1) {
    const existing = await getContestantFeedback(binding, competitionId, submissionId);
    if (!existing) {
      throw new ContestantFeedbackRepositoryError("NOT_FOUND", "SUBMISSION");
    }
    if (existing.status === "PUBLISHED") {
      throw new ContestantFeedbackRepositoryError("CONFLICT", "PUBLISHED_IMMUTABLE");
    }
    throw new ContestantFeedbackRepositoryError("VALIDATION", "INCOMPLETE");
  }

  const published = await getContestantFeedback(binding, competitionId, submissionId);
  if (!published) {
    throw new ContestantFeedbackRepositoryError("NOT_FOUND", "RESOURCE");
  }
  return published;
}

interface PublishedFeedbackRow {
  submission_id: string;
  application_code: string;
  project_title: string;
  category_name: string;
  published_at: number;
  summary: string;
  strengths_json: string;
  improvements_json: string;
  recommendations_json: string;
}

/**
 * The SAFE published projection for a contestant's own submission. Ownership (`submission_participant`)
 * and publication status are checked in the SAME query, so an unowned submission and an unpublished
 * (or nonexistent) feedback record are indistinguishable — both simply return null, never a
 * different error that would reveal one case from the other.
 *
 * The completeness predicate is repeated here rather than trusted from the publish path: a row that
 * somehow lacks a promised section is treated as "nothing published yet" instead of being served as
 * a partial result.
 */
export async function getPublishedFeedbackForContestant(
  binding: D1Database,
  userId: string,
  submissionId: string,
): Promise<PublishedContestantFeedbackResponse | null> {
  const row = await binding
    .prepare(
      `SELECT
         submission.id AS submission_id,
         submission.application_code AS application_code,
         submission.project_title AS project_title,
         category.name AS category_name,
         feedback.published_at AS published_at,
         feedback.summary AS summary,
         feedback.strengths_json AS strengths_json,
         feedback.improvements_json AS improvements_json,
         feedback.recommendations_json AS recommendations_json
       FROM submission_participant participant
       INNER JOIN submission ON submission.id = participant.submission_id
       INNER JOIN category ON category.id = submission.category_id
       INNER JOIN contestant_feedback feedback
         ON feedback.submission_id = submission.id AND feedback.status = 'PUBLISHED'
       WHERE participant.user_id = ?
         AND participant.submission_id = ?
         AND feedback.summary IS NOT NULL
         AND json_array_length(feedback.strengths_json) > 0
         AND json_array_length(feedback.improvements_json) > 0
         AND json_array_length(feedback.recommendations_json) > 0
       LIMIT 1`,
    )
    .bind(userId, submissionId)
    .first<PublishedFeedbackRow>();

  if (!row) return null;
  return {
    submissionId: row.submission_id,
    applicationCode: row.application_code,
    projectTitle: row.project_title,
    categoryName: row.category_name,
    publishedAt: Number(row.published_at),
    summary: row.summary,
    strengths: parsePointList(row.strengths_json),
    improvements: parsePointList(row.improvements_json),
    recommendations: parsePointList(row.recommendations_json),
  };
}

interface OwnedSubmissionRow {
  submission_id: string;
  application_code: string;
  project_title: string;
  category_name: string;
  feedback_published: number;
}

/** Every submission the session user participates in, across every competition. */
export async function listMySubmissions(
  binding: D1Database,
  userId: string,
): Promise<ContestantOwnedSubmission[]> {
  const { results } = await binding
    .prepare(
      `SELECT
         submission.id AS submission_id,
         submission.application_code AS application_code,
         submission.project_title AS project_title,
         category.name AS category_name,
         (SELECT count(*) FROM contestant_feedback
            WHERE contestant_feedback.submission_id = submission.id
              AND contestant_feedback.status = 'PUBLISHED') AS feedback_published
       FROM submission_participant participant
       INNER JOIN submission ON submission.id = participant.submission_id
       INNER JOIN category ON category.id = submission.category_id
       WHERE participant.user_id = ?
       ORDER BY submission.application_code ASC, submission.id ASC
       LIMIT 500`,
    )
    .bind(userId)
    .all<OwnedSubmissionRow>();

  return results.map((row) => ({
    submissionId: row.submission_id,
    applicationCode: row.application_code,
    projectTitle: row.project_title,
    categoryName: row.category_name,
    feedbackPublished: Number(row.feedback_published) > 0,
  }));
}

interface SuggestionSourceRow {
  title: string;
  max_score: number;
  human_score: number | null;
  missing_points_json: string | null;
}

// A criterion counts as a strength once the human score reaches this fraction of the criterion's
// own maximum. Provisional product policy, exactly like the similarity thresholds elsewhere in this
// system — not a calibrated boundary.
const SUGGESTION_STRENGTH_RATIO = 0.75;

/**
 * Deterministically drafts a suggestion from data that is ALREADY persisted and ALREADY validated:
 * the source evaluation's own human criterion scores, and that same AnalysisRun's server-verified
 * `RubricSuggestion.missingPoints`. This performs no AI call of any kind — it is arithmetic and
 * string templating over numbers and strings a human reviewer and a prior, already-validated AI
 * rubric run produced.
 *
 * This is INTERNAL SOURCE DATA, not publication content: nothing this function returns is ever
 * written to a `ContestantFeedback` row directly. A manager must copy, edit and explicitly save it
 * through `saveContestantFeedbackDraft` before it can ever reach a contestant, and only after
 * `publishContestantFeedback` can a contestant see any of it.
 */
export async function getContestantFeedbackSuggestion(
  binding: D1Database,
  submissionId: string,
  sourceReviewerEvaluationId: string,
): Promise<ContestantFeedbackSuggestion> {
  const { results } = await binding
    .prepare(
      `SELECT
         criterion.title AS title,
         criterion.max_score AS max_score,
         score.score AS human_score,
         suggestion.missing_points_json AS missing_points_json
       FROM reviewer_evaluation evaluation
       INNER JOIN criterion ON criterion.rubric_version_id = evaluation.rubric_version_id
       LEFT JOIN reviewer_criterion_score score
         ON score.reviewer_evaluation_id = evaluation.id AND score.criterion_id = criterion.id
       LEFT JOIN rubric_suggestion suggestion
         ON suggestion.analysis_run_id = evaluation.analysis_run_id
        AND suggestion.criterion_id = criterion.id
       WHERE evaluation.id = ? AND evaluation.submission_id = ?
       ORDER BY criterion.sort_order ASC, criterion.id ASC`,
    )
    .bind(sourceReviewerEvaluationId, submissionId)
    .all<SuggestionSourceRow>();

  const strengths: string[] = [];
  const improvements: string[] = [];
  let scoredCount = 0;
  let strongCount = 0;

  for (const row of results) {
    if (row.human_score === null) continue;
    scoredCount += 1;
    const maxScore = Number(row.max_score);
    const humanScore = Number(row.human_score);
    const ratio = maxScore > 0 ? humanScore / maxScore : 0;
    if (ratio >= SUGGESTION_STRENGTH_RATIO) {
      strongCount += 1;
      if (strengths.length < MAX_FEEDBACK_POINTS) {
        strengths.push(`${row.title}: ${humanScore}/${maxScore} puanla güçlü değerlendirildi.`);
      }
      continue;
    }
    const missingPoints = row.missing_points_json ? parsePointList(row.missing_points_json) : [];
    if (missingPoints.length > 0) {
      for (const point of missingPoints) {
        if (improvements.length >= MAX_FEEDBACK_POINTS) break;
        improvements.push(`${row.title}: ${point}`);
      }
    } else if (improvements.length < MAX_FEEDBACK_POINTS) {
      improvements.push(`${row.title}: ${humanScore}/${maxScore} puanla geliştirmeye açık.`);
    }
  }

  const summary =
    scoredCount === 0
      ? "Bu değerlendirmede henüz puanlanmış bir kriter yok."
      : `Hakem değerlendirmesinde puanlanan ${scoredCount} kriterin ${strongCount} tanesinde güçlü sonuç elde edildi.`;

  return ContestantFeedbackSuggestionSchema.parse({
    summary,
    strengths: strengths.slice(0, MAX_FEEDBACK_POINTS),
    improvements: improvements.slice(0, MAX_FEEDBACK_POINTS),
  });
}

export const contestantFeedbackRepository = {
  getContestantFeedback,
  getContestantFeedbackSuggestion,
  getPublishedFeedbackForContestant,
  listEligibleFeedbackSources,
  listMySubmissions,
  publishContestantFeedback,
  saveContestantFeedbackDraft,
};

export type ContestantFeedbackRepository = typeof contestantFeedbackRepository;
