import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { submissions } from "./submission";

export const submissionFiles = sqliteTable(
  "submission_file",
  {
    id: text("id").primaryKey(),
    submissionId: text("submission_id")
      .notNull()
      .references(() => submissions.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull(),
    originalFilename: text("original_filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256").notNull(),
    etag: text("etag"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    uniqueIndex("submission_file_submission_id_unique").on(table.submissionId),
    uniqueIndex("submission_file_storage_key_unique").on(table.storageKey),
    index("submission_file_sha256_index").on(table.sha256),
    check("submission_file_size_positive_check", sql`${table.sizeBytes} > 0`),
    check("submission_file_mime_pdf_check", sql`${table.mimeType} = 'application/pdf'`),
    check(
      "submission_file_sha256_check",
      sql`length(${table.sha256}) = 64 and ${table.sha256} = lower(${table.sha256})`,
    ),
  ],
);
