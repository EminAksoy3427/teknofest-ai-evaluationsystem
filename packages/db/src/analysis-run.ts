import {
  type AnalysisErrorCode,
  type AnalysisRunResponse,
  AnalysisRunResponseSchema,
  type DocumentExtractionWarning,
  DocumentExtractionWarningSchema,
} from "@teknofest-ai/shared";
import { and, desc, eq, inArray } from "drizzle-orm";

import { createDb } from "./client";
import { analysisRuns, submissionFiles, submissions } from "./schema";

export type AnalysisRunRepositoryErrorCode = "NOT_FOUND" | "CONFLICT";
export type AnalysisRunRepositoryErrorReason =
  | "SUBMISSION"
  | "CONFIGURATION_NOT_READY"
  | "CONCURRENT_RUN"
  | "RESOURCE";

export class AnalysisRunRepositoryError extends Error {
  readonly code: AnalysisRunRepositoryErrorCode;
  readonly reason: AnalysisRunRepositoryErrorReason;

  constructor(code: AnalysisRunRepositoryErrorCode, reason: AnalysisRunRepositoryErrorReason) {
    super(`${code}:${reason}`);
    this.name = "AnalysisRunRepositoryError";
    this.code = code;
    this.reason = reason;
  }
}

export interface QueuedAnalysisRunInput {
  id: string;
  workflowInstanceId: string;
  competitionId: string;
  submissionId: string;
}

export interface AnalysisRunExecutionContext {
  id: string;
  submissionId: string;
  status: "QUEUED" | "PROCESSING" | "SUCCEEDED" | "FAILED";
  sourceSha256: string;
  sourceStorageKey: string;
  documentArtifactKey: string | null;
}

export interface AnalysisRunSuccessInput {
  documentArtifactKey: string;
  pageCount: number;
  characterCount: number;
  warnings: DocumentExtractionWarning[];
}

function timestamp(value: Date | number): number {
  return value instanceof Date ? value.getTime() : value;
}

function parseWarnings(value: string): DocumentExtractionWarning[] {
  return DocumentExtractionWarningSchema.array().parse(JSON.parse(value));
}

function mapAnalysisRun(row: typeof analysisRuns.$inferSelect): AnalysisRunResponse {
  return AnalysisRunResponseSchema.parse({
    id: row.id,
    submissionId: row.submissionId,
    categoryId: row.categoryId,
    status: row.status,
    stage: row.stage,
    templateVersionId: row.templateVersionId,
    rubricVersionId: row.rubricVersionId,
    sourceSha256: row.sourceSha256,
    createdAt: timestamp(row.createdAt),
    startedAt: row.startedAt === null ? null : timestamp(row.startedAt),
    completedAt: row.completedAt === null ? null : timestamp(row.completedAt),
    extraction: {
      pageCount: row.pageCount,
      characterCount: row.characterCount,
      warnings: parseWarnings(row.extractionWarnings),
    },
    error:
      row.errorCode && row.errorMessage ? { code: row.errorCode, message: row.errorMessage } : null,
  });
}

function isConcurrentRunConstraint(error: unknown): boolean {
  return (
    error instanceof Error &&
    /analysis_run_one_in_flight_per_submission|analysis_run\.submission_id/i.test(error.message)
  );
}

async function scopedAnalysisRunRow(
  binding: D1Database,
  competitionId: string,
  submissionId: string,
  analysisRunId: string,
) {
  const [result] = await createDb(binding)
    .select({ run: analysisRuns })
    .from(analysisRuns)
    .innerJoin(submissions, eq(analysisRuns.submissionId, submissions.id))
    .where(
      and(
        eq(analysisRuns.id, analysisRunId),
        eq(analysisRuns.submissionId, submissionId),
        eq(submissions.competitionId, competitionId),
      ),
    )
    .limit(1);

  return result?.run ?? null;
}

export async function createQueuedAnalysisRun(
  binding: D1Database,
  input: QueuedAnalysisRunInput,
): Promise<AnalysisRunResponse> {
  const now = Date.now();
  let result: D1Result;
  try {
    result = await binding
      .prepare(
        `INSERT INTO analysis_run (
           id,
           submission_id,
           category_id,
           template_version_id,
           rubric_version_id,
           source_sha256,
           status,
           stage,
           workflow_instance_id,
           extraction_warnings,
           created_at
         )
         SELECT
           ?,
           submission.id,
           category.id,
           template_version.id,
           rubric_version.id,
           submission_file.sha256,
           'QUEUED',
           'INGEST_AND_EXTRACT',
           ?,
           '[]',
           ?
         FROM submission
         INNER JOIN category
           ON category.id = submission.category_id
          AND category.competition_id = submission.competition_id
         INNER JOIN submission_file
           ON submission_file.submission_id = submission.id
         INNER JOIN template_version
           ON template_version.competition_id = submission.competition_id
          AND template_version.status = 'ACTIVE'
         INNER JOIN rubric_version
           ON rubric_version.competition_id = submission.competition_id
          AND rubric_version.status = 'ACTIVE'
         WHERE submission.id = ?
           AND submission.competition_id = ?
           AND EXISTS (
             SELECT 1
             FROM criterion
             WHERE criterion.rubric_version_id = rubric_version.id
           )
         LIMIT 1`,
      )
      .bind(input.id, input.workflowInstanceId, now, input.submissionId, input.competitionId)
      .run();
  } catch (error) {
    if (isConcurrentRunConstraint(error)) {
      throw new AnalysisRunRepositoryError("CONFLICT", "CONCURRENT_RUN");
    }
    throw error;
  }

  if (result.meta.changes !== 1) {
    const submission = await binding
      .prepare(
        `SELECT submission.id
         FROM submission
         INNER JOIN category
           ON category.id = submission.category_id
          AND category.competition_id = submission.competition_id
         INNER JOIN submission_file
           ON submission_file.submission_id = submission.id
         WHERE submission.id = ?
           AND submission.competition_id = ?
         LIMIT 1`,
      )
      .bind(input.submissionId, input.competitionId)
      .first();
    if (!submission) {
      throw new AnalysisRunRepositoryError("NOT_FOUND", "SUBMISSION");
    }
    throw new AnalysisRunRepositoryError("CONFLICT", "CONFIGURATION_NOT_READY");
  }

  const created = await getAnalysisRun(binding, input.competitionId, input.submissionId, input.id);
  if (!created) {
    throw new AnalysisRunRepositoryError("NOT_FOUND", "RESOURCE");
  }
  return created;
}

