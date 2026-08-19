import type { AnalysisRunRepository } from "@teknofest-ai/db";
import { DocumentExtractionArtifactSchema } from "@teknofest-ai/shared";
import { describe, expect, it, vi } from "vitest";

import type { DocumentStorage } from "../storage/documents";
import { DocumentProcessingError } from "./document-extraction";
import {
  documentArtifactKey,
  encodeSafeFailure,
  processAnalysisRun,
  safeAnalysisFailure,
} from "./process-analysis-run";

const database = {} as D1Database;
const bucket = {} as R2Bucket;
const sourceBytes = new TextEncoder().encode("%PDF-1.4\nsynthetic process fixture\n%%EOF");

async function hash(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy.buffer);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function repositoryStub(
  sourceSha256: string,
  overrides: Partial<AnalysisRunRepository> = {},
): AnalysisRunRepository {
  const run = {
    id: "run-a",
    submissionId: "submission-a",
    categoryId: "category-a",
    status: "PROCESSING" as const,
    stage: "INGEST_AND_EXTRACT" as const,
    templateVersionId: "template-v1",
    rubricVersionId: "rubric-v1",
    sourceSha256,
    createdAt: 1,
    startedAt: 2,
    completedAt: null,
    extraction: { pageCount: null, characterCount: null, warnings: [] },
    checks: [],
    error: null,
  };
  return {
    createQueuedAnalysisRun: async () => ({ ...run, status: "QUEUED", startedAt: null }),
    getAnalysisRun: async () => run,
    getAnalysisRunExecutionContext: async () => ({
      id: "run-a",
      submissionId: "submission-a",
      status: "PROCESSING",
      sourceSha256,
      sourceStorageKey: "private/source.pdf",
      documentArtifactKey: null,
      templateVersionId: "template-v1",
      templateStructuralProfile: {
        expectedLanguage: "tr",
        sections: [
          {
            key: "summary",
            title: "Proje Özeti",
            description: "",
            required: true,
            order: 1,
          },
        ],
      },
    }),
    listAnalysisRuns: async () => [run],
    markAnalysisRunFailed: async () => undefined,
    markAnalysisRunProcessing: async () => undefined,
    markAnalysisRunStructuralChecks: async () => undefined,
    markAnalysisRunSucceeded: async () => undefined,
    ...overrides,
  };
}

function r2Object(bytes: Uint8Array): R2ObjectBody {
  return {
    arrayBuffer: async () => new Uint8Array(bytes).buffer,
  } as R2ObjectBody;
}

function storageStub(overrides: Partial<DocumentStorage> = {}): DocumentStorage {
  return {
    putSubmissionReport: async () => ({ etag: "source-etag" }),
    getSubmissionReport: async () => r2Object(sourceBytes),
    deleteSubmissionReport: async () => undefined,
    headSubmissionReport: async () => null,
    putDocumentArtifact: async () => ({ etag: "artifact-etag" }),
    getDocumentArtifact: async () => null,
    headDocumentArtifact: async () => null,
    ...overrides,
  };
}

