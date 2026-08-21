import type { CompetitionRole, Permission } from "@teknofest-ai/shared";

/**
 * Explicit, non-hierarchical role-to-permission mapping.
 *
 * `submission:review` belongs to REVIEWER alone and is deliberately NOT granted to any manager
 * role: an evaluation manager runs the evaluation operation but may never masquerade as a reviewer
 * and score a submission. The permission is also not sufficient on its own — every reviewer route
 * additionally requires an explicit ReviewerAssignment owned by the session user.
 */
const ROLE_PERMISSIONS = {
  COMPETITION_MANAGER: ["competition:configure", "competition:view-operations", "review:assign"],
  EVALUATION_MANAGER: ["competition:view-operations", "review:assign"],
  REVIEWER: ["submission:review"],
  CONTESTANT: ["feedback:view-own"],
} as const satisfies Record<CompetitionRole, readonly Permission[]>;

export function getPermissionsForRole(role: CompetitionRole): Permission[] {
  return [...ROLE_PERMISSIONS[role]];
}
