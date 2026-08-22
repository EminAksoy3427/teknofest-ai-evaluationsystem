import type { EligibleContestant, SubmissionParticipant } from "@teknofest-ai/shared";
import { MAX_ELIGIBLE_CONTESTANTS, MAX_SUBMISSION_PARTICIPANTS } from "@teknofest-ai/shared";

export type SubmissionParticipantRepositoryErrorCode = "NOT_FOUND" | "CONFLICT";
export type SubmissionParticipantRepositoryErrorReason =
  | "SUBMISSION"
  | "PARTICIPANT"
  | "CONTESTANT_MEMBERSHIP"
  | "DUPLICATE_PARTICIPANT";

export class SubmissionParticipantRepositoryError extends Error {
  readonly code: SubmissionParticipantRepositoryErrorCode;
  readonly reason: SubmissionParticipantRepositoryErrorReason;

  constructor(
    code: SubmissionParticipantRepositoryErrorCode,
    reason: SubmissionParticipantRepositoryErrorReason,
  ) {
    super(`${code}:${reason}`);
    this.name = "SubmissionParticipantRepositoryError";
    this.code = code;
    this.reason = reason;
  }
}

export interface SubmissionParticipantInput {
  id: string;
  competitionId: string;
  submissionId: string;
  userId: string;
}

interface ParticipantRow {
  id: string;
  competition_id: string;
  submission_id: string;
  user_id: string;
  name: string;
  email: string;
  created_at: number;
}

function mapParticipant(row: ParticipantRow): SubmissionParticipant {
  return {
    id: row.id,
    competitionId: row.competition_id,
    submissionId: row.submission_id,
    userId: row.user_id,
    name: row.name,
    email: row.email,
    createdAt: Number(row.created_at),
  };
}

function isDuplicateParticipantError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /submission_participant_submission_user_unique|submission_participant\.submission_id/i.test(
      error.message,
    )
  );
}

/**
 * Attaches a contestant to a submission. The competition, the submission and the CONTESTANT
 * membership are all resolved from the database in a single guarded statement: the inserted
 * `competition_id` and `submission_id` come from the `submission` row itself, and the target user
 * must already hold a `CONTESTANT` membership in that same competition. A caller therefore cannot
 * attach a submission from another competition, nor a user who is not a contestant there, even by
 * sending mismatched identifiers — and a contestant can never reach this at all, since only
 * `competition:configure` (COMPETITION_MANAGER) routes call it.
 */
export async function createSubmissionParticipant(
  binding: D1Database,
  input: SubmissionParticipantInput,
): Promise<SubmissionParticipant> {
  let result: D1Result;
  try {
    result = await binding
      .prepare(
        `INSERT INTO submission_participant (id, competition_id, submission_id, user_id, created_at)
         SELECT ?, submission.competition_id, submission.id, competition_member.user_id, ?
         FROM submission
         INNER JOIN competition_member
           ON competition_member.competition_id = submission.competition_id
          AND competition_member.user_id = ?
          AND competition_member.role = 'CONTESTANT'
         WHERE submission.id = ?
           AND submission.competition_id = ?
         LIMIT 1`,
      )
      .bind(input.id, Date.now(), input.userId, input.submissionId, input.competitionId)
      .run();
  } catch (error) {
    if (isDuplicateParticipantError(error)) {
      throw new SubmissionParticipantRepositoryError("CONFLICT", "DUPLICATE_PARTICIPANT");
    }
    throw error;
  }

  if (result.meta.changes !== 1) {
    const submission = await binding
      .prepare("SELECT id FROM submission WHERE id = ? AND competition_id = ? LIMIT 1")
      .bind(input.submissionId, input.competitionId)
      .first();
    if (!submission) {
      throw new SubmissionParticipantRepositoryError("NOT_FOUND", "SUBMISSION");
    }
    throw new SubmissionParticipantRepositoryError("CONFLICT", "CONTESTANT_MEMBERSHIP");
  }

  const { results } = await binding
    .prepare(
      `SELECT participant.id, participant.competition_id, participant.submission_id,
              participant.user_id, "user".name, "user".email, participant.created_at
       FROM submission_participant participant
       INNER JOIN "user" ON "user".id = participant.user_id
       WHERE participant.id = ?
       LIMIT 1`,
    )
    .bind(input.id)
    .all<ParticipantRow>();
  const created = results[0];
  if (!created) {
    throw new SubmissionParticipantRepositoryError("NOT_FOUND", "PARTICIPANT");
  }
  return mapParticipant(created);
}

/** Competition-scoped list of a submission's attached contestants, for the manager UI. */
export async function listSubmissionParticipants(
  binding: D1Database,
  competitionId: string,
  submissionId: string,
): Promise<SubmissionParticipant[]> {
  const { results } = await binding
    .prepare(
      `SELECT participant.id, participant.competition_id, participant.submission_id,
              participant.user_id, "user".name, "user".email, participant.created_at
       FROM submission_participant participant
       INNER JOIN "user" ON "user".id = participant.user_id
       WHERE participant.competition_id = ? AND participant.submission_id = ?
       ORDER BY "user".name ASC, "user".email ASC
       LIMIT ?`,
    )
    .bind(competitionId, submissionId, MAX_SUBMISSION_PARTICIPANTS)
    .all<ParticipantRow>();
  return results.map(mapParticipant);
}

/** Removes a contestant's attachment to a submission. Idempotent-safe: removing already implies
 * the contestant no longer has ownership; there is no submitted/published state to protect here
 * (unlike a reviewer assignment), so no immutability guard is needed. */
export async function deleteSubmissionParticipant(
  binding: D1Database,
  competitionId: string,
  submissionId: string,
  participantId: string,
): Promise<void> {
  const result = await binding
    .prepare(
      `DELETE FROM submission_participant
       WHERE id = ? AND competition_id = ? AND submission_id = ?`,
    )
    .bind(participantId, competitionId, submissionId)
    .run();
  if (result.meta.changes !== 1) {
    throw new SubmissionParticipantRepositoryError("NOT_FOUND", "PARTICIPANT");
  }
}

/** Competition members who actually hold the CONTESTANT role, for the attachment picker. */
export async function listEligibleContestants(
  binding: D1Database,
  competitionId: string,
): Promise<EligibleContestant[]> {
  const { results } = await binding
    .prepare(
      `SELECT
         contestant.id AS user_id,
         contestant.name AS name,
         contestant.email AS email,
         (SELECT count(*) FROM submission_participant participant
            WHERE participant.competition_id = member.competition_id
              AND participant.user_id = contestant.id) AS participating_submission_count
       FROM competition_member member
       INNER JOIN "user" contestant ON contestant.id = member.user_id
       WHERE member.competition_id = ? AND member.role = 'CONTESTANT'
       ORDER BY contestant.name ASC, contestant.email ASC
       LIMIT ?`,
    )
    .bind(competitionId, MAX_ELIGIBLE_CONTESTANTS)
    .all<{
      user_id: string;
      name: string;
      email: string;
      participating_submission_count: number;
    }>();

  return results.map((row) => ({
    userId: row.user_id,
    name: row.name,
    email: row.email,
    participatingSubmissionCount: Number(row.participating_submission_count),
  }));
}

export const submissionParticipantRepository = {
  createSubmissionParticipant,
  deleteSubmissionParticipant,
  listEligibleContestants,
  listSubmissionParticipants,
};

export type SubmissionParticipantRepository = typeof submissionParticipantRepository;
