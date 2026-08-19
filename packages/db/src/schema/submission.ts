import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { categories } from "./category";
import { competitions } from "./competition";

export const submissions = sqliteTable(
  "submission",
  {
    id: text("id").primaryKey(),
    competitionId: text("competition_id")
      .notNull()
      .references(() => competitions.id, { onDelete: "cascade" }),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    applicationCode: text("application_code").notNull(),
    projectTitle: text("project_title").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    uniqueIndex("submission_competition_application_code_unique").on(
      table.competitionId,
      table.applicationCode,
    ),
    index("submission_competition_id_index").on(table.competitionId),
    index("submission_category_id_index").on(table.categoryId),
  ],
);
