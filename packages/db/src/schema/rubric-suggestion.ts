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
import { criteria } from "./criterion";

/**
 * A RubricSuggestion is one AI-suggested score for one pinned Criterion within one AnalysisRun. It
 * is an advisory signal, never a final reviewer score: `suggested_score` is always validated
 * server-side against `0..criterion.max_score` before persistence — an out-of-range score is
 * rejected, never clamped — and no column here can hold a human decision. Historical identity is
 * `(analysis_run_id, criterion_id)`; a retry reconciles only the
 * measured suggestion, and a new AnalysisRun always produces new rows against its own pinned
 * RubricVersion rather than rewriting an older run's suggestions.
 */
export const rubricSuggestions = sqliteTable(
  "rubric_suggestion",
  {
    id: text("id").primaryKey(),
    analysisRunId: text("analysis_run_id")
      .notNull()
      .references(() => analysisRuns.id, { onDelete: "cascade" }),
    rubricVersionId: text("rubric_version_id").notNull(),
    criterionId: text("criterion_id")
      .notNull()
      .references(() => criteria.id, { onDelete: "restrict" }),
    suggestedScore: integer("suggested_score").notNull(),
    reason: text("reason").notNull(),
    evidenceStrength: text("evidence_strength", { enum: ["HIGH", "MEDIUM", "LOW"] }).notNull(),
    evidenceJson: text("evidence_json").notNull().default("[]"),
    missingPointsJson: text("missing_points_json").notNull().default("[]"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    // Idempotent retry target: a Workflow retry upserts the same logical suggestion instead of
    // appending a duplicate for the same criterion.
    uniqueIndex("rubric_suggestion_run_criterion_unique").on(
      table.analysisRunId,
      table.criterionId,
    ),
    index("rubric_suggestion_analysis_run_id_index").on(table.analysisRunId),
    index("rubric_suggestion_criterion_id_index").on(table.criterionId),
    // The pinned RubricVersion on this row must match the AnalysisRun's own pinned RubricVersion.
    foreignKey({
      columns: [table.analysisRunId, table.rubricVersionId],
      foreignColumns: [analysisRuns.id, analysisRuns.rubricVersionId],
      name: "rubric_suggestion_run_rubric_version_fk",
    }).onDelete("cascade"),
    // The referenced Criterion must belong to that same pinned RubricVersion, not a different one.
    foreignKey({
      columns: [table.rubricVersionId, table.criterionId],
      foreignColumns: [criteria.rubricVersionId, criteria.id],
      name: "rubric_suggestion_criterion_rubric_version_fk",
    }).onDelete("restrict"),
    check("rubric_suggestion_score_check", sql`${table.suggestedScore} >= 0`),
    check("rubric_suggestion_reason_length_check", sql`length(${table.reason}) between 1 and 600`),
    check(
      "rubric_suggestion_evidence_strength_check",
      sql`${table.evidenceStrength} in ('HIGH', 'MEDIUM', 'LOW')`,
    ),
    check("rubric_suggestion_evidence_json_check", sql`json_valid(${table.evidenceJson})`),
    check(
      "rubric_suggestion_missing_points_json_check",
      sql`json_valid(${table.missingPointsJson})`,
    ),
  ],
);
