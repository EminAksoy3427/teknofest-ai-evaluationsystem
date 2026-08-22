import type {
  AnalysisCheckStatus,
  AnalysisCheckType,
  AnalysisErrorCode,
  AnalysisRunStatus,
  AnalysisStage,
  ReviewOperationsItem,
  ReviewOperationsReviewer,
  ReviewPrioritySignals,
  SimilarityLevel,
} from "@teknofest-ai/shared";
import {
  AnalysisCheckDetailsSchema,
  deriveReviewPriority,
  MAX_REVIEW_OPERATIONS_ITEMS,
  MAX_REVIEW_OPERATIONS_REVIEWERS,
} from "@teknofest-ai/shared";

import { listReviewerAssignmentOperations } from "./reviewer-assignment";

/**
 * The Smart Risk Queue ("İnceleme Önceliği") is a DERIVED projection, not a stored value.
 *
 * Every signal it uses was already persisted by a completed AnalysisRun or written by a human
 * reviewer: AnalysisCheck statuses and details, SimilarityPair-backed SIMILARITY details, rubric
 * suggestions, ReviewerAssignments and ReviewerEvaluations. Nothing here calls a model, an embedding
 * provider or a vector index, and nothing here writes a row — recomputing the queue is a pure read.
 *
 * There is deliberately no `risk` table: a persisted priority could drift away from the immutable
 * records it summarises, and every input is cheap to re-read inside one competition.
 *
 * Competition scope is enforced on every statement below. A submission, an AnalysisRun, a check, a
 * similarity observation or an assignment from another competition can never enter this projection.
 */

interface SubmissionRow {
  submission_id: string;
  application_code: string;
  project_title: string;
  category_id: string;
  category_code: string;
  category_name: string;
  sha256: string;
  latest_run_id: string | null;
  latest_run_status: AnalysisRunStatus | null;
  latest_run_stage: AnalysisStage | null;
  latest_run_error_code: AnalysisErrorCode | null;
  reference_run_id: string | null;
}

interface CheckRow {
  analysis_run_id: string;
  type: AnalysisCheckType;
  status: AnalysisCheckStatus;
  details_json: string;
}

/** Newest run of any status: this is what the operations "analysis" column must report. */
const LATEST_RUN_SUBQUERY = `(
  SELECT run.id FROM analysis_run run
  WHERE run.submission_id = submission.id
  ORDER BY run.created_at DESC, run.id DESC
  LIMIT 1
)`;

/**
 * Newest SUCCEEDED run. Only this run's persisted checks are allowed to feed the priority signals,
 * so a newer in-flight or failed run never silently replaces the evidence a reviewer actually has.
 */
const REFERENCE_RUN_SUBQUERY = `(
  SELECT run.id FROM analysis_run run
  WHERE run.submission_id = submission.id AND run.status = 'SUCCEEDED'
  ORDER BY run.created_at DESC, run.id DESC
  LIMIT 1
)`;

interface ReferenceRunSignals {
  checkStatuses: Partial<Record<AnalysisCheckType, AnalysisCheckStatus>>;
  similarityLevel: SimilarityLevel | null;
  exactDocumentMatch: boolean;
  similarityObservationCount: number;
  weakEvidenceSectionCount: number;
  weakEvidenceCriterionCount: number;
  aiSuggestedTotal: number | null;
  aiMaxTotal: number | null;
}

function emptyReferenceRunSignals(): ReferenceRunSignals {
  return {
    checkStatuses: {},
    similarityLevel: null,
    exactDocumentMatch: false,
    similarityObservationCount: 0,
    weakEvidenceSectionCount: 0,
    weakEvidenceCriterionCount: 0,
    aiSuggestedTotal: null,
    aiMaxTotal: null,
  };
}

/**
 * Reduces one reference run's persisted checks into priority signals. The stored details are parsed
 * through the same shared runtime schema the API uses, so a malformed row fails loudly instead of
 * quietly producing a misleading priority.
 */
