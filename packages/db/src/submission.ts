import type { SubmissionResponse } from "@teknofest-ai/shared";
import { and, count, desc, eq, ne } from "drizzle-orm";

import { createDb } from "./client";
import { categories, submissionFiles, submissions } from "./schema";

export type SubmissionRepositoryErrorCode = "NOT_FOUND" | "CONFLICT";
export type SubmissionRepositoryErrorReason = "APPLICATION_CODE" | "CATEGORY" | "RESOURCE";

export class SubmissionRepositoryError extends Error {
  readonly code: SubmissionRepositoryErrorCode;
  readonly reason: SubmissionRepositoryErrorReason;

  constructor(code: SubmissionRepositoryErrorCode, reason: SubmissionRepositoryErrorReason) {
    super(`${code}:${reason}`);
    this.name = "SubmissionRepositoryError";
    this.code = code;
    this.reason = reason;
  }
}

export interface SubmissionMetadataInput {
  id: string;
  fileId: string;
  competitionId: string;
  categoryId: string;
  applicationCode: string;
  projectTitle: string;
  storageKey: string;
  originalFilename: string;
  mimeType: "application/pdf";
  sizeBytes: number;
  sha256: string;
  etag?: string | undefined;
}

export interface SubmissionFileStorageMetadata {
  id: string;
  submissionId: string;
  competitionId: string;
  storageKey: string;
  originalFilename: string;
  mimeType: "application/pdf";
  sizeBytes: number;
  sha256: string;
  etag: string | null;
}

interface SubmissionRow {
  id: string;
  competitionId: string;
  applicationCode: string;
  projectTitle: string;
  categoryId: string;
  categoryCode: string;
  categoryName: string;
  fileId: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  fileCreatedAt: Date | number;
  createdAt: Date | number;
  updatedAt: Date | number;
}

function timestamp(value: Date | number): number {
  return value instanceof Date ? value.getTime() : value;
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Error && /unique constraint|unique/i.test(error.message);
}

function mapSubmission(row: SubmissionRow, matchingSubmissionCount: number): SubmissionResponse {
  return {
    id: row.id,
    competitionId: row.competitionId,
    applicationCode: row.applicationCode,
    projectTitle: row.projectTitle,
    category: {
      id: row.categoryId,
      code: row.categoryCode,
      name: row.categoryName,
    },
    file: {
      id: row.fileId,
      originalFilename: row.originalFilename,
      mimeType: "application/pdf",
      sizeBytes: row.sizeBytes,
      sha256: row.sha256,
      createdAt: timestamp(row.fileCreatedAt),
    },
    exactDuplicate: matchingSubmissionCount > 0,
    matchingSubmissionCount,
    createdAt: timestamp(row.createdAt),
    updatedAt: timestamp(row.updatedAt),
  };
}

const submissionSelection = {
  id: submissions.id,
  competitionId: submissions.competitionId,
  applicationCode: submissions.applicationCode,
  projectTitle: submissions.projectTitle,
  categoryId: categories.id,
  categoryCode: categories.code,
  categoryName: categories.name,
  fileId: submissionFiles.id,
  originalFilename: submissionFiles.originalFilename,
  mimeType: submissionFiles.mimeType,
  sizeBytes: submissionFiles.sizeBytes,
  sha256: submissionFiles.sha256,
  fileCreatedAt: submissionFiles.createdAt,
  createdAt: submissions.createdAt,
  updatedAt: submissions.updatedAt,
};

export async function categoryBelongsToCompetition(
  binding: D1Database,
  competitionId: string,
  categoryId: string,
): Promise<boolean> {
  const [row] = await createDb(binding)
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.competitionId, competitionId)))
    .limit(1);

  return Boolean(row);
}

