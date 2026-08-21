import type { ReviewerEvaluationStatus, ReviewerEvaluationSummary } from "@teknofest-ai/shared";
import { MAX_REVIEWER_CRITERION_SCORES } from "@teknofest-ai/shared";

export type ReviewerEvaluationRepositoryErrorCode = "NOT_FOUND" | "CONFLICT" | "VALIDATION";
export type ReviewerEvaluationRepositoryErrorReason =
  | "ASSIGNMENT"
  | "ANALYSIS_RUN"
  | "RUN_NOT_READY"
  | "STALE_RUN"
  | "SUBMITTED_IMMUTABLE"
  | "ALREADY_EXISTS"
  | "CRITERION"
  | "SCORE_RANGE"
  | "INCOMPLETE"
  | "RESOURCE";

export class ReviewerEvaluationRepositoryError extends Error {
  readonly code: ReviewerEvaluationRepositoryErrorCode;
  readonly reason: ReviewerEvaluationRepositoryErrorReason;

  constructor(
    code: ReviewerEvaluationRepositoryErrorCode,
    reason: ReviewerEvaluationRepositoryErrorReason,
  ) {
    super(`${code}:${reason}`);
    this.name = "ReviewerEvaluationRepositoryError";
    this.code = code;
    this.reason = reason;
  }
}

export interface ReviewerCriterionScoreRecord {
  criterionId: string;
  score: number;
  note: string | null;
}

export interface ReviewerEvaluationWriteInput {
  competitionId: string;
  assignmentId: string;
  /** Always the authenticated session user; never a client-supplied reviewer identity. */
  reviewerUserId: string;
  analysisRunId: string;
  overallNote: string | null;
  scores: readonly ReviewerCriterionScoreRecord[];
  submit: boolean;
}

interface EvaluationRow {
  id: string;
  assignment_id: string;
  submission_id: string;
  analysis_run_id: string;
  rubric_version_id: string;
  status: ReviewerEvaluationStatus;
  overall_note: string | null;
  created_at: number;
  updated_at: number;
  submitted_at: number | null;
}

function mapEvaluation(row: EvaluationRow): ReviewerEvaluationSummary {
  return {
    id: row.id,
    assignmentId: row.assignment_id,
    analysisRunId: row.analysis_run_id,
    rubricVersionId: row.rubric_version_id,
    status: row.status,
    overallNote: row.overall_note,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    submittedAt: row.submitted_at === null ? null : Number(row.submitted_at),
  };
}

/**
 * An assignment carries at most one ReviewerEvaluation, ever (`UNIQUE(assignment_id)`). Once it
 * exists — draft or submitted — its pinned `analysisRunId` and `rubricVersionId` never change; a
 * later AnalysisRun or RubricVersion activation never rewrites it.
 */
export async function getReviewerEvaluation(
  binding: D1Database,
  assignmentId: string,
): Promise<ReviewerEvaluationSummary | null> {
  const row = await binding
    .prepare("SELECT * FROM reviewer_evaluation WHERE assignment_id = ? LIMIT 1")
    .bind(assignmentId)
    .first<EvaluationRow>();
  return row ? mapEvaluation(row) : null;
}

export async function listReviewerCriterionScores(
  binding: D1Database,
  reviewerEvaluationId: string,
): Promise<ReviewerCriterionScoreRecord[]> {
  const { results } = await binding
    .prepare(
      `SELECT score.criterion_id, score.score, score.note
       FROM reviewer_criterion_score score
       INNER JOIN criterion ON criterion.id = score.criterion_id
       WHERE score.reviewer_evaluation_id = ?
       ORDER BY criterion.sort_order ASC, criterion.id ASC`,
    )
    .bind(reviewerEvaluationId)
    .all<{ criterion_id: string; score: number; note: string | null }>();

  return results.map((row) => ({
    criterionId: row.criterion_id,
    score: Number(row.score),
    note: row.note,
  }));
}

interface WriteContextRow {
  submission_id: string;
  analysis_run_id: string;
  rubric_version_id: string;
  run_status: string;
}

interface WriteContext {
  submissionId: string;
  analysisRunId: string;
  rubricVersionId: string;
}

/**
 * Resolves the authoritative write context from the database. The assignment must belong to the
 * route competition AND to the session reviewer, the AnalysisRun must belong to that assignment's
 * own submission, and the pinned RubricVersion is read from the run rather than accepted from the
 * request. A client can therefore neither retarget an assignment it does not own, nor pick an
 * arbitrary AnalysisRun, nor pick an arbitrary RubricVersion.
 */
