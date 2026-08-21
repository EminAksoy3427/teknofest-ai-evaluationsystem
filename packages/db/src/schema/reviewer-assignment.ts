import { sql } from "drizzle-orm";
import {
  foreignKey,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { user } from "./auth";
import { competitions } from "./competition";
import { competitionMembers } from "./competition-member";
import { submissions } from "./submission";

/**
 * A ReviewerAssignment is the explicit, competition-scoped grant that lets one reviewer open one
 * submission. The REVIEWER role alone never grants submission access: without a row here the
 * reviewer routes deny the request.
 *
 * Cross-competition assignment is impossible at the database boundary rather than only in
 * application code. Two composite foreign keys enforce it: the submission must belong to this
 * assignment's competition, and the reviewer must already be a member of that same competition.
 */
export const reviewerAssignments = sqliteTable(
  "reviewer_assignment",
  {
    id: text("id").primaryKey(),
    competitionId: text("competition_id")
      .notNull()
      .references(() => competitions.id, { onDelete: "cascade" }),
    submissionId: text("submission_id").notNull(),
    reviewerUserId: text("reviewer_user_id").notNull(),
    assignedByUserId: text("assigned_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    // One reviewer is assigned to one submission at most once.
    uniqueIndex("reviewer_assignment_submission_reviewer_unique").on(
      table.submissionId,
      table.reviewerUserId,
    ),
    // Parent key for ReviewerEvaluation's assignment-scoped submission foreign key.
    uniqueIndex("reviewer_assignment_submission_scope_unique").on(table.id, table.submissionId),
    index("reviewer_assignment_competition_id_index").on(table.competitionId),
    index("reviewer_assignment_competition_reviewer_index").on(
      table.competitionId,
      table.reviewerUserId,
    ),
    index("reviewer_assignment_submission_id_index").on(table.submissionId),
    // The assigned submission must belong to this assignment's competition.
    foreignKey({
      columns: [table.competitionId, table.submissionId],
      foreignColumns: [submissions.competitionId, submissions.id],
      name: "reviewer_assignment_submission_competition_fk",
    }).onDelete("cascade"),
    // The reviewer must hold a membership in that same competition.
    foreignKey({
      columns: [table.competitionId, table.reviewerUserId],
      foreignColumns: [competitionMembers.competitionId, competitionMembers.userId],
      name: "reviewer_assignment_reviewer_membership_fk",
    }).onDelete("cascade"),
  ],
);
