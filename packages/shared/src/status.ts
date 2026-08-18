import { z } from "zod";

export const LIFECYCLE_STATUS_VALUES = ["DRAFT", "ACTIVE", "ARCHIVED"] as const;

export const CompetitionStatusSchema = z.enum(LIFECYCLE_STATUS_VALUES);
export type CompetitionStatus = z.infer<typeof CompetitionStatusSchema>;

export const VersionStatusSchema = z.enum(LIFECYCLE_STATUS_VALUES);
export type VersionStatus = z.infer<typeof VersionStatusSchema>;
