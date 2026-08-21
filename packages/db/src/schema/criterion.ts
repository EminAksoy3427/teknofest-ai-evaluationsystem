import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { rubricVersions } from "./rubric-version";

export const criteria = sqliteTable(
  "criterion",
  {
    id: text("id").primaryKey(),
    rubricVersionId: text("rubric_version_id")
      .notNull()
      .references(() => rubricVersions.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    evidenceExpectation: text("evidence_expectation").notNull().default(""),
    maxScore: integer("max_score").notNull(),
    weightBasisPoints: integer("weight_basis_points").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    uniqueIndex("criterion_rubric_code_unique").on(table.rubricVersionId, table.code),
    // Parent key for RubricSuggestion's pinned-RubricVersion ownership composite foreign key.
    uniqueIndex("criterion_rubric_version_scope_unique").on(table.rubricVersionId, table.id),
    index("criterion_rubric_version_id_index").on(table.rubricVersionId),
    check("criterion_max_score_check", sql`${table.maxScore} > 0`),
    check(
      "criterion_weight_basis_points_check",
      sql`${table.weightBasisPoints} >= 0 and ${table.weightBasisPoints} <= 10000`,
    ),
    check("criterion_sort_order_check", sql`${table.sortOrder} >= 0`),
  ],
);