async function resolveWriteContext(
  binding: D1Database,
  input: ReviewerEvaluationWriteInput,
): Promise<WriteContext> {
  const row = await binding
    .prepare(
      `SELECT
         assignment.submission_id AS submission_id,
         run.id AS analysis_run_id,
         run.rubric_version_id AS rubric_version_id,
         run.status AS run_status
       FROM reviewer_assignment assignment
       INNER JOIN analysis_run run
         ON run.submission_id = assignment.submission_id
        AND run.id = ?
       WHERE assignment.id = ?
         AND assignment.competition_id = ?
         AND assignment.reviewer_user_id = ?
       LIMIT 1`,
    )
    .bind(input.analysisRunId, input.assignmentId, input.competitionId, input.reviewerUserId)
    .first<WriteContextRow>();

  if (!row) {
    const assignment = await binding
      .prepare(
        `SELECT id FROM reviewer_assignment
         WHERE id = ? AND competition_id = ? AND reviewer_user_id = ?
         LIMIT 1`,
      )
      .bind(input.assignmentId, input.competitionId, input.reviewerUserId)
      .first();
    throw new ReviewerEvaluationRepositoryError(
      "NOT_FOUND",
      assignment ? "ANALYSIS_RUN" : "ASSIGNMENT",
    );
  }

  if (row.run_status !== "SUCCEEDED") {
    throw new ReviewerEvaluationRepositoryError("CONFLICT", "RUN_NOT_READY");
  }

  return {
    submissionId: row.submission_id,
    analysisRunId: row.analysis_run_id,
    rubricVersionId: row.rubric_version_id,
  };
}

interface PinnedCriterion {
  id: string;
  maxScore: number;
}

async function listPinnedCriteria(
  binding: D1Database,
  rubricVersionId: string,
): Promise<PinnedCriterion[]> {
  const { results } = await binding
    .prepare(
      `SELECT id, max_score FROM criterion
       WHERE rubric_version_id = ?
       ORDER BY sort_order ASC, id ASC
       LIMIT ?`,
    )
    .bind(rubricVersionId, MAX_REVIEWER_CRITERION_SCORES)
    .all<{ id: string; max_score: number }>();
  return results.map((row) => ({ id: row.id, maxScore: Number(row.max_score) }));
}

function isDuplicateEvaluationError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /reviewer_evaluation_assignment_unique|reviewer_evaluation\.assignment_id/i.test(error.message)
  );
}

/**
 * Saves the reviewer's own evaluation. The AI suggestion rows in `rubric_suggestion` are never read
 * or written here: a human score is always the reviewer's input, and accepting the AI suggestion is
 * an explicit reviewer action that writes the same number as a human score.
 *
 * An assignment carries at most one evaluation, ever (`UNIQUE(assignment_id)`). Once it exists —
 * draft or submitted — its pinned `analysisRunId` never changes: a request targeting a different run
 * than the one already pinned is rejected as a stale run rather than moving the pin. A concurrent or
 * retried first save that races another first save for the same assignment loses the unique
 * constraint race and surfaces as a controlled `ALREADY_EXISTS` conflict, never a duplicate row.
 *
 * Every write is guarded on `status = 'DRAFT'`, so a SUBMITTED evaluation is immutable even if a
 * caller replays an older request. Submitting flips the status last, after all per-criterion scores
 * for the run have been persisted.
 */
