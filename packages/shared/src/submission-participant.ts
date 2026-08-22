import { z } from "zod";

/**
 * A SubmissionParticipant is the explicit, competition-scoped grant that lets one authenticated
 * CONTESTANT see their own submission's published feedback. The CONTESTANT role alone never grants
 * ownership of any particular submission: without a row here, `/api/v1/me/submissions` and the
 * feedback endpoints report the submission as not participated in.
 *
 * More than one participant may be attached to the same submission (a team), and the same user may
 * participate in more than one submission; only the pair is unique.
 */

export const MAX_SUBMISSION_PARTICIPANTS = 50;
export const MAX_ELIGIBLE_CONTESTANTS = 500;

export const SubmissionParticipantSchema = z
  .object({
    id: z.string().min(1),
    competitionId: z.string().min(1),
    submissionId: z.string().min(1),
    userId: z.string().min(1),
    name: z.string().min(1).max(200),
    email: z.string().min(1).max(320),
    createdAt: z.number().int().nonnegative(),
  })
  .strict();
export type SubmissionParticipant = z.infer<typeof SubmissionParticipantSchema>;

export const SubmissionParticipantListResponseSchema = z
  .object({
    submissionId: z.string().min(1),
    participants: z.array(SubmissionParticipantSchema).max(MAX_SUBMISSION_PARTICIPANTS),
  })
  .strict();
export type SubmissionParticipantListResponse = z.infer<
  typeof SubmissionParticipantListResponseSchema
>;

/**
 * The manager picks an existing competition member by their user id; a client can never invent an
 * arbitrary user or competition/user pairing — the server re-validates that the selected user is a
 * CONTESTANT member of this same competition before the row is written.
 */
export const SubmissionParticipantCreateRequestSchema = z
  .object({ userId: z.string().min(1) })
  .strict();
export type SubmissionParticipantCreateRequest = z.infer<
  typeof SubmissionParticipantCreateRequestSchema
>;

/** Competition members holding the CONTESTANT role, for the participant-attachment picker. */
export const EligibleContestantSchema = z
  .object({
    userId: z.string().min(1),
    name: z.string().min(1).max(200),
    email: z.string().min(1).max(320),
    participatingSubmissionCount: z.number().int().nonnegative(),
  })
  .strict();
export type EligibleContestant = z.infer<typeof EligibleContestantSchema>;

export const EligibleContestantListResponseSchema = z
  .object({ contestants: z.array(EligibleContestantSchema).max(MAX_ELIGIBLE_CONTESTANTS) })
  .strict();
export type EligibleContestantListResponse = z.infer<typeof EligibleContestantListResponseSchema>;
