import { CONTESTANT_FEEDBACK_STATUS_VALUES } from "@teknofest-ai/shared";
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

import { user } from "./auth";
import { competitions } from "./competition";
import { reviewerEvaluations } from "./reviewer-evaluation";

/**
 * ContestantFeedback is a controlled PUBLICATION boundary, not a mirror of internal analysis or
 * reviewer tables. It is the only record a contestant-facing endpoint ever reads from, and only
 * once it is `PUBLISHED`: a `DRAFT` row's very existence is never revealed to a contestant.
 *
 * `source_reviewer_evaluation_id` pins the SUBMITTED ReviewerEvaluation this feedback is built from.
 * The composite foreign key `(submission_id, source_reviewer_evaluation_id) →
 * reviewer_evaluation(submission_id, id)` guarantees the cited evaluation actually belongs to this
 * same submission; that the evaluation is actually SUBMITTED is a value condition the repository's
 * own `WHERE status = 'SUBMITTED'` guard enforces at write time, the same division of labour the
 * rest of this schema uses for role/status conditions a plain foreign key cannot express.
 *
 * One publication per submission is enforced by `UNIQUE(submission_id)`, which is sufficient for
 * this MVP. `PUBLISHED` is treated as immutable: every repository write is guarded on
 * `status = 'DRAFT'`, and reopening or versioning a published row is deliberately deferred.
 */
export const contestantFeedback = sqliteTable(
  "contestant_feedback",
  {
    id: text("id").primaryKey(),
    competitionId: text("competition_id")
      .notNull()
      .references(() => competitions.id, { onDelete: "cascade" }),
    submissionId: text("submission_id").notNull(),
    sourceReviewerEvaluationId: text("source_reviewer_evaluation_id").notNull(),
    status: text("status", { enum: CONTESTANT_FEEDBACK_STATUS_VALUES }).notNull().default("DRAFT"),
    summary: text("summary"),
    strengthsJson: text("strengths_json").notNull().default("[]"),
    improvementsJson: text("improvements_json").notNull().default("[]"),
    recommendationsJson: text("recommendations_json").notNull().default("[]"),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    publishedByUserId: text("published_by_user_id").references(() => user.id, {
      onDelete: "cascade",
    }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    publishedAt: integer("published_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    // One publication per submission, ever — draft or published. Acceptable for this MVP; a
    // correction workflow that needs more than one historical publication is explicitly deferred.
    uniqueIndex("contestant_feedback_submission_unique").on(table.submissionId),
    index("contestant_feedback_competition_id_index").on(table.competitionId),
    // The pinned source evaluation must belong to this same submission.
    foreignKey({
      columns: [table.submissionId, table.sourceReviewerEvaluationId],
      foreignColumns: [reviewerEvaluations.submissionId, reviewerEvaluations.id],
      name: "contestant_feedback_source_evaluation_submission_fk",
    }).onDelete("cascade"),
    check("contestant_feedback_status_check", sql`${table.status} in ('DRAFT', 'PUBLISHED')`),
    check(
      "contestant_feedback_publication_check",
      sql`(${table.status} = 'PUBLISHED' and ${table.publishedAt} is not null and ${table.publishedByUserId} is not null) or (${table.status} = 'DRAFT' and ${table.publishedAt} is null and ${table.publishedByUserId} is null)`,
    ),
    check(
      "contestant_feedback_summary_length_check",
      sql`${table.summary} is null or length(${table.summary}) between 1 and 2000`,
    ),
    check("contestant_feedback_strengths_json_check", sql`json_valid(${table.strengthsJson})`),
    check(
      "contestant_feedback_improvements_json_check",
      sql`json_valid(${table.improvementsJson})`,
    ),
    check(
      "contestant_feedback_recommendations_json_check",
      sql`json_valid(${table.recommendationsJson})`,
    ),
  ],
);
