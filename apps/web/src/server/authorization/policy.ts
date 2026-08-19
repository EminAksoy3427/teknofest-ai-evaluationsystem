import type { CompetitionRole, Permission } from "@teknofest-ai/shared";

const ROLE_PERMISSIONS = {
  COMPETITION_MANAGER: ["competition:configure"],
  EVALUATION_MANAGER: ["competition:view-operations"],
  REVIEWER: ["submission:review"],
  CONTESTANT: ["feedback:view-own"],
} as const satisfies Record<CompetitionRole, readonly Permission[]>;

export function getPermissionsForRole(role: CompetitionRole): Permission[] {
  return [...ROLE_PERMISSIONS[role]];
}
