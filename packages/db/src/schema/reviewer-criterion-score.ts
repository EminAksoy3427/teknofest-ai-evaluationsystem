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

import { criteria } from "./criterion";
import { reviewerEvaluations } from "./reviewer-evaluation";

/**
 * One human score for one pinned Criterion inside one ReviewerEvaluation. This table holds only
 * human decisions: the AI suggestion for the same criterion lives in `rubric_suggestion` and is
 * never written, merged or overwritten here, so the AI suggestion and the reviewer score stay two
 * independent records that can always be reconstructed side by side.
 *
 * `(reviewer_evaluation_id, criterion_id)` is unique, so a criterion carries at most one human
 * score per evaluation. Two composite foreign keys keep the criterion inside the evaluation's own
 * pinned RubricVersion. The `0..criterion.max_score` upper bound is cross-row and therefore cannot
 * be a CHECK constraint; the repository INSERT re-reads the pinned `criterion.max_score` in its own
 * SQL guard and the application boundary validates it before that.
 */
export const reviewerCriterionScores = sqliteTable(
  "reviewer_criterion_score",
  {
    id: text("id").primaryKey(),
    reviewerEvaluationId: text("reviewer_evaluation_id")
      .notNull()
      .references(() => reviewerEvaluations.id, { onDelete: "cascade" }),
    rubricVersionId: text("rubric_version_id").notNull(),
    criterionId: text("criterion_id")
      .notNull()
      .references(() => criteria.id, { onDelete: "restrict" }),
    score: integer("score").notNull(),
    note: text("note"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    uniqueIndex("reviewer_criterion_score_evaluation_criterion_unique").on(
      table.reviewerEvaluationId,
      table.criterionId,
    ),
    index("reviewer_criterion_score_evaluation_id_index").on(table.reviewerEvaluationId),
    index("reviewer_criterion_score_criterion_id_index").on(table.criterionId),
    // The pinned RubricVersion on this row must match the ReviewerEvaluation's own pinned version.
    foreignKey({
      columns: [table.reviewerEvaluationId, table.rubricVersionId],
      foreignColumns: [reviewerEvaluations.id, reviewerEvaluations.rubricVersionId],
      name: "reviewer_criterion_score_evaluation_rubric_version_fk",
    }).onDelete("cascade"),
    // The referenced Criterion must belong to that same pinned RubricVersion.
    foreignKey({
      columns: [table.rubricVersionId, table.criterionId],
      foreignColumns: [criteria.rubricVersionId, criteria.id],
      name: "reviewer_criterion_score_criterion_rubric_version_fk",
    }).onDelete("restrict"),
    check("reviewer_criterion_score_score_check", sql`${table.score} >= 0`),
    check(
      "reviewer_criterion_score_note_length_check",
      sql`${table.note} is null or length(${table.note}) between 1 and 600`,
    ),
  ],
);