describe("analysis run processing", () => {
  it("verifies source hash, validates the artifact, and writes one deterministic private key", async () => {
    const sourceSha256 = await hash(sourceBytes);
    const put = vi.fn<DocumentStorage["putDocumentArtifact"]>(async () => ({
      etag: "artifact-etag",
    }));
    const result = await processAnalysisRun(database, bucket, "run-a", {
      repository: repositoryStub(sourceSha256),
      storage: storageStub({ putDocumentArtifact: put }),
      extractor: async (input) =>
        DocumentExtractionArtifactSchema.parse({
          schemaVersion: "document-extraction/v1",
          submissionId: input.submissionId,
          analysisRunId: input.analysisRunId,
          sourceSha256: input.sourceSha256,
          pageCount: 1,
          characterCount: 14,
          pages: [{ pageNumber: 1, text: "Synthetic text", characterCount: 14 }],
          warnings: ["TEXT_SPARSE"],
        }),
    });

    expect(result.documentArtifactKey).toBe("derived/submission-a/run-a/document.json");
    expect(put).toHaveBeenCalledOnce();
    expect(put.mock.calls[0]?.[1]).toBe(documentArtifactKey("submission-a", "run-a"));
    const stored = DocumentExtractionArtifactSchema.parse(
      JSON.parse(put.mock.calls[0]?.[2] ?? "null"),
    );
    expect(stored.sourceSha256).toBe(sourceSha256);
    expect(stored.pages[0]?.text).toBe("Synthetic text");
  });

  it("fails safely when the private source object is missing or its hash changed", async () => {
    const sourceSha256 = await hash(sourceBytes);
    await expect(
      processAnalysisRun(database, bucket, "run-a", {
        repository: repositoryStub(sourceSha256),
        storage: storageStub({ getSubmissionReport: async () => null }),
        extractor: vi.fn(),
      }),
    ).rejects.toMatchObject({ code: "SOURCE_NOT_FOUND" });

    await expect(
      processAnalysisRun(database, bucket, "run-a", {
        repository: repositoryStub("0".repeat(64)),
        storage: storageStub(),
        extractor: vi.fn(),
      }),
    ).rejects.toMatchObject({ code: "SOURCE_HASH_MISMATCH" });
  });

  it("maps artifact write errors to a controlled code", async () => {
    const sourceSha256 = await hash(sourceBytes);
    await expect(
      processAnalysisRun(database, bucket, "run-a", {
        repository: repositoryStub(sourceSha256),
        storage: storageStub({
          putDocumentArtifact: async () => {
            throw new Error("secret storage implementation detail");
          },
        }),
        extractor: async (input) => ({
          schemaVersion: "document-extraction/v1",
          submissionId: input.submissionId,
          analysisRunId: input.analysisRunId,
          sourceSha256: input.sourceSha256,
          pageCount: 1,
          characterCount: 0,
          pages: [{ pageNumber: 1, text: "", characterCount: 0 }],
          warnings: ["TEXT_SPARSE"],
        }),
      }),
    ).rejects.toMatchObject({ code: "ARTIFACT_WRITE_FAILED" });
  });

  it("overwrites the same artifact location on retry instead of creating a second path", async () => {
    const sourceSha256 = await hash(sourceBytes);
    const keys: string[] = [];
    const dependencies = {
      repository: repositoryStub(sourceSha256),
      storage: storageStub({
        putDocumentArtifact: async (_binding, key) => {
          keys.push(key);
          return { etag: "artifact-etag" };
        },
      }),
      extractor: async (input: {
        submissionId: string;
        analysisRunId: string;
        sourceSha256: string;
      }) => ({
        schemaVersion: "document-extraction/v1" as const,
        submissionId: input.submissionId,
        analysisRunId: input.analysisRunId,
        sourceSha256: input.sourceSha256,
        pageCount: 1,
        characterCount: 0,
        pages: [{ pageNumber: 1, text: "", characterCount: 0 }],
        warnings: ["TEXT_SPARSE" as const],
      }),
    };

    await processAnalysisRun(database, bucket, "run-a", dependencies);
    await processAnalysisRun(database, bucket, "run-a", dependencies);
    expect(keys).toEqual([
      "derived/submission-a/run-a/document.json",
      "derived/submission-a/run-a/document.json",
    ]);
  });

  it("serializes only safe workflow failure details", () => {
    const encoded = encodeSafeFailure(
      new DocumentProcessingError("PDF_PARSE_FAILED", "PDF metni çıkarılamadı."),
    );
    expect(safeAnalysisFailure(encoded)).toEqual({
      code: "PDF_PARSE_FAILED",
      message: "PDF metni çıkarılamadı.",
    });
    expect(encoded.message).not.toContain("stack");
  });
});
