import {
  MAX_SIMILARITY_CANDIDATES,
  MAX_SIMILARITY_TOP_MATCHES,
  type SimilarityLevel,
  SimilarityLevelSchema,
  type SimilarityMode,
  SimilarityModeSchema,
  type SimilarityPairResponse,
  SimilarityPairResponseSchema,
  SimilarityScoreSchema,
  type SimilaritySectionMatch,
  SimilaritySectionMatchSchema,
  type TemplateStructuralProfile,
  TemplateStructuralProfileSchema,
} from "@teknofest-ai/shared";

import { AnalysisRunRepositoryError } from "./analysis-run";

export interface EligibleSimilarityRun {
  competitionId: string;
  submissionId: string;
  analysisRunId: string;
  applicationCode: string;
  projectTitle: string;
  sourceSha256: string;
  documentArtifactKey: string;
  templateStructuralProfile: TemplateStructuralProfile;
}

export interface SimilarityPairWriteInput {
  competitionId: string;
  sourceSubmissionId: string;
  otherSubmissionId: string;
  sourceAnalysisRunId: string;
  otherAnalysisRunId: string;
  lexicalScore: number;
  semanticScore: number | null;
  combinedScore: number;
  mode: SimilarityMode;
  level: SimilarityLevel;
  exactDocumentMatch: boolean;
  evidence: SimilaritySectionMatch[];
}

export interface CanonicalSimilarityPairIdentity {
  submissionAId: string;
  submissionBId: string;
  analysisRunAId: string;
  analysisRunBId: string;
}

export function canonicalSubmissionPair(first: string, second: string): [string, string] {
  if (first === second) throw new Error("Bir başvuru kendisiyle benzerlik çifti oluşturamaz.");
  return first < second ? [first, second] : [second, first];
}

/**
 * Canonical side ordering is deterministic on the submission ids, but every AnalysisRun identity
 * moves with its own submission. Submission ids are never canonicalised independently from the
 * AnalysisRun ids they were observed with.
 */
export function canonicalSimilarityPairIdentity(input: {
  sourceSubmissionId: string;
  otherSubmissionId: string;
  sourceAnalysisRunId: string;
  otherAnalysisRunId: string;
}): CanonicalSimilarityPairIdentity {
  const [submissionAId, submissionBId] = canonicalSubmissionPair(
    input.sourceSubmissionId,
    input.otherSubmissionId,
  );
  const sourceIsA = input.sourceSubmissionId === submissionAId;
  return {
    submissionAId,
    submissionBId,
    analysisRunAId: sourceIsA ? input.sourceAnalysisRunId : input.otherAnalysisRunId,
    analysisRunBId: sourceIsA ? input.otherAnalysisRunId : input.sourceAnalysisRunId,
  };
}

function timestamp(value: unknown): number {
  return value instanceof Date ? value.getTime() : Number(value);
}

export async function listEligibleCompetitionRuns(
  binding: D1Database,
  competitionId: string,
  excludedSubmissionId: string,
  limit = MAX_SIMILARITY_CANDIDATES,
): Promise<EligibleSimilarityRun[]> {
  const boundedLimit = Math.max(0, Math.min(Math.trunc(limit), MAX_SIMILARITY_CANDIDATES));
  if (boundedLimit === 0) return [];
  const result = await binding
    .prepare(
      `SELECT ar.id AS analysis_run_id, ar.submission_id, ar.source_sha256,
              ar.document_artifact_key, s.competition_id, s.application_code, s.project_title,
              tv.structural_profile
       FROM analysis_run ar
       INNER JOIN submission s ON s.id = ar.submission_id
       INNER JOIN template_version tv ON tv.id = ar.template_version_id
       WHERE s.competition_id = ?
         AND ar.submission_id <> ?
         AND ar.status = 'SUCCEEDED'
         AND ar.document_artifact_key is not null
         AND NOT EXISTS (
           SELECT 1 FROM analysis_run newer
           WHERE newer.submission_id = ar.submission_id
             AND newer.status = 'SUCCEEDED'
             AND (newer.completed_at > ar.completed_at OR (newer.completed_at = ar.completed_at AND newer.id > ar.id))
         )
       ORDER BY ar.completed_at DESC, ar.id DESC
       LIMIT ?`,
    )
    .bind(competitionId, excludedSubmissionId, boundedLimit)
    .all();

  return result.results.map((row) => ({
    competitionId: String(row.competition_id),
    submissionId: String(row.submission_id),
    analysisRunId: String(row.analysis_run_id),
    applicationCode: String(row.application_code),
    projectTitle: String(row.project_title),
    sourceSha256: String(row.source_sha256),
    documentArtifactKey: String(row.document_artifact_key),
    templateStructuralProfile: TemplateStructuralProfileSchema.parse(
      JSON.parse(String(row.structural_profile)),
    ),
  }));
}

