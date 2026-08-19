import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { competitions } from "./competition";
import { PERSISTED_VERSION_STATUS_VALUES, versionStatusValuesSql } from "./lifecycle-status";

export const templateVersions = sqliteTable(
  "template_version",
  {
    id: text("id").primaryKey(),
    competitionId: text("competition_id")
      .notNull()
      .references(() => competitions.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    label: text("label").notNull(),
    status: text("status", { enum: PERSISTED_VERSION_STATUS_VALUES }).notNull().default("DRAFT"),
    structuralProfile: text("structural_profile")
      .notNull()
      .default('{"expectedLanguage":"tr","sections":[]}'),
    storageKey: text("storage_key"),
    sha256: text("sha256"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    uniqueIndex("template_version_competition_version_unique").on(
      table.competitionId,
      table.versionNumber,
    ),
    index("template_version_competition_id_index").on(table.competitionId),
    uniqueIndex("template_version_one_active_per_competition")
      .on(table.competitionId)
      .where(sql`${table.status} = 'ACTIVE'`),
    check("template_version_number_check", sql`${table.versionNumber} > 0`),
    check("template_version_status_check", sql`${table.status} in ${versionStatusValuesSql}`),
  ],
);
