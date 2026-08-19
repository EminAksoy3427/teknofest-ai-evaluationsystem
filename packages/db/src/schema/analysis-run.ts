import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { categories } from "./category";
import { rubricVersions } from "./rubric-version";
import { submissions } from "./submission";
import { templateVersions } from "./template-version";

export const ANALYSIS_RUN_STATUS_VALUES = ["QUEUED", "PROCESSING", "SUCCEEDED", "FAILED"] as const;

export const ANALYSIS_STAGE_VALUES = ["INGEST_AND_EXTRACT"] as const;

export const analysisRuns = sqliteTable(
  "analysis_run",
  {
    id: text("id").primaryKey(),
    submissionId: text("submission_id")
      .notNull()
      .references(() => submissions.id, { onDelete: "cascade" }),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    templateVersionId: text("template_version_id")
      .notNull()
      .references(() => templateVersions.id, { onDelete: "restrict" }),
    rubricVersionId: text("rubric_version_id")
      .notNull()
      .references(() => rubricVersions.id, { onDelete: "restrict" }),
    sourceSha256: text("source_sha256").notNull(),
    status: text("status", { enum: ANALYSIS_RUN_STATUS_VALUES }).notNull().default("QUEUED"),
    stage: text("stage", { enum: ANALYSIS_STAGE_VALUES }).notNull().default("INGEST_AND_EXTRACT"),
    workflowInstanceId: text("workflow_instance_id").notNull(),
    documentArtifactKey: text("document_artifact_key"),
    pageCount: integer("page_count"),
    characterCount: integer("character_count"),
    extractionWarnings: text("extraction_warnings").notNull().default("[]"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    startedAt: integer("started_at", { mode: "timestamp_ms" }),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("analysis_run_submission_created_index").on(table.submissionId, table.createdAt),
    index("analysis_run_category_id_index").on(table.categoryId),
    index("analysis_run_template_version_id_index").on(table.templateVersionId),
    index("analysis_run_rubric_version_id_index").on(table.rubricVersionId),
    uniqueIndex("analysis_run_workflow_instance_unique").on(table.workflowInstanceId),
    uniqueIndex("analysis_run_one_in_flight_per_submission")
      .on(table.submissionId)
      .where(sql`${table.status} in ('QUEUED', 'PROCESSING')`),
    check(
      "analysis_run_status_check",
      sql`${table.status} in ('QUEUED', 'PROCESSING', 'SUCCEEDED', 'FAILED')`,
    ),
    check("analysis_run_stage_check", sql`${table.stage} = 'INGEST_AND_EXTRACT'`),
    check(
      "analysis_run_source_sha256_check",
      sql`length(${table.sourceSha256}) = 64 and ${table.sourceSha256} = lower(${table.sourceSha256})`,
    ),
    check(
      "analysis_run_page_count_check",
      sql`${table.pageCount} is null or ${table.pageCount} > 0`,
    ),
    check(
      "analysis_run_character_count_check",
      sql`${table.characterCount} is null or ${table.characterCount} >= 0`,
    ),
    check("analysis_run_warnings_json_check", sql`json_valid(${table.extractionWarnings})`),
    check(
      "analysis_run_completion_check",
      sql`(${table.status} not in ('SUCCEEDED', 'FAILED')) or ${table.completedAt} is not null`,
    ),
    check(
      "analysis_run_success_artifact_check",
      sql`${table.status} <> 'SUCCEEDED' or (${table.documentArtifactKey} is not null and ${table.pageCount} is not null and ${table.characterCount} is not null)`,
    ),
    check(
      "analysis_run_failure_error_check",
      sql`${table.status} <> 'FAILED' or (${table.errorCode} is not null and ${table.errorMessage} is not null)`,
    ),
  ],
);