export async function createSubmissionWithFileMetadata(
  binding: D1Database,
  input: SubmissionMetadataInput,
): Promise<void> {
  if (!(await categoryBelongsToCompetition(binding, input.competitionId, input.categoryId))) {
    throw new SubmissionRepositoryError("NOT_FOUND", "CATEGORY");
  }

  const db = createDb(binding);
  const now = new Date();

  try {
    await db.batch([
      db.insert(submissions).values({
        id: input.id,
        competitionId: input.competitionId,
        categoryId: input.categoryId,
        applicationCode: input.applicationCode,
        projectTitle: input.projectTitle,
        createdAt: now,
        updatedAt: now,
      }),
      db.insert(submissionFiles).values({
        id: input.fileId,
        submissionId: input.id,
        storageKey: input.storageKey,
        originalFilename: input.originalFilename,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        sha256: input.sha256,
        etag: input.etag,
        createdAt: now,
      }),
    ]);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new SubmissionRepositoryError("CONFLICT", "APPLICATION_CODE");
    }
    throw error;
  }
}

export async function countCompetitionFilesBySha256(
  binding: D1Database,
  competitionId: string,
  sha256: string,
  excludedSubmissionId?: string,
): Promise<number> {
  const conditions = [
    eq(submissions.competitionId, competitionId),
    eq(submissionFiles.sha256, sha256),
  ];
  if (excludedSubmissionId) {
    conditions.push(ne(submissions.id, excludedSubmissionId));
  }

  const [result] = await createDb(binding)
    .select({ value: count(submissionFiles.id) })
    .from(submissionFiles)
    .innerJoin(submissions, eq(submissionFiles.submissionId, submissions.id))
    .where(and(...conditions));

  return result?.value ?? 0;
}

export async function listCompetitionSubmissions(
  binding: D1Database,
  competitionId: string,
): Promise<SubmissionResponse[]> {
  const rows = await createDb(binding)
    .select(submissionSelection)
    .from(submissions)
    .innerJoin(categories, eq(submissions.categoryId, categories.id))
    .innerJoin(submissionFiles, eq(submissionFiles.submissionId, submissions.id))
    .where(eq(submissions.competitionId, competitionId))
    .orderBy(desc(submissions.createdAt), desc(submissions.id));
  const hashCounts = new Map<string, number>();
  for (const row of rows) {
    hashCounts.set(row.sha256, (hashCounts.get(row.sha256) ?? 0) + 1);
  }

  return rows.map((row) => mapSubmission(row, (hashCounts.get(row.sha256) ?? 1) - 1));
}

export async function getCompetitionSubmission(
  binding: D1Database,
  competitionId: string,
  submissionId: string,
): Promise<SubmissionResponse | null> {
  const [row] = await createDb(binding)
    .select(submissionSelection)
    .from(submissions)
    .innerJoin(categories, eq(submissions.categoryId, categories.id))
    .innerJoin(submissionFiles, eq(submissionFiles.submissionId, submissions.id))
    .where(and(eq(submissions.id, submissionId), eq(submissions.competitionId, competitionId)))
    .limit(1);

  if (!row) return null;
  const matchingSubmissionCount = await countCompetitionFilesBySha256(
    binding,
    competitionId,
    row.sha256,
    submissionId,
  );
  return mapSubmission(row, matchingSubmissionCount);
}

export async function getCompetitionSubmissionFileMetadata(
  binding: D1Database,
  competitionId: string,
  submissionId: string,
): Promise<SubmissionFileStorageMetadata | null> {
  const [row] = await createDb(binding)
    .select({
      id: submissionFiles.id,
      submissionId: submissions.id,
      competitionId: submissions.competitionId,
      storageKey: submissionFiles.storageKey,
      originalFilename: submissionFiles.originalFilename,
      mimeType: submissionFiles.mimeType,
      sizeBytes: submissionFiles.sizeBytes,
      sha256: submissionFiles.sha256,
      etag: submissionFiles.etag,
    })
    .from(submissions)
    .innerJoin(submissionFiles, eq(submissionFiles.submissionId, submissions.id))
    .where(and(eq(submissions.id, submissionId), eq(submissions.competitionId, competitionId)))
    .limit(1);

  return row ? { ...row, mimeType: "application/pdf" } : null;
}

export const submissionRepository = {
  categoryBelongsToCompetition,
  countCompetitionFilesBySha256,
  createSubmissionWithFileMetadata,
  getCompetitionSubmission,
  getCompetitionSubmissionFileMetadata,
  listCompetitionSubmissions,
};

export type SubmissionRepository = typeof submissionRepository;
