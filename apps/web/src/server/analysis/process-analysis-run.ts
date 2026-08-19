import {
  type AnalysisRunRepository,
  type AnalysisRunSuccessInput,
  analysisRunRepository,
} from "@teknofest-ai/db";
import type { AnalysisErrorCode } from "@teknofest-ai/shared";

import { type DocumentStorage, documentStorage } from "../storage/documents";
import {
  DocumentProcessingError,
  type ExtractDocumentInput,
  extractDocument,
} from "./document-extraction";

export const DERIVED_DOCUMENT_CONTENT_TYPE = "application/json";

export function documentArtifactKey(submissionId: string, analysisRunId: string): string {
  return `derived/${submissionId}/${analysisRunId}/document.json`;
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export interface AnalysisProcessorDependencies {
  repository: AnalysisRunRepository;
  storage: DocumentStorage;
  extractor(input: ExtractDocumentInput): ReturnType<typeof extractDocument>;
}

const defaultDependencies: AnalysisProcessorDependencies = {
  repository: analysisRunRepository,
  storage: documentStorage,
  extractor: extractDocument,
};

export async function processAnalysisRun(
  database: D1Database,
  bucket: R2Bucket,
  analysisRunId: string,
  dependencies: AnalysisProcessorDependencies = defaultDependencies,
): Promise<AnalysisRunSuccessInput> {
  const run = await dependencies.repository.getAnalysisRunExecutionContext(database, analysisRunId);
  if (!run) {
    throw new DocumentProcessingError("ANALYSIS_INTERNAL_ERROR", "Analiz kaydı bulunamadı.");
  }

  let source: R2ObjectBody | null;
  try {
    source = await dependencies.storage.getSubmissionReport(bucket, run.sourceStorageKey);
  } catch {
    source = null;
  }
  if (!source) {
    throw new DocumentProcessingError(
      "SOURCE_NOT_FOUND",
      "Kaynak PDF özel belge deposunda bulunamadı.",
    );
  }

  const sourceBuffer = await source.arrayBuffer();
  if ((await sha256Hex(sourceBuffer)) !== run.sourceSha256) {
    throw new DocumentProcessingError(
      "SOURCE_HASH_MISMATCH",
      "Kaynak PDF içerik kimliği analiz kaydıyla eşleşmiyor.",
    );
  }

  const artifact = await dependencies.extractor({
    bytes: new Uint8Array(sourceBuffer),
    submissionId: run.submissionId,
    analysisRunId: run.id,
    sourceSha256: run.sourceSha256,
  });
  const artifactKey = documentArtifactKey(run.submissionId, run.id);
  try {
    await dependencies.storage.putDocumentArtifact(bucket, artifactKey, JSON.stringify(artifact));
  } catch {
    throw new DocumentProcessingError(
      "ARTIFACT_WRITE_FAILED",
      "Çıkarılan belge özel belge deposuna yazılamadı.",
    );
  }

  return {
    documentArtifactKey: artifactKey,
    pageCount: artifact.pageCount,
    characterCount: artifact.characterCount,
    warnings: artifact.warnings,
  };
}

const SAFE_FAILURE_PREFIX = "ANALYSIS_SAFE_FAILURE:";

export function encodeSafeFailure(error: unknown): Error {
  const failure = safeAnalysisFailure(error);
  return new Error(`${SAFE_FAILURE_PREFIX}${failure.code}:${failure.message}`);
}

export function safeAnalysisFailure(error: unknown): {
  code: AnalysisErrorCode;
  message: string;
} {
  if (error instanceof DocumentProcessingError) {
    return { code: error.code, message: error.safeMessage };
  }
  if (error instanceof Error && error.message.startsWith(SAFE_FAILURE_PREFIX)) {
    const encoded = error.message.slice(SAFE_FAILURE_PREFIX.length);
    const separator = encoded.indexOf(":");
    const code = encoded.slice(0, separator) as AnalysisErrorCode;
    const message = encoded.slice(separator + 1);
    return { code, message };
  }
  return {
    code: "ANALYSIS_INTERNAL_ERROR",
    message: "Belge işleme beklenmeyen bir altyapı hatasıyla tamamlanamadı.",
  };
}
