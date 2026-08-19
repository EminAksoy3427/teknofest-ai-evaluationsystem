import { COMPETITION_ROLE_VALUES } from "@teknofest-ai/shared";
import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { user } from "./auth";
import { competitions } from "./competition";

const quotedCompetitionRoles = COMPETITION_ROLE_VALUES.map((role) => `'${role}'`).join(", ");
const competitionRoleValuesSql = sql.raw(`(${quotedCompetitionRoles})`);

export const competitionMembers = sqliteTable(
  "competition_member",
  {
    id: text("id").primaryKey(),
    competitionId: text("competition_id")
      .notNull()
      .references(() => competitions.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role", { enum: COMPETITION_ROLE_VALUES }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    uniqueIndex("competition_member_competition_user_unique").on(table.competitionId, table.userId),
    index("competition_member_competition_id_index").on(table.competitionId),
    index("competition_member_user_id_index").on(table.userId),
    index("competition_member_competition_role_index").on(table.competitionId, table.role),
    check("competition_member_role_check", sql`${table.role} in ${competitionRoleValuesSql}`),
  ],
);
