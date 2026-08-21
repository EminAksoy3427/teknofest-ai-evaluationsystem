import type {
  AssignedSubmission,
  EligibleReviewer,
  ReviewerAssignmentOperation,
  ReviewerAssignmentResponse,
  ReviewerEvaluationStatus,
  ReviewerQueueItem,
  ReviewerQueueState,
} from "@teknofest-ai/shared";
import { MAX_REVIEWER_ASSIGNMENT_OPERATIONS, MAX_REVIEWER_QUEUE_ITEMS } from "@teknofest-ai/shared";

export type ReviewerAssignmentRepositoryErrorCode = "NOT_FOUND" | "CONFLICT";
export type ReviewerAssignmentRepositoryErrorReason =
  | "ASSIGNMENT"
  | "SUBMISSION"
  | "REVIEWER_MEMBERSHIP"
  | "DUPLICATE_ASSIGNMENT"
  | "SUBMITTED_EVALUATION";

export class ReviewerAssignmentRepositoryError extends Error {
  readonly code: ReviewerAssignmentRepositoryErrorCode;
  readonly reason: ReviewerAssignmentRepositoryErrorReason;

  constructor(
    code: ReviewerAssignmentRepositoryErrorCode,
    reason: ReviewerAssignmentRepositoryErrorReason,
  ) {
    super(`${code}:${reason}`);
    this.name = "ReviewerAssignmentRepositoryError";
    this.code = code;
    this.reason = reason;
  }
}

export interface ReviewerAssignmentInput {
  id: string;
  competitionId: string;
  submissionId: string;
  reviewerUserId: string;
  assignedByUserId: string;
}

export interface ReviewerAssignmentRecord {
  id: string;
  competitionId: string;
  submissionId: string;
  reviewerUserId: string;
  assignedByUserId: string;
  createdAt: number;
  updatedAt: number;
}

interface AssignmentRow {
  id: string;
  competition_id: string;
  submission_id: string;
  reviewer_user_id: string;
  assigned_by_user_id: string;
  created_at: number;
  updated_at: number;
}

function mapAssignment(row: AssignmentRow): ReviewerAssignmentRecord {
  return {
    id: row.id,
    competitionId: row.competition_id,
    submissionId: row.submission_id,
    reviewerUserId: row.reviewer_user_id,
    assignedByUserId: row.assigned_by_user_id,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

export function toReviewerAssignmentResponse(
  record: ReviewerAssignmentRecord,
): ReviewerAssignmentResponse {
  return { ...record };
}

function isDuplicateAssignmentError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /reviewer_assignment_submission_reviewer_unique|reviewer_assignment\.submission_id/i.test(
      error.message,
    )
  );
}

/**
 * The competition, the submission and the reviewer membership are all resolved from the database in
 * a single guarded statement: the inserted `competition_id` and `submission_id` come from the
 * `submission` row itself, and the reviewer must already hold a `REVIEWER` membership in that same
 * competition. A caller therefore cannot assign a submission that belongs to another competition,
 * nor a user who is not a reviewer there, even by sending mismatched identifiers.
 */
export async function createReviewerAssignment(
  binding: D1Database,
  input: ReviewerAssignmentInput,
): Promise<ReviewerAssignmentRecord> {
  const now = Date.now();
  let result: D1Result;
  try {
    result = await binding
      .prepare(
        `INSERT INTO reviewer_assignment (
           id, competition_id, submission_id, reviewer_user_id, assigned_by_user_id,
           created_at, updated_at
         )
         SELECT ?, submission.competition_id, submission.id, competition_member.user_id, ?, ?, ?
         FROM submission
         INNER JOIN competition_member
           ON competition_member.competition_id = submission.competition_id
          AND competition_member.user_id = ?
          AND competition_member.role = 'REVIEWER'
         WHERE submission.id = ?
           AND submission.competition_id = ?
         LIMIT 1`,
      )
      .bind(
        input.id,
        input.assignedByUserId,
        now,
        now,
        input.reviewerUserId,
        input.submissionId,
        input.competitionId,
      )
      .run();
  } catch (error) {
    if (isDuplicateAssignmentError(error)) {
      throw new ReviewerAssignmentRepositoryError("CONFLICT", "DUPLICATE_ASSIGNMENT");
    }
    throw error;
  }

  if (result.meta.changes !== 1) {
    const submission = await binding
      .prepare("SELECT id FROM submission WHERE id = ? AND competition_id = ? LIMIT 1")
      .bind(input.submissionId, input.competitionId)
      .first();
    if (!submission) {
      throw new ReviewerAssignmentRepositoryError("NOT_FOUND", "SUBMISSION");
    }
    throw new ReviewerAssignmentRepositoryError("CONFLICT", "REVIEWER_MEMBERSHIP");
  }

  const created = await getReviewerAssignment(binding, input.competitionId, input.id);
  if (!created) {
    throw new ReviewerAssignmentRepositoryError("NOT_FOUND", "ASSIGNMENT");
  }
  return created;
}