function reduceChecks(rows: readonly CheckRow[]): ReferenceRunSignals {
  const signals = emptyReferenceRunSignals();
  for (const row of rows) {
    signals.checkStatuses[row.type] = row.status;
    const details = AnalysisCheckDetailsSchema.parse(JSON.parse(row.details_json));

    if (details.checkType === "SIMILARITY") {
      signals.similarityLevel = details.level;
      signals.similarityObservationCount = details.topMatches.length;
      // An exact byte match is an attention signal only. It never becomes a plagiarism finding here
      // or anywhere downstream.
      signals.exactDocumentMatch =
        signals.exactDocumentMatch || details.topMatches.some((match) => match.exactDocumentMatch);
    }

    if (details.checkType === "SECTION_CONTENT") {
      // Weak EVIDENCE, kept distinct from a weak assessment: the assessment already drives the
      // SECTION_CONTENT WARN/FAIL reason, so counting it again here would weigh it twice.
      signals.weakEvidenceSectionCount = details.sections.filter(
        (section) => section.required && section.evidenceStrength === "LOW",
      ).length;
    }

    if (details.checkType === "RUBRIC_EVALUATION") {
      signals.weakEvidenceCriterionCount = details.criteria.filter(
        (criterion) => criterion.evidenceStrength === "LOW",
      ).length;
      signals.aiSuggestedTotal = details.suggestedTotalScore;
      signals.aiMaxTotal = details.maxTotalScore;
    }
  }
  return signals;
}

/**
 * Builds the competition's evaluation-operations queue. Three competition-scoped reads and pure
 * derivation; the reviewer projection is reused from the assignment repository rather than
 * duplicating its aggregate SQL.
 */
