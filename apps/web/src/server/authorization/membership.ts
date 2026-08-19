import { type CompetitionMembershipLookup, findCompetitionMembership } from "@teknofest-ai/db";
import type { CompetitionRole, Permission } from "@teknofest-ai/shared";

import type { AuthRuntimeBindings } from "../auth/auth";
import { AuthorizationError } from "./error";
import { getPermissionsForRole } from "./policy";

export async function getCompetitionMembership(
  environment: AuthRuntimeBindings,
  userId: string,
  competitionId: string,
  lookup: CompetitionMembershipLookup = findCompetitionMembership,
) {
  return lookup(environment.DB, userId, competitionId);
}

export async function requireCompetitionMembership(
  environment: AuthRuntimeBindings,
  userId: string,
  competitionId: string,
  lookup: CompetitionMembershipLookup = findCompetitionMembership,
) {
  const membership = await getCompetitionMembership(environment, userId, competitionId, lookup);

  if (!membership) {
    throw new AuthorizationError("FORBIDDEN");
  }

  return membership;
}

export async function requireCompetitionRole(
  environment: AuthRuntimeBindings,
  userId: string,
  competitionId: string,
  allowedRoles: readonly CompetitionRole[],
  lookup: CompetitionMembershipLookup = findCompetitionMembership,
) {
  const membership = await requireCompetitionMembership(environment, userId, competitionId, lookup);

  if (!allowedRoles.includes(membership.role)) {
    throw new AuthorizationError("FORBIDDEN");
  }

  return membership;
}

export async function requireCompetitionPermission(
  environment: AuthRuntimeBindings,
  userId: string,
  competitionId: string,
  permission: Permission,
  lookup: CompetitionMembershipLookup = findCompetitionMembership,
) {
  const membership = await requireCompetitionMembership(environment, userId, competitionId, lookup);

  if (!getPermissionsForRole(membership.role).includes(permission)) {
    throw new AuthorizationError("FORBIDDEN");
  }

  return membership;
}