/** Competition-scoped read. A row from another competition is never returned. */
export async function getReviewerAssignment(
  binding: D1Database,
  competitionId: string,
  assignmentId: string,
): Promise<ReviewerAssignmentRecord | null> {
  const row = await binding
    .prepare("SELECT * FROM reviewer_assignment WHERE id = ? AND competition_id = ? LIMIT 1")
    .bind(assignmentId, competitionId)
    .first<AssignmentRow>();
  return row ? mapAssignment(row) : null;
}

/**
 * Resolves an assignment only when the session user is its own reviewer. Reviewer routes call this
 * instead of `getReviewerAssignment` so that another reviewer's assignment is indistinguishable
 * from a non-existent one.
 */
export async function getOwnedReviewerAssignment(
  binding: D1Database,
  competitionId: string,
  assignmentId: string,
  reviewerUserId: string,
): Promise<ReviewerAssignmentRecord | null> {
  const row = await binding
    .prepare(
      `SELECT * FROM reviewer_assignment
       WHERE id = ? AND competition_id = ? AND reviewer_user_id = ?
       LIMIT 1`,
    )
    .bind(assignmentId, competitionId, reviewerUserId)
    .first<AssignmentRow>();
  return row ? mapAssignment(row) : null;
}

/**
 * Unassigns a reviewer. An assignment that already carries a SUBMITTED evaluation is preserved:
 * removing it would destroy a completed human evaluation record. A DRAFT is the reviewer's own work
 * in progress and is removed with the assignment.
 */
export async function deleteReviewerAssignment(
  binding: D1Database,
  competitionId: string,
  assignmentId: string,
): Promise<void> {
  const existing = await getReviewerAssignment(binding, competitionId, assignmentId);
  if (!existing) {
    throw new ReviewerAssignmentRepositoryError("NOT_FOUND", "ASSIGNMENT");
  }

  const result = await binding
    .prepare(
      `DELETE FROM reviewer_assignment
       WHERE id = ?
         AND competition_id = ?
         AND NOT EXISTS (
           SELECT 1 FROM reviewer_evaluation
           WHERE reviewer_evaluation.assignment_id = reviewer_assignment.id
             AND reviewer_evaluation.status = 'SUBMITTED'
         )`,
    )
    .bind(assignmentId, competitionId)
    .run();

  if (result.meta.changes !== 1) {
    throw new ReviewerAssignmentRepositoryError("CONFLICT", "SUBMITTED_EVALUATION");
  }
}

// An assignment carries at most one ReviewerEvaluation (`UNIQUE(assignment_id)`), so this is a
// plain lookup rather than a pick among candidates.
const CURRENT_EVALUATION_SUBQUERY = `(
  SELECT candidate.id FROM reviewer_evaluation candidate
  WHERE candidate.assignment_id = assignment.id
  LIMIT 1
)`;

const LATEST_SUCCEEDED_RUN_SUBQUERY = `(
  SELECT run.id FROM analysis_run run
  WHERE run.submission_id = assignment.submission_id AND run.status = 'SUCCEEDED'
  ORDER BY run.created_at DESC, run.id DESC
  LIMIT 1
)`;

const IN_FLIGHT_RUN_COUNT_SUBQUERY = `(
  SELECT count(*) FROM analysis_run run
  WHERE run.submission_id = assignment.submission_id
    AND run.status IN ('QUEUED', 'PROCESSING')
)`;

interface QueueRow {
  assignment_id: string;
  competition_id: string;
  assigned_at: number;
  submission_id: string;
  application_code: string;
  project_title: string;
  category_id: string;
  category_code: string;
  category_name: string;
  latest_succeeded_run_id: string | null;
  in_flight_run_count: number;
  evaluation_status: ReviewerEvaluationStatus | null;
  evaluation_run_id: string | null;
  submitted_at: number | null;
}