export async function listReviewOperations(
  binding: D1Database,
  competitionId: string,
): Promise<ReviewOperationsItem[]> {
  const [{ results: submissionRows }, { results: checkRows }, assignments] = await Promise.all([
    binding
      .prepare(
        `SELECT
           submission.id AS submission_id,
           submission.application_code AS application_code,
           submission.project_title AS project_title,
           category.id AS category_id,
           category.code AS category_code,
           category.name AS category_name,
           submission_file.sha256 AS sha256,
           latest.id AS latest_run_id,
           latest.status AS latest_run_status,
           latest.stage AS latest_run_stage,
           latest.error_code AS latest_run_error_code,
           reference.id AS reference_run_id
         FROM submission
         INNER JOIN category ON category.id = submission.category_id
         INNER JOIN submission_file ON submission_file.submission_id = submission.id
         LEFT JOIN analysis_run latest ON latest.id = ${LATEST_RUN_SUBQUERY}
         LEFT JOIN analysis_run reference ON reference.id = ${REFERENCE_RUN_SUBQUERY}
         WHERE submission.competition_id = ?
         ORDER BY submission.application_code ASC, submission.id ASC
         LIMIT ?`,
      )
      .bind(competitionId, MAX_REVIEW_OPERATIONS_ITEMS)
      .all<SubmissionRow>(),
    // Checks are restricted to the reference runs of THIS competition's submissions, so no other
    // competition's analysis can reach the projection even through a shared run identifier.
    binding
      .prepare(
        `SELECT
           analysis_check.analysis_run_id AS analysis_run_id,
           analysis_check.type AS type,
           analysis_check.status AS status,
           analysis_check.details_json AS details_json
         FROM analysis_check
         WHERE analysis_check.analysis_run_id IN (
           SELECT (
             SELECT run.id FROM analysis_run run
             WHERE run.submission_id = submission.id AND run.status = 'SUCCEEDED'
             ORDER BY run.created_at DESC, run.id DESC
             LIMIT 1
           )
           FROM submission
           WHERE submission.competition_id = ?
         )`,
      )
      .bind(competitionId)
      .all<CheckRow>(),
    listReviewerAssignmentOperations(binding, competitionId),
  ]);

  const checksByRun = new Map<string, CheckRow[]>();
  for (const row of checkRows) {
    const bucket = checksByRun.get(row.analysis_run_id);
    if (bucket) bucket.push(row);
    else checksByRun.set(row.analysis_run_id, [row]);
  }

  const reviewersBySubmission = new Map<string, ReviewOperationsReviewer[]>();
  for (const assignment of assignments) {
    const bucket = reviewersBySubmission.get(assignment.submission.id) ?? [];
    if (bucket.length < MAX_REVIEW_OPERATIONS_REVIEWERS) {
      bucket.push({
        assignmentId: assignment.assignmentId,
        userId: assignment.reviewer.userId,
        name: assignment.reviewer.name,
        email: assignment.reviewer.email,
        evaluationStatus: assignment.evaluationStatus,
        submittedAt: assignment.submittedAt,
        humanTotal: assignment.humanTotal,
        humanMaxTotal: assignment.humanMaxTotal,
        disagreementCount: assignment.disagreementCount,
      });
    }
    reviewersBySubmission.set(assignment.submission.id, bucket);
  }

  // Duplicate content hashes are counted inside this competition only, exactly like the submission
  // list does: a byte-identical report in another competition is not a signal here.
  const hashCounts = new Map<string, number>();
  for (const row of submissionRows) {
    hashCounts.set(row.sha256, (hashCounts.get(row.sha256) ?? 0) + 1);
  }

  return submissionRows.map((row) => {
    const referenceSignals =
      row.reference_run_id === null
        ? emptyReferenceRunSignals()
        : reduceChecks(checksByRun.get(row.reference_run_id) ?? []);
    const reviewers = reviewersBySubmission.get(row.submission_id) ?? [];
    const duplicateReportCount = (hashCounts.get(row.sha256) ?? 1) - 1;
    const exactDocumentMatch = referenceSignals.exactDocumentMatch || duplicateReportCount > 0;
    const disagreementCount = reviewers.reduce(
      (total, reviewer) => total + (reviewer.disagreementCount ?? 0),
      0,
    );
    const submittedEvaluationCount = reviewers.filter(
      (reviewer) => reviewer.evaluationStatus === "SUBMITTED",
    ).length;

    const signals: ReviewPrioritySignals = {
      analysisStatus: row.latest_run_status,
      referenceRunAvailable: row.reference_run_id !== null,
      checkStatuses: referenceSignals.checkStatuses,
      similarityLevel: referenceSignals.similarityLevel,
      exactDocumentMatch,
      weakEvidenceSectionCount: referenceSignals.weakEvidenceSectionCount,
      weakEvidenceCriterionCount: referenceSignals.weakEvidenceCriterionCount,
      assignedReviewerCount: reviewers.length,
      startedEvaluationCount: reviewers.filter((reviewer) => reviewer.evaluationStatus !== null)
        .length,
      submittedEvaluationCount,
      disagreementCount,
    };

    return {
      submissionId: row.submission_id,
      applicationCode: row.application_code,
      projectTitle: row.project_title,
      category: { id: row.category_id, code: row.category_code, name: row.category_name },
      analysis: {
        latestRunId: row.latest_run_id,
        latestRunStatus: row.latest_run_status,
        latestRunStage: row.latest_run_stage,
        errorCode: row.latest_run_error_code,
        referenceRunId: row.reference_run_id,
        checks: Object.entries(referenceSignals.checkStatuses).map(([type, status]) => ({
          type: type as AnalysisCheckType,
          status,
        })),
        similarityLevel: referenceSignals.similarityLevel,
        similarityObservationCount: referenceSignals.similarityObservationCount,
        exactDocumentMatch,
      },
      priority: deriveReviewPriority(signals),
      reviewers,
      aiSuggestedTotal: referenceSignals.aiSuggestedTotal,
      aiMaxTotal: referenceSignals.aiMaxTotal,
      submittedEvaluationCount,
      disagreementCount,
    };
  });
}

export const reviewOperationsRepository = { listReviewOperations };
export type ReviewOperationsRepository = typeof reviewOperationsRepository;
