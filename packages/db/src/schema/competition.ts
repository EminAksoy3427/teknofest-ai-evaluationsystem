import { LIFECYCLE_STATUS_VALUES } from "@teknofest-ai/shared";
import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { lifecycleStatusValuesSql } from "./lifecycle-status";

export const competitions = sqliteTable(
  "competition",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description").notNull().default(""),
    status: text("status", { enum: LIFECYCLE_STATUS_VALUES }).notNull().default("DRAFT"),
    expectedLanguage: text("expected_language").notNull().default("tr"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    uniqueIndex("competition_slug_unique").on(table.slug),
    check("competition_status_check", sql`${table.status} in ${lifecycleStatusValuesSql}`),
  ],
);