export async function listAnalysisRuns(
  binding: D1Database,
  competitionId: string,
  submissionId: string,
): Promise<AnalysisRunResponse[]> {
  const submission = await binding
    .prepare("SELECT id FROM submission WHERE id = ? AND competition_id = ? LIMIT 1")
    .bind(submissionId, competitionId)
    .first();
  if (!submission) {
    throw new AnalysisRunRepositoryError("NOT_FOUND", "SUBMISSION");
  }

  const rows = await createDb(binding)
    .select({ run: analysisRuns })
    .from(analysisRuns)
    .innerJoin(submissions, eq(analysisRuns.submissionId, submissions.id))
    .where(
      and(
        eq(analysisRuns.submissionId, submissionId),
        eq(submissions.competitionId, competitionId),
      ),
    )
    .orderBy(desc(analysisRuns.createdAt), desc(analysisRuns.id));

  return rows.map(({ run }) => mapAnalysisRun(run));
}

export async function getAnalysisRun(
  binding: D1Database,
  competitionId: string,
  submissionId: string,
  analysisRunId: string,
): Promise<AnalysisRunResponse | null> {
  const row = await scopedAnalysisRunRow(binding, competitionId, submissionId, analysisRunId);
  return row ? mapAnalysisRun(row) : null;
}

export async function getAnalysisRunExecutionContext(
  binding: D1Database,
  analysisRunId: string,
): Promise<AnalysisRunExecutionContext | null> {
  const [row] = await createDb(binding)
    .select({
      id: analysisRuns.id,
      submissionId: analysisRuns.submissionId,
      status: analysisRuns.status,
      sourceSha256: analysisRuns.sourceSha256,
      sourceStorageKey: submissionFiles.storageKey,
      documentArtifactKey: analysisRuns.documentArtifactKey,
    })
    .from(analysisRuns)
    .innerJoin(submissions, eq(analysisRuns.submissionId, submissions.id))
    .innerJoin(submissionFiles, eq(submissionFiles.submissionId, submissions.id))
    .where(eq(analysisRuns.id, analysisRunId))
    .limit(1);

  return row ?? null;
}

export async function markAnalysisRunProcessing(
  binding: D1Database,
  analysisRunId: string,
): Promise<void> {
  const result = await binding
    .prepare(
      `UPDATE analysis_run
       SET status = 'PROCESSING',
           started_at = coalesce(started_at, ?)
       WHERE id = ?
         AND status in ('QUEUED', 'PROCESSING')`,
    )
    .bind(Date.now(), analysisRunId)
    .run();
  if (result.meta.changes !== 1) {
    const existing = await getAnalysisRunExecutionContext(binding, analysisRunId);
    if (existing?.status !== "SUCCEEDED") {
      throw new AnalysisRunRepositoryError("NOT_FOUND", "RESOURCE");
    }
  }
}

export async function markAnalysisRunSucceeded(
  binding: D1Database,
  analysisRunId: string,
  input: AnalysisRunSuccessInput,
): Promise<void> {
  const result = await createDb(binding)
    .update(analysisRuns)
    .set({
      status: "SUCCEEDED",
      documentArtifactKey: input.documentArtifactKey,
      pageCount: input.pageCount,
      characterCount: input.characterCount,
      extractionWarnings: JSON.stringify(input.warnings),
      errorCode: null,
      errorMessage: null,
      completedAt: new Date(),
    })
    .where(
      and(
        eq(analysisRuns.id, analysisRunId),
        inArray(analysisRuns.status, ["QUEUED", "PROCESSING"]),
      ),
    );

  if (result.meta.changes === 1) return;
  const existing = await getAnalysisRunExecutionContext(binding, analysisRunId);
  if (
    existing?.status === "SUCCEEDED" &&
    existing.documentArtifactKey === input.documentArtifactKey
  ) {
    return;
  }
  throw new AnalysisRunRepositoryError("NOT_FOUND", "RESOURCE");
}

export async function markAnalysisRunFailed(
  binding: D1Database,
  analysisRunId: string,
  errorCode: AnalysisErrorCode,
  errorMessage: string,
): Promise<void> {
  await createDb(binding)
    .update(analysisRuns)
    .set({
      status: "FAILED",
      errorCode,
      errorMessage: errorMessage.slice(0, 500),
      completedAt: new Date(),
    })
    .where(
      and(
        eq(analysisRuns.id, analysisRunId),
        inArray(analysisRuns.status, ["QUEUED", "PROCESSING"]),
      ),
    );
}

export const analysisRunRepository = {
  createQueuedAnalysisRun,
  getAnalysisRun,
  getAnalysisRunExecutionContext,
  listAnalysisRuns,
  markAnalysisRunFailed,
  markAnalysisRunProcessing,
  markAnalysisRunSucceeded,
};

export type AnalysisRunRepository = typeof analysisRunRepository;