function submissionOf(row: {
  submission_id: string;
  application_code: string;
  project_title: string;
  category_id: string;
  category_code: string;
  category_name: string;
}): AssignedSubmission {
  return {
    id: row.submission_id,
    applicationCode: row.application_code,
    projectTitle: row.project_title,
    category: { id: row.category_id, code: row.category_code, name: row.category_name },
  };
}

/**
 * Derives the queue state from the assignment, the submission's runs and this reviewer's own
 * evaluation. It is never read from a persisted status column, so it cannot disagree with the
 * immutable records it summarises.
 */
function deriveQueueState(row: QueueRow): ReviewerQueueState {
  if (row.evaluation_status === "DRAFT") return "DRAFT";
  if (row.evaluation_status === "SUBMITTED") return "SUBMITTED";
  if (row.latest_succeeded_run_id !== null) return "ASSIGNED";
  if (Number(row.in_flight_run_count) > 0) return "ANALYSIS_PENDING";
  return "ANALYSIS_UNAVAILABLE";
}

/** Lists only the assignments owned by this reviewer inside this one competition. */
export async function listReviewerQueue(
  binding: D1Database,
  competitionId: string,
  reviewerUserId: string,
): Promise<ReviewerQueueItem[]> {
  const { results } = await binding
    .prepare(
      `SELECT
         assignment.id AS assignment_id,
         assignment.competition_id AS competition_id,
         assignment.created_at AS assigned_at,
         submission.id AS submission_id,
         submission.application_code AS application_code,
         submission.project_title AS project_title,
         category.id AS category_id,
         category.code AS category_code,
         category.name AS category_name,
         ${LATEST_SUCCEEDED_RUN_SUBQUERY} AS latest_succeeded_run_id,
         ${IN_FLIGHT_RUN_COUNT_SUBQUERY} AS in_flight_run_count,
         evaluation.status AS evaluation_status,
         evaluation.analysis_run_id AS evaluation_run_id,
         evaluation.submitted_at AS submitted_at
       FROM reviewer_assignment assignment
       INNER JOIN submission ON submission.id = assignment.submission_id
       INNER JOIN category ON category.id = submission.category_id
       LEFT JOIN reviewer_evaluation evaluation ON evaluation.id = ${CURRENT_EVALUATION_SUBQUERY}
       WHERE assignment.competition_id = ? AND assignment.reviewer_user_id = ?
       ORDER BY submission.application_code ASC, assignment.id ASC
       LIMIT ?`,
    )
    .bind(competitionId, reviewerUserId, MAX_REVIEWER_QUEUE_ITEMS)
    .all<QueueRow>();

  return results.map((row) => ({
    assignmentId: row.assignment_id,
    competitionId: row.competition_id,
    submission: submissionOf(row),
    state: deriveQueueState(row),
    analysisRunId: row.evaluation_run_id ?? row.latest_succeeded_run_id,
    evaluationStatus: row.evaluation_status,
    submittedAt: row.submitted_at === null ? null : Number(row.submitted_at),
    assignedAt: Number(row.assigned_at),
  }));
}

interface OperationRow {
  assignment_id: string;
  assigned_by_user_id: string;
  assigned_at: number;
  submission_id: string;
  application_code: string;
  project_title: string;
  category_id: string;
  category_code: string;
  category_name: string;
  reviewer_user_id: string;
  reviewer_name: string;
  reviewer_email: string;
  evaluation_id: string | null;
  evaluation_status: ReviewerEvaluationStatus | null;
  submitted_at: number | null;
  reference_run_id: string | null;
  human_total: number | null;
  max_total: number | null;
  ai_total: number | null;
  disagreement_count: number | null;
}

/**
 * Minimal evaluation-operations projection. Both totals and the disagreement count are aggregated
 * by the database from the persisted per-criterion rows; no client-supplied total is involved, and
 * the AI suggested total is kept as its own column rather than blended into the human total.
 */
