import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { competitions } from "./competition";
import { PERSISTED_VERSION_STATUS_VALUES, versionStatusValuesSql } from "./lifecycle-status";

/**
 * A TemplateVersion represents BOTH the official versioned template file and the structural profile
 * used by analysis. `storage_key`/`sha256` were reserved nullable columns from the very first
 * migration and were never populated before P6.5A; they are now the real private R2 pointer and
 * content hash of the official file, alongside the display metadata a client needs
 * (`original_filename`, `mime_type`, `size_bytes`, `etag`, `file_uploaded_at`). The six file columns
 * are all-or-nothing — a DRAFT with no upload yet leaves all six null.
 *
 * "A TemplateVersion cannot become ACTIVE without its official file" is enforced in
 * `activateTemplateVersion` (`packages/db/src/competition-configuration.ts`), not as a table-wide
 * CHECK constraint here. A CHECK would apply retroactively to every historical row on any future
 * migration that rebuilds this table, which would make an upgrade fail forever the moment a single
 * ACTIVE/RETIRED TemplateVersion had ever existed without a file — exactly the state every
 * TemplateVersion activated before P6.5A is in. `activateTemplateVersion` is the only code path that
 * can ever set `status = 'ACTIVE'`, so gating it there is sufficient without that retroactive risk.
 */
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
    originalFilename: text("original_filename"),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes"),
    etag: text("etag"),
    // Tracked separately from `updated_at`, which also moves on a plain label/profile edit: this
    // column changes ONLY when the official file itself is uploaded or replaced, so the file
    // metadata's own timestamp never drifts on an unrelated draft edit.
    fileUploadedAt: integer("file_uploaded_at", { mode: "timestamp_ms" }),
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
    check(
      "template_version_file_size_check",
      sql`${table.sizeBytes} is null or ${table.sizeBytes} > 0`,
    ),
    check(
      "template_version_file_sha256_check",
      sql`${table.sha256} is null or (length(${table.sha256}) = 64 and ${table.sha256} = lower(${table.sha256}))`,
    ),
    check(
      "template_version_file_mime_check",
      sql`${table.mimeType} is null or ${table.mimeType} = 'application/pdf'`,
    ),
    // All six official-file columns arrive and leave together: a DRAFT with no upload yet has all
    // of them null, and an uploaded file always carries every one of them.
    check(
      "template_version_file_all_or_nothing_check",
      sql`(${table.storageKey} is null and ${table.sha256} is null and ${table.originalFilename} is null and ${table.mimeType} is null and ${table.sizeBytes} is null and ${table.fileUploadedAt} is null) or (${table.storageKey} is not null and ${table.sha256} is not null and ${table.originalFilename} is not null and ${table.mimeType} is not null and ${table.sizeBytes} is not null and ${table.fileUploadedAt} is not null)`,
    ),
  ],
);
