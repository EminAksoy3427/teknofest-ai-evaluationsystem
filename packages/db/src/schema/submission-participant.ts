import { sql } from "drizzle-orm";
import {
  foreignKey,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { competitions } from "./competition";
import { competitionMembers } from "./competition-member";
import { submissions } from "./submission";

/**
 * A SubmissionParticipant is the explicit, competition-scoped grant that lets one authenticated
 * CONTESTANT see their own submission's published feedback. The CONTESTANT role alone never grants
 * ownership of any particular submission: without a row here, `/api/v1/me/submissions` and the
 * feedback endpoints report the submission as not participated in.
 *
 * Cross-competition attachment is impossible at the database boundary, exactly like
 * `reviewer_assignment`: the submission must belong to this row's own competition, and the attached
 * user must already be a member of that same competition. Whether that member actually holds the
 * CONTESTANT role is re-validated by the repository's own `WHERE role = 'CONTESTANT'` guard at
 * insert time (a composite foreign key can match columns but cannot filter on a fixed value), the
 * same pattern `reviewer_assignment` uses for the REVIEWER role.
 *
 * More than one participant may be attached to the same submission (a team), and the same user may
 * participate in more than one submission across competitions; only the (submission, user) pair is
 * unique.
 */
export const submissionParticipants = sqliteTable(
  "submission_participant",
  {
    id: text("id").primaryKey(),
    competitionId: text("competition_id")
      .notNull()
      .references(() => competitions.id, { onDelete: "cascade" }),
    submissionId: text("submission_id").notNull(),
    userId: text("user_id").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    uniqueIndex("submission_participant_submission_user_unique").on(
      table.submissionId,
      table.userId,
    ),
    index("submission_participant_competition_id_index").on(table.competitionId),
    index("submission_participant_submission_id_index").on(table.submissionId),
    index("submission_participant_user_id_index").on(table.userId),
    // The attached submission must belong to this row's own competition.
    foreignKey({
      columns: [table.competitionId, table.submissionId],
      foreignColumns: [submissions.competitionId, submissions.id],
      name: "submission_participant_submission_competition_fk",
    }).onDelete("cascade"),
    // The attached user must already be a member of that same competition.
    foreignKey({
      columns: [table.competitionId, table.userId],
      foreignColumns: [competitionMembers.competitionId, competitionMembers.userId],
      name: "submission_participant_member_fk",
    }).onDelete("cascade"),
  ],
);