export async function listReviewerAssignmentOperations(
  binding: D1Database,
  competitionId: string,
): Promise<ReviewerAssignmentOperation[]> {
  const { results } = await binding
    .prepare(
      `SELECT
         base.*,
         (SELECT sum(score.score) FROM reviewer_criterion_score score
            WHERE score.reviewer_evaluation_id = base.evaluation_id) AS human_total,
         (SELECT sum(criterion.max_score) FROM criterion
            INNER JOIN analysis_run ON analysis_run.rubric_version_id = criterion.rubric_version_id
            WHERE analysis_run.id = base.reference_run_id) AS max_total,
         (SELECT sum(suggestion.suggested_score) FROM rubric_suggestion suggestion
            WHERE suggestion.analysis_run_id = base.reference_run_id) AS ai_total,
         (SELECT count(*) FROM reviewer_criterion_score score
            INNER JOIN rubric_suggestion suggestion
              ON suggestion.analysis_run_id = base.reference_run_id
             AND suggestion.criterion_id = score.criterion_id
            WHERE score.reviewer_evaluation_id = base.evaluation_id
              AND score.score <> suggestion.suggested_score) AS disagreement_count
       FROM (
         SELECT
           assignment.id AS assignment_id,
           assignment.assigned_by_user_id AS assigned_by_user_id,
           assignment.created_at AS assigned_at,
           submission.id AS submission_id,
           submission.application_code AS application_code,
           submission.project_title AS project_title,
           category.id AS category_id,
           category.code AS category_code,
           category.name AS category_name,
           reviewer.id AS reviewer_user_id,
           reviewer.name AS reviewer_name,
           reviewer.email AS reviewer_email,
           evaluation.id AS evaluation_id,
           evaluation.status AS evaluation_status,
           evaluation.submitted_at AS submitted_at,
           coalesce(evaluation.analysis_run_id, ${LATEST_SUCCEEDED_RUN_SUBQUERY}) AS reference_run_id
         FROM reviewer_assignment assignment
         INNER JOIN submission ON submission.id = assignment.submission_id
         INNER JOIN category ON category.id = submission.category_id
         INNER JOIN "user" reviewer ON reviewer.id = assignment.reviewer_user_id
         LEFT JOIN reviewer_evaluation evaluation ON evaluation.id = ${CURRENT_EVALUATION_SUBQUERY}
         WHERE assignment.competition_id = ?
       ) AS base
       ORDER BY base.application_code ASC, base.reviewer_email ASC, base.assignment_id ASC
       LIMIT ?`,
    )
    .bind(competitionId, MAX_REVIEWER_ASSIGNMENT_OPERATIONS)
    .all<OperationRow>();

  return results.map((row) => ({
    assignmentId: row.assignment_id,
    submission: submissionOf(row),
    reviewer: {
      userId: row.reviewer_user_id,
      name: row.reviewer_name,
      email: row.reviewer_email,
    },
    assignedByUserId: row.assigned_by_user_id,
    assignedAt: Number(row.assigned_at),
    evaluationStatus: row.evaluation_status,
    submittedAt: row.submitted_at === null ? null : Number(row.submitted_at),
    analysisRunId: row.reference_run_id,
    humanTotal: row.human_total === null ? null : Number(row.human_total),
    humanMaxTotal: row.max_total === null ? null : Number(row.max_total),
    aiSuggestedTotal: row.ai_total === null ? null : Number(row.ai_total),
    aiMaxTotal: row.max_total === null ? null : Number(row.max_total),
    disagreementCount:
      row.evaluation_id === null || row.disagreement_count === null
        ? null
        : Number(row.disagreement_count),
  }));
}

/** Competition members who actually hold the REVIEWER role, for the assignment picker. */
export async function listEligibleReviewers(
  binding: D1Database,
  competitionId: string,
): Promise<EligibleReviewer[]> {
  const { results } = await binding
    .prepare(
      `SELECT
         reviewer.id AS user_id,
         reviewer.name AS name,
         reviewer.email AS email,
         (SELECT count(*) FROM reviewer_assignment assignment
            WHERE assignment.competition_id = member.competition_id
              AND assignment.reviewer_user_id = reviewer.id) AS assigned_submission_count
       FROM competition_member member
       INNER JOIN "user" reviewer ON reviewer.id = member.user_id
       WHERE member.competition_id = ? AND member.role = 'REVIEWER'
       ORDER BY reviewer.name ASC, reviewer.email ASC`,
    )
    .bind(competitionId)
    .all<{ user_id: string; name: string; email: string; assigned_submission_count: number }>();

  return results.map((row) => ({
    userId: row.user_id,
    name: row.name,
    email: row.email,
    assignedSubmissionCount: Number(row.assigned_submission_count),
  }));
}

export const reviewerAssignmentRepository = {
  createReviewerAssignment,
  deleteReviewerAssignment,
  getOwnedReviewerAssignment,
  getReviewerAssignment,
  listEligibleReviewers,
  listReviewerAssignmentOperations,
  listReviewerQueue,
};

export type ReviewerAssignmentRepository = typeof reviewerAssignmentRepository;
