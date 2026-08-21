import { z } from "zod";

export const COMPETITION_ROLE_VALUES = [
  "COMPETITION_MANAGER",
  "REVIEWER",
  "CONTESTANT",
  "EVALUATION_MANAGER",
] as const;

export const CompetitionRoleSchema = z.enum(COMPETITION_ROLE_VALUES);

export type CompetitionRole = z.infer<typeof CompetitionRoleSchema>;

export const PERMISSION_VALUES = [
  "competition:configure",
  "competition:view-operations",
  "review:assign",
  "submission:review",
  "feedback:view-own",
] as const;

export const PermissionSchema = z.enum(PERMISSION_VALUES);

export type Permission = z.infer<typeof PermissionSchema>;

export const MembershipSummarySchema = z
  .object({
    competitionId: z.string().min(1),
    competitionName: z.string().min(1),
    competitionSlug: z.string().min(1),
    role: CompetitionRoleSchema,
  })
  .strict();

export type MembershipSummary = z.infer<typeof MembershipSummarySchema>;

export const MembershipListResponseSchema = z
  .object({
    memberships: z.array(MembershipSummarySchema),
  })
  .strict();

export type MembershipListResponse = z.infer<typeof MembershipListResponseSchema>;

export const CompetitionAccessResponseSchema = z
  .object({
    competitionId: z.string().min(1),
    role: CompetitionRoleSchema,
    permissions: z.array(PermissionSchema),
  })
  .strict();

export type CompetitionAccessResponse = z.infer<typeof CompetitionAccessResponseSchema>;

export const ForbiddenResponseSchema = z
  .object({
    code: z.literal("FORBIDDEN"),
    message: z.literal("Bu yarışma için erişim yetkiniz yok."),
  })
  .strict();

export type ForbiddenResponse = z.infer<typeof ForbiddenResponseSchema>;

export function createMembershipListResponse(
  memberships: readonly MembershipSummary[],
): MembershipListResponse {
  return MembershipListResponseSchema.parse({ memberships });
}

export function createCompetitionAccessResponse(
  response: CompetitionAccessResponse,
): CompetitionAccessResponse {
  return CompetitionAccessResponseSchema.parse(response);
}

export function createForbiddenResponse(): ForbiddenResponse {
  return ForbiddenResponseSchema.parse({
    code: "FORBIDDEN",
    message: "Bu yarışma için erişim yetkiniz yok.",
  });
}
