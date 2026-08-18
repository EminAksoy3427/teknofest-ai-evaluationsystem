import { LIFECYCLE_STATUS_VALUES } from "@teknofest-ai/shared";
import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { competitions } from "./competition";
import { lifecycleStatusValuesSql } from "./lifecycle-status";

export const rubricVersions = sqliteTable(
  "rubric_version",
  {
    id: text("id").primaryKey(),
    competitionId: text("competition_id")
      .notNull()
      .references(() => competitions.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    label: text("label").notNull(),
    status: text("status", { enum: LIFECYCLE_STATUS_VALUES }).notNull().default("DRAFT"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    uniqueIndex("rubric_version_competition_version_unique").on(
      table.competitionId,
      table.versionNumber,
    ),
    index("rubric_version_competition_id_index").on(table.competitionId),
    check("rubric_version_number_check", sql`${table.versionNumber} > 0`),
    check("rubric_version_status_check", sql`${table.status} in ${lifecycleStatusValuesSql}`),
  ],
);
