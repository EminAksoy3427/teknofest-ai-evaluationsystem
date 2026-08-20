import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { analysisRuns } from "./analysis-run";
import { competitions } from "./competition";
import { submissions } from "./submission";

/**
 * A SimilarityPair is a historical observation between two specific immutable AnalysisRuns.
 * `competition_id`, both submission ids and both analysis run ids form the immutable identity of
 * the observation; only scores, mode, level, the exact-document flag, bounded evidence and
 * `updated_at` are reconciled when the same run pair is analysed again. A newer AnalysisRun always
 * produces a new row instead of rewriting an existing observation.
 */
export const similarityPairs = sqliteTable(
  "similarity_pair",
  {
    id: text("id").primaryKey(),
    competitionId: text("competition_id")
      .notNull()
      .references(() => competitions.id, { onDelete: "cascade" }),
    submissionAId: text("submission_a_id").notNull(),
    submissionBId: text("submission_b_id").notNull(),
    analysisRunAId: text("analysis_run_a_id").notNull(),
    analysisRunBId: text("analysis_run_b_id").notNull(),
    lexicalScore: real("lexical_score").notNull(),
    semanticScore: real("semantic_score"),
    combinedScore: real("combined_score").notNull(),
    mode: text("mode", { enum: ["LEXICAL_ONLY", "HYBRID"] }).notNull(),
    level: text("level", { enum: ["LOW", "MEDIUM", "HIGH"] }).notNull(),
    exactDocumentMatch: integer("exact_document_match", { mode: "boolean" })
      .notNull()
      .default(false),
    evidenceJson: text("evidence_json").notNull().default("[]"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    // Competition ownership of both submissions is enforced by the database, not only by the
    // repository: the parent key is submission(competition_id, id).
    foreignKey({
      columns: [table.competitionId, table.submissionAId],
      foreignColumns: [submissions.competitionId, submissions.id],
      name: "similarity_pair_submission_a_competition_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.competitionId, table.submissionBId],
      foreignColumns: [submissions.competitionId, submissions.id],
      name: "similarity_pair_submission_b_competition_fk",
    }).onDelete("cascade"),
    // Each pinned AnalysisRun must belong to the submission recorded on the same canonical side.
    foreignKey({
      columns: [table.submissionAId, table.analysisRunAId],
      foreignColumns: [analysisRuns.submissionId, analysisRuns.id],
      name: "similarity_pair_run_a_submission_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.submissionBId, table.analysisRunBId],
      foreignColumns: [analysisRuns.submissionId, analysisRuns.id],
      name: "similarity_pair_run_b_submission_fk",
    }).onDelete("cascade"),
    // Historical uniqueness: one observation per canonical AnalysisRun pair. Different run
    // identities for the same logical submission pair coexist as separate historical rows.
    uniqueIndex("similarity_pair_competition_runs_unique").on(
      table.competitionId,
      table.analysisRunAId,
      table.analysisRunBId,
    ),
    // Logical submission pair stays indexed for efficient historical lookup.
    index("similarity_pair_competition_submissions_index").on(
      table.competitionId,
      table.submissionAId,
      table.submissionBId,
    ),
    index("similarity_pair_submission_a_index").on(table.competitionId, table.submissionAId),
    index("similarity_pair_submission_b_index").on(table.competitionId, table.submissionBId),
    index("similarity_pair_run_b_index").on(table.competitionId, table.analysisRunBId),
    check(
      "similarity_pair_canonical_order_check",
      sql`${table.submissionAId} < ${table.submissionBId}`,
    ),
    check("similarity_pair_lexical_score_check", sql`${table.lexicalScore} between 0 and 1`),
    check(
      "similarity_pair_semantic_score_check",
      sql`${table.semanticScore} is null or ${table.semanticScore} between 0 and 1`,
    ),
    check("similarity_pair_combined_score_check", sql`${table.combinedScore} between 0 and 1`),
    check("similarity_pair_mode_check", sql`${table.mode} in ('LEXICAL_ONLY', 'HYBRID')`),
    check("similarity_pair_level_check", sql`${table.level} in ('LOW', 'MEDIUM', 'HIGH')`),
    check(
      "similarity_pair_mode_semantic_check",
      sql`(${table.mode} = 'LEXICAL_ONLY' and ${table.semanticScore} is null) or (${table.mode} = 'HYBRID' and ${table.semanticScore} is not null)`,
    ),
    check("similarity_pair_evidence_json_check", sql`json_valid(${table.evidenceJson})`),
  ],
);