export async function saveReviewerEvaluation(
  binding: D1Database,
  input: ReviewerEvaluationWriteInput,
): Promise<ReviewerEvaluationSummary> {
  const context = await resolveWriteContext(binding, input);

  const existing = await getReviewerEvaluation(binding, input.assignmentId);
  if (existing) {
    if (existing.status === "SUBMITTED") {
      throw new ReviewerEvaluationRepositoryError("CONFLICT", "SUBMITTED_IMMUTABLE");
    }
    if (existing.analysisRunId !== context.analysisRunId) {
      // The assignment's one evaluation is already pinned to a different AnalysisRun than the one
      // this request targets. The pin never floats, even while the evaluation is still a DRAFT.
      throw new ReviewerEvaluationRepositoryError("CONFLICT", "STALE_RUN");
    }
  }

  const pinnedCriteria = await listPinnedCriteria(binding, context.rubricVersionId);
  const maximumByCriterion = new Map(pinnedCriteria.map((c) => [c.id, c.maxScore]));
  for (const entry of input.scores) {
    const maximum = maximumByCriterion.get(entry.criterionId);
    if (maximum === undefined) {
      throw new ReviewerEvaluationRepositoryError("VALIDATION", "CRITERION");
    }
    if (!Number.isInteger(entry.score) || entry.score < 0 || entry.score > maximum) {
      throw new ReviewerEvaluationRepositoryError("VALIDATION", "SCORE_RANGE");
    }
  }
  if (input.submit) {
    const scored = new Set(input.scores.map((entry) => entry.criterionId));
    if (pinnedCriteria.length === 0 || pinnedCriteria.some((c) => !scored.has(c.id))) {
      throw new ReviewerEvaluationRepositoryError("VALIDATION", "INCOMPLETE");
    }
  }

  const now = Date.now();
  const evaluationId = existing?.id ?? crypto.randomUUID();
  const statements: D1PreparedStatement[] = [];

  if (!existing) {
    statements.push(
      binding
        .prepare(
          `INSERT INTO reviewer_evaluation (
             id, assignment_id, submission_id, analysis_run_id, rubric_version_id, status,
             overall_note, created_at, updated_at, submitted_at
           ) VALUES (?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, null)`,
        )
        .bind(
          evaluationId,
          input.assignmentId,
          context.submissionId,
          context.analysisRunId,
          context.rubricVersionId,
          input.overallNote,
          now,
          now,
        ),
    );
  }

  const keptCriterionIds = input.scores.map((entry) => entry.criterionId);
  const keptPlaceholders = keptCriterionIds.map(() => "?").join(", ");
  statements.push(
    binding
      .prepare(
        `DELETE FROM reviewer_criterion_score
         WHERE reviewer_evaluation_id = ?
           ${keptCriterionIds.length > 0 ? `AND criterion_id NOT IN (${keptPlaceholders})` : ""}
           AND EXISTS (
             SELECT 1 FROM reviewer_evaluation
             WHERE reviewer_evaluation.id = ? AND reviewer_evaluation.status = 'DRAFT'
           )`,
      )
      .bind(evaluationId, ...keptCriterionIds, evaluationId),
  );

  for (const entry of input.scores) {
    statements.push(
      binding
        .prepare(
          `INSERT INTO reviewer_criterion_score (
             id, reviewer_evaluation_id, rubric_version_id, criterion_id, score, note,
             created_at, updated_at
           )
           SELECT ?, ?, ?, ?, ?, ?, ?, ?
           WHERE EXISTS (
                   SELECT 1 FROM reviewer_evaluation
                   WHERE id = ? AND rubric_version_id = ? AND status = 'DRAFT'
                 )
             AND EXISTS (
                   SELECT 1 FROM criterion
                   WHERE id = ? AND rubric_version_id = ? AND ? <= max_score
                 )
           ON CONFLICT (reviewer_evaluation_id, criterion_id) DO UPDATE SET
             score = excluded.score,
             note = excluded.note,
             updated_at = excluded.updated_at`,
        )
        .bind(
          crypto.randomUUID(),
          evaluationId,
          context.rubricVersionId,
          entry.criterionId,
          entry.score,
          entry.note,
          now,
          now,
          evaluationId,
          context.rubricVersionId,
          entry.criterionId,
          context.rubricVersionId,
          entry.score,
        ),
    );
  }

  statements.push(
    input.submit
      ? binding
          .prepare(
            `UPDATE reviewer_evaluation
             SET overall_note = ?, status = 'SUBMITTED', submitted_at = ?, updated_at = ?
             WHERE id = ? AND status = 'DRAFT'`,
          )
          .bind(input.overallNote, now, now, evaluationId)
      : binding
          .prepare(
            `UPDATE reviewer_evaluation
             SET overall_note = ?, updated_at = ?
             WHERE id = ? AND status = 'DRAFT'`,
          )
          .bind(input.overallNote, now, evaluationId),
  );

  let results: D1Result[];
  try {
    results = await binding.batch(statements);
  } catch (error) {
    // A concurrent or retried first save for the same assignment can race this one past the
    // existence check above; the database's UNIQUE(assignment_id) is the actual backstop, and its
    // violation is surfaced as a controlled conflict rather than an unhandled database error.
    if (isDuplicateEvaluationError(error)) {
      throw new ReviewerEvaluationRepositoryError("CONFLICT", "ALREADY_EXISTS");
    }
    throw error;
  }
  if (results.some((result) => !result.success)) {
    throw new ReviewerEvaluationRepositoryError("CONFLICT", "RESOURCE");
  }
  // The final UPDATE is guarded on DRAFT; zero changes means the evaluation was not writable.
  if (results[results.length - 1]?.meta.changes !== 1) {
    throw new ReviewerEvaluationRepositoryError("CONFLICT", "SUBMITTED_IMMUTABLE");
  }

  const saved = await getReviewerEvaluation(binding, input.assignmentId);
  if (!saved) {
    throw new ReviewerEvaluationRepositoryError("NOT_FOUND", "RESOURCE");
  }
  return saved;
}

export const reviewerEvaluationRepository = {
  getReviewerEvaluation,
  listReviewerCriterionScores,
  saveReviewerEvaluation,
};

export type ReviewerEvaluationRepository = typeof reviewerEvaluationRepository;
