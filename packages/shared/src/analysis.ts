import { z } from "zod";

export const ANALYSIS_RUN_STATUS_VALUES = ["QUEUED", "PROCESSING", "SUCCEEDED", "FAILED"] as const;

export const ANALYSIS_STAGE_VALUES = ["INGEST_AND_EXTRACT"] as const;

export const DOCUMENT_EXTRACTION_WARNING_VALUES = ["TEXT_SPARSE"] as const;

export const ANALYSIS_ERROR_CODE_VALUES = [
  "WORKFLOW_START_FAILED",
  "SOURCE_NOT_FOUND",
  "SOURCE_HASH_MISMATCH",
  "PDF_PARSE_FAILED",
  "PDF_ENCRYPTED",
  "PDF_UNSUPPORTED",
  "DOCUMENT_TOO_COMPLEX",
  "ARTIFACT_WRITE_FAILED",
  "ANALYSIS_INTERNAL_ERROR",
] as const;

// Operational Worker guards, not competition rules. Together with the existing
// 20 MiB upload cap these keep PDF.js output and JSON serialization bounded.
export const MAX_DOCUMENT_PAGES = 200;
export const MAX_DOCUMENT_CHARACTERS = 1_000_000;
export const MIN_USABLE_DOCUMENT_CHARACTERS = 100;

export const AnalysisRunStatusSchema = z.enum(ANALYSIS_RUN_STATUS_VALUES);
export type AnalysisRunStatus = z.infer<typeof AnalysisRunStatusSchema>;

export const AnalysisStageSchema = z.enum(ANALYSIS_STAGE_VALUES);
export type AnalysisStage = z.infer<typeof AnalysisStageSchema>;

export const AnalysisErrorCodeSchema = z.enum(ANALYSIS_ERROR_CODE_VALUES);
export type AnalysisErrorCode = z.infer<typeof AnalysisErrorCodeSchema>;

export const DocumentExtractionWarningSchema = z.enum(DOCUMENT_EXTRACTION_WARNING_VALUES);
export type DocumentExtractionWarning = z.infer<typeof DocumentExtractionWarningSchema>;

export const DocumentExtractionPageSchema = z
  .object({
    pageNumber: z.number().int().positive().max(MAX_DOCUMENT_PAGES),
    text: z.string().max(MAX_DOCUMENT_CHARACTERS),
    characterCount: z.number().int().nonnegative().max(MAX_DOCUMENT_CHARACTERS),
  })
  .strict()
  .refine((page) => page.text.length === page.characterCount, {
    message: "Sayfa karakter sayısı metin uzunluğuyla eşleşmelidir.",
    path: ["characterCount"],
  });

export type DocumentExtractionPage = z.infer<typeof DocumentExtractionPageSchema>;

export const DocumentExtractionArtifactSchema = z
  .object({
    schemaVersion: z.literal("document-extraction/v1"),
    submissionId: z.string().min(1),
    analysisRunId: z.string().min(1),
    sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
    pageCount: z.number().int().positive().max(MAX_DOCUMENT_PAGES),
    characterCount: z.number().int().nonnegative().max(MAX_DOCUMENT_CHARACTERS),
    pages: z.array(DocumentExtractionPageSchema).min(1).max(MAX_DOCUMENT_PAGES),
    warnings: z.array(DocumentExtractionWarningSchema),
  })
  .strict()
  .superRefine((artifact, context) => {
    if (artifact.pages.length !== artifact.pageCount) {
      context.addIssue({
        code: "custom",
        message: "Sayfa sayısı sayfa listesiyle eşleşmelidir.",
        path: ["pageCount"],
      });
    }

    const totalCharacters = artifact.pages.reduce((total, page) => total + page.characterCount, 0);
    if (totalCharacters !== artifact.characterCount) {
      context.addIssue({
        code: "custom",
        message: "Belge karakter sayısı sayfa toplamıyla eşleşmelidir.",
        path: ["characterCount"],
      });
    }

    for (const [index, page] of artifact.pages.entries()) {
      if (page.pageNumber !== index + 1) {
        context.addIssue({
          code: "custom",
          message: "Sayfa numaraları 1 tabanlı ve sıralı olmalıdır.",
          path: ["pages", index, "pageNumber"],
        });
      }
    }
  });

export type DocumentExtractionArtifact = z.infer<typeof DocumentExtractionArtifactSchema>;

export const AnalysisRunExtractionSchema = z
  .object({
    pageCount: z.number().int().positive().max(MAX_DOCUMENT_PAGES).nullable(),
    characterCount: z.number().int().nonnegative().max(MAX_DOCUMENT_CHARACTERS).nullable(),
    warnings: z.array(DocumentExtractionWarningSchema),
  })
  .strict();

export const AnalysisRunErrorSchema = z
  .object({
    code: AnalysisErrorCodeSchema,
    message: z.string().min(1).max(500),
  })
  .strict();

export const AnalysisRunResponseSchema = z
  .object({
    id: z.string().min(1),
    submissionId: z.string().min(1),
    categoryId: z.string().min(1),
    status: AnalysisRunStatusSchema,
    stage: AnalysisStageSchema,
    templateVersionId: z.string().min(1),
    rubricVersionId: z.string().min(1),
    sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
    createdAt: z.number().int().nonnegative(),
    startedAt: z.number().int().nonnegative().nullable(),
    completedAt: z.number().int().nonnegative().nullable(),
    extraction: AnalysisRunExtractionSchema,
    error: AnalysisRunErrorSchema.nullable(),
  })
  .strict();

export type AnalysisRunResponse = z.infer<typeof AnalysisRunResponseSchema>;

export const AnalysisRunListResponseSchema = z
  .object({ runHistory: z.array(AnalysisRunResponseSchema) })
  .strict();

export type AnalysisRunListResponse = z.infer<typeof AnalysisRunListResponseSchema>;
