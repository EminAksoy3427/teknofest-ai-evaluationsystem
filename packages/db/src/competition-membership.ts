import {
  type CompetitionRole,
  CompetitionRoleSchema,
  type MembershipSummary,
} from "@teknofest-ai/shared";
import { and, asc, eq } from "drizzle-orm";

import { createDb } from "./client";
import { competitionMembers, competitions } from "./schema";

export interface CompetitionMembership {
  competitionId: string;
  userId: string;
  role: CompetitionRole;
}

export type CompetitionMembershipLookup = (
  binding: D1Database,
  userId: string,
  competitionId: string,
) => Promise<CompetitionMembership | null>;

export type MembershipSummaryList = (
  binding: D1Database,
  userId: string,
) => Promise<MembershipSummary[]>;

export const findCompetitionMembership: CompetitionMembershipLookup = async (
  binding,
  userId,
  competitionId,
) => {
  const [membership] = await createDb(binding)
    .select({
      competitionId: competitionMembers.competitionId,
      userId: competitionMembers.userId,
      role: competitionMembers.role,
    })
    .from(competitionMembers)
    .where(
      and(
        eq(competitionMembers.userId, userId),
        eq(competitionMembers.competitionId, competitionId),
      ),
    )
    .limit(1);

  if (!membership) {
    return null;
  }

  return {
    ...membership,
    role: CompetitionRoleSchema.parse(membership.role),
  };
};

export const listMembershipSummaries: MembershipSummaryList = async (binding, userId) => {
  const memberships = await createDb(binding)
    .select({
      competitionId: competitionMembers.competitionId,
      competitionName: competitions.name,
      competitionSlug: competitions.slug,
      role: competitionMembers.role,
    })
    .from(competitionMembers)
    .innerJoin(competitions, eq(competitionMembers.competitionId, competitions.id))
    .where(eq(competitionMembers.userId, userId))
    .orderBy(asc(competitions.name), asc(competitions.id));

  return memberships.map((membership) => ({
    ...membership,
    role: CompetitionRoleSchema.parse(membership.role),
  }));
};
