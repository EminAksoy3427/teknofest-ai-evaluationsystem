import { REVIEWER_EVALUATION_STATUS_VALUES } from "@teknofest-ai/shared";
import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { analysisRuns } from "./analysis-run";
import { reviewerAssignments } from "./reviewer-assignment";

/**
 * A ReviewerEvaluation is one human reviewer's evaluation of one submission, pinned FOREVER to the
 * exact AnalysisRun they reviewed and to that run's own RubricVersion at creation time. A
 * ReviewerAssignment carries AT MOST ONE ReviewerEvaluation, enforced by `UNIQUE(assignment_id)`:
 * once the first draft is created (pinned to whichever AnalysisRun was current at that moment), no
 * second evaluation row — draft or submitted — can ever be created for that assignment, and neither
 * `analysis_run_id` nor `rubric_version_id` can float forward afterward even while still a DRAFT. A
 * later RubricVersion activation or a later AnalysisRun therefore never changes an existing
 * evaluation; the only way to evaluate a submission against newer configuration is a NEW
 * ReviewerAssignment.
 *
 * Three composite foreign keys carry that pinned identity, so a client can never widen its own scope
 * by sending different identifiers:
 *   - `(assignment_id, submission_id)` — the evaluation's submission is the assignment's submission.
 *   - `(submission_id, analysis_run_id)` — the pinned AnalysisRun belongs to that submission.
 *   - `(analysis_run_id, rubric_version_id)` — the pinned RubricVersion is the run's own rubric.
 *
 * A `SUBMITTED` evaluation is treated as immutable: every repository write is guarded on
 * `status = 'DRAFT'`, and reopening or versioning a submitted evaluation is deliberately deferred.
 */
export const reviewerEvaluations = sqliteTable(
  "reviewer_evaluation",
  {
    id: text("id").primaryKey(),
    assignmentId: text("assignment_id")
      .notNull()
      .references(() => reviewerAssignments.id, { onDelete: "cascade" }),
    submissionId: text("submission_id").notNull(),
    analysisRunId: text("analysis_run_id").notNull(),
    rubricVersionId: text("rubric_version_id").notNull(),
    status: text("status", { enum: REVIEWER_EVALUATION_STATUS_VALUES }).notNull().default("DRAFT"),
    overallNote: text("overall_note"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    submittedAt: integer("submitted_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    // At most one ReviewerEvaluation per ReviewerAssignment, ever — draft or submitted. This is the
    // sole DB-level guarantee that an assignment cannot accumulate a second evaluation, whether
    // through a normal second save, a retried request, or a later AnalysisRun/RubricVersion.
    uniqueIndex("reviewer_evaluation_assignment_unique").on(table.assignmentId),
    // Parent key for ReviewerCriterionScore's pinned-RubricVersion ownership foreign key.
    uniqueIndex("reviewer_evaluation_rubric_version_scope_unique").on(
      table.id,
      table.rubricVersionId,
    ),
    // Parent key for ContestantFeedback's pinned-source-evaluation ownership foreign key: a
    // published feedback row can only cite an evaluation that actually belongs to its own
    // submission.
    uniqueIndex("reviewer_evaluation_submission_scope_unique").on(table.submissionId, table.id),
    index("reviewer_evaluation_analysis_run_id_index").on(table.analysisRunId),
    foreignKey({
      columns: [table.assignmentId, table.submissionId],
      foreignColumns: [reviewerAssignments.id, reviewerAssignments.submissionId],
      name: "reviewer_evaluation_assignment_submission_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.submissionId, table.analysisRunId],
      foreignColumns: [analysisRuns.submissionId, analysisRuns.id],
      name: "reviewer_evaluation_run_submission_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.analysisRunId, table.rubricVersionId],
      foreignColumns: [analysisRuns.id, analysisRuns.rubricVersionId],
      name: "reviewer_evaluation_run_rubric_version_fk",
    }).onDelete("cascade"),
    check("reviewer_evaluation_status_check", sql`${table.status} in ('DRAFT', 'SUBMITTED')`),
    check(
      "reviewer_evaluation_submitted_at_check",
      sql`(${table.status} = 'SUBMITTED' and ${table.submittedAt} is not null) or (${table.status} = 'DRAFT' and ${table.submittedAt} is null)`,
    ),
    check(
      "reviewer_evaluation_overall_note_length_check",
      sql`${table.overallNote} is null or length(${table.overallNote}) between 1 and 2000`,
    ),
  ],
);