/**
 * Writes the historical similarity observation for one specific AnalysisRun pair.
 *
 * The conflict target is the canonical AnalysisRun pair, so a Workflow retry of the same run pair
 * reconciles only the measured values. `competition_id`, both submission ids and both AnalysisRun
 * ids are immutable identity columns and are never rewritten; a newer AnalysisRun therefore
 * produces a new historical row and leaves older observations reproducible.
 */
export async function upsertSimilarityPair(
  binding: D1Database,
  input: SimilarityPairWriteInput,
): Promise<void> {
  const identity = canonicalSimilarityPairIdentity(input);
  const lexicalScore = SimilarityScoreSchema.parse(input.lexicalScore);
  const semanticScore =
    input.semanticScore === null ? null : SimilarityScoreSchema.parse(input.semanticScore);
  const combinedScore = SimilarityScoreSchema.parse(input.combinedScore);
  const mode = SimilarityModeSchema.parse(input.mode);
  const level = SimilarityLevelSchema.parse(input.level);
  const evidence = SimilaritySectionMatchSchema.array().parse(input.evidence);
  if ((mode === "LEXICAL_ONLY") !== (semanticScore === null)) {
    throw new Error("Benzerlik modu ile semantik skor tutarsız.");
  }

  const now = Date.now();
  const result = await binding
    .prepare(
      `INSERT INTO similarity_pair (
         id, competition_id, submission_a_id, submission_b_id, analysis_run_a_id,
         analysis_run_b_id, lexical_score, semantic_score, combined_score, mode,
         level, exact_document_match, evidence_json, created_at, updated_at
       )
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
       WHERE EXISTS (SELECT 1 FROM submission WHERE id = ? AND competition_id = ?)
         AND EXISTS (SELECT 1 FROM submission WHERE id = ? AND competition_id = ?)
         AND EXISTS (SELECT 1 FROM analysis_run WHERE id = ? AND submission_id = ?)
         AND EXISTS (SELECT 1 FROM analysis_run WHERE id = ? AND submission_id = ?)
       ON CONFLICT (competition_id, analysis_run_a_id, analysis_run_b_id) DO UPDATE SET
         lexical_score = excluded.lexical_score,
         semantic_score = excluded.semantic_score,
         combined_score = excluded.combined_score,
         mode = excluded.mode,
         level = excluded.level,
         exact_document_match = excluded.exact_document_match,
         evidence_json = excluded.evidence_json,
         updated_at = excluded.updated_at`,
    )
    .bind(
      crypto.randomUUID(),
      input.competitionId,
      identity.submissionAId,
      identity.submissionBId,
      identity.analysisRunAId,
      identity.analysisRunBId,
      lexicalScore,
      semanticScore,
      combinedScore,
      mode,
      level,
      input.exactDocumentMatch ? 1 : 0,
      JSON.stringify(evidence),
      now,
      now,
      identity.submissionAId,
      input.competitionId,
      identity.submissionBId,
      input.competitionId,
      identity.analysisRunAId,
      identity.submissionAId,
      identity.analysisRunBId,
      identity.submissionBId,
    )
    .run();
  if (result.meta.changes !== 1) {
    throw new Error("Benzerlik çifti aynı yarışma ve koşu kapsamıyla doğrulanamadı.");
  }
}

/**
 * Historical observations pinned to one AnalysisRun. The selected run never floats forward: only
 * rows carrying that exact run identity are returned. Where the same counterpart submission was
 * observed more than once against this run, the most recent observation for that counterpart is
 * surfaced, still pinned to the requested run.
 */
const RUN_SCOPED_PAIR_QUERY = `SELECT sp.*,
          CASE WHEN sp.analysis_run_a_id = ?2 THEN sb.id ELSE sa.id END AS other_id,
          CASE WHEN sp.analysis_run_a_id = ?2 THEN sb.application_code ELSE sa.application_code END AS other_application_code,
          CASE WHEN sp.analysis_run_a_id = ?2 THEN sb.project_title ELSE sa.project_title END AS other_project_title
   FROM similarity_pair sp
   INNER JOIN submission sa ON sa.id = sp.submission_a_id AND sa.competition_id = sp.competition_id
   INNER JOIN submission sb ON sb.id = sp.submission_b_id AND sb.competition_id = sp.competition_id
   WHERE sp.competition_id = ?1
     AND (sp.analysis_run_a_id = ?2 OR sp.analysis_run_b_id = ?2)
     AND NOT EXISTS (
       SELECT 1 FROM similarity_pair newer
       WHERE newer.competition_id = sp.competition_id
         AND (newer.analysis_run_a_id = ?2 OR newer.analysis_run_b_id = ?2)
         AND (CASE WHEN newer.analysis_run_a_id = ?2 THEN newer.submission_b_id ELSE newer.submission_a_id END)
             = (CASE WHEN sp.analysis_run_a_id = ?2 THEN sp.submission_b_id ELSE sp.submission_a_id END)
         AND (newer.created_at > sp.created_at OR (newer.created_at = sp.created_at AND newer.id > sp.id))
     )
   ORDER BY sp.combined_score DESC, sp.created_at DESC, sp.id ASC
   LIMIT ?3`;

