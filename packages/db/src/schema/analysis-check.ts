import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { analysisRuns } from "./analysis-run";

export const ANALYSIS_CHECK_STATUS_VALUES = ["PASS", "WARN", "FAIL"] as const;

export const analysisChecks = sqliteTable(
  "analysis_check",
  {
    id: text("id").primaryKey(),
    analysisRunId: text("analysis_run_id")
      .notNull()
      .references(() => analysisRuns.id, { onDelete: "cascade" }),
    // Check types are validated by shared runtime contracts. Keeping this column
    // free of a DB enum/check avoids a table rebuild for every future trusted type.
    type: text("type").notNull(),
    status: text("status", { enum: ANALYSIS_CHECK_STATUS_VALUES }).notNull(),
    summary: text("summary").notNull(),
    detailsJson: text("details_json").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    uniqueIndex("analysis_check_run_type_unique").on(table.analysisRunId, table.type),
    index("analysis_check_run_id_index").on(table.analysisRunId),
    check("analysis_check_status_check", sql`${table.status} in ('PASS', 'WARN', 'FAIL')`),
    check("analysis_check_summary_length_check", sql`length(${table.summary}) between 1 and 500`),
    check("analysis_check_details_json_check", sql`json_valid(${table.detailsJson})`),
  ],
);