function mapPairRow(row: Record<string, unknown>): SimilarityPairResponse {
  return SimilarityPairResponseSchema.parse({
    id: row.id,
    competitionId: row.competition_id,
    submissionAId: row.submission_a_id,
    submissionBId: row.submission_b_id,
    analysisRunAId: row.analysis_run_a_id,
    analysisRunBId: row.analysis_run_b_id,
    lexicalScore: row.lexical_score,
    semanticScore: row.semantic_score,
    combinedScore: row.combined_score,
    mode: row.mode,
    level: row.level,
    exactDocumentMatch: Boolean(row.exact_document_match),
    evidence: JSON.parse(String(row.evidence_json)),
    otherSubmission: {
      id: row.other_id,
      applicationCode: row.other_application_code,
      projectTitle: row.other_project_title,
    },
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
  });
}

async function selectRunScopedPairs(
  binding: D1Database,
  competitionId: string,
  analysisRunId: string,
): Promise<SimilarityPairResponse[]> {
  const result = await binding
    .prepare(RUN_SCOPED_PAIR_QUERY)
    .bind(competitionId, analysisRunId, MAX_SIMILARITY_TOP_MATCHES)
    .all();
  return result.results.map((row) => mapPairRow(row as Record<string, unknown>));
}

/**
 * Similarity observations belonging to one specific historical AnalysisRun. The run must belong to
 * a submission of the requested competition.
 */
export async function listAnalysisRunSimilarity(
  binding: D1Database,
  competitionId: string,
  analysisRunId: string,
): Promise<SimilarityPairResponse[]> {
  const run = await binding
    .prepare(
      `SELECT ar.id FROM analysis_run ar
       INNER JOIN submission s ON s.id = ar.submission_id
       WHERE ar.id = ? AND s.competition_id = ? LIMIT 1`,
    )
    .bind(analysisRunId, competitionId)
    .first();
  if (!run) throw new AnalysisRunRepositoryError("NOT_FOUND", "RESOURCE");
  return selectRunScopedPairs(binding, competitionId, analysisRunId);
}

/**
 * Resolves the submission's current AnalysisRun and returns the observations recorded for that
 * run. The submission-level view is derived deliberately from a single selected run instead of
 * merging the newest SimilarityPair rows for the logical submission pair.
 */
export async function resolveCurrentSubmissionAnalysisRunId(
  binding: D1Database,
  competitionId: string,
  submissionId: string,
): Promise<string | null> {
  const submission = await binding
    .prepare("SELECT id FROM submission WHERE id = ? AND competition_id = ? LIMIT 1")
    .bind(submissionId, competitionId)
    .first();
  if (!submission) throw new AnalysisRunRepositoryError("NOT_FOUND", "SUBMISSION");
  const run = await binding
    .prepare(
      `SELECT ar.id
       FROM analysis_run ar
       INNER JOIN submission s ON s.id = ar.submission_id
       WHERE ar.submission_id = ? AND s.competition_id = ? AND ar.status = 'SUCCEEDED'
       ORDER BY ar.completed_at DESC, ar.id DESC
       LIMIT 1`,
    )
    .bind(submissionId, competitionId)
    .first();
  return run ? String(run.id) : null;
}

export async function listSubmissionSimilarity(
  binding: D1Database,
  competitionId: string,
  submissionId: string,
): Promise<{ analysisRunId: string | null; pairs: SimilarityPairResponse[] }> {
  const analysisRunId = await resolveCurrentSubmissionAnalysisRunId(
    binding,
    competitionId,
    submissionId,
  );
  if (!analysisRunId) return { analysisRunId: null, pairs: [] };
  return {
    analysisRunId,
    pairs: await selectRunScopedPairs(binding, competitionId, analysisRunId),
  };
}

export const similarityPairRepository = {
  listAnalysisRunSimilarity,
  listEligibleCompetitionRuns,
  listSubmissionSimilarity,
  resolveCurrentSubmissionAnalysisRunId,
  upsertSimilarityPair,
};
export type SimilarityPairRepository = typeof similarityPairRepository;
