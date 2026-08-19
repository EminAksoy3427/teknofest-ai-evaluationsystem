import { z } from "zod";

import { ExpectedLanguageSchema, StableKeySchema } from "./competition-configuration";

export const ANALYSIS_RUN_STATUS_VALUES = ["QUEUED", "PROCESSING", "SUCCEEDED", "FAILED"] as const;

export const ANALYSIS_STAGE_VALUES = [
  "INGEST_AND_EXTRACT",
  "STRUCTURAL_CHECKS",
  "SEMANTIC_CHECKS",
] as const;

export const ANALYSIS_CHECK_TYPE_VALUES = [
  "LANGUAGE",
  "TEMPLATE_STRUCTURE",
  "SECTION_PRESENCE",
  "SECTION_CONTENT",
  "CATEGORY_FIT",
] as const;

export const ANALYSIS_CHECK_STATUS_VALUES = ["PASS", "WARN", "FAIL"] as const;

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
  "ARTIFACT_NOT_FOUND",
  "ARTIFACT_INVALID",
  "PINNED_TEMPLATE_NOT_FOUND",
  "LANGUAGE_DETECTION_FAILED",
  "CHECK_PERSISTENCE_FAILED",
  "AI_CONFIGURATION_INVALID",
  "AI_NETWORK_ERROR",
  "AI_RATE_LIMITED",
  "AI_TIMEOUT",
  "AI_REFUSAL",
  "AI_INCOMPLETE_RESPONSE",
  "AI_STRUCTURED_OUTPUT_INVALID",
  "AI_EVIDENCE_INVALID",
  "ANALYSIS_INTERNAL_ERROR",
] as const;

// Operational Worker guards, not competition rules. Together with the existing
// 20 MiB upload cap these keep PDF.js output and JSON serialization bounded.
export const MAX_DOCUMENT_PAGES = 200;
export const MAX_DOCUMENT_CHARACTERS = 1_000_000;
export const MIN_USABLE_DOCUMENT_CHARACTERS = 100;
export const MAX_LANGUAGE_SAMPLE_PAGES = 20;
export const MAX_LANGUAGE_SAMPLE_CHARACTERS_PER_PAGE = 2_048;
export const MAX_MATCHED_HEADING_TEXT_CHARACTERS = 160;
export const MAX_HEADING_OCCURRENCES_PER_SECTION = 5;
export const MAX_SEMANTIC_SECTION_PAGES = 6;
export const MAX_SEMANTIC_SECTION_CHARACTERS = 12_000;
export const MAX_CATEGORY_SAMPLE_PAGES = 12;
export const MAX_CATEGORY_SAMPLE_CHARACTERS = 24_000;
export const MAX_SEMANTIC_EVIDENCE_ITEMS = 5;
export const MAX_SEMANTIC_EVIDENCE_EXCERPT_CHARACTERS = 400;
export const MAX_SEMANTIC_REASON_CHARACTERS = 1_000;
export const MAX_SEMANTIC_SIGNAL_ITEMS = 12;

export const CategorySnapshotSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1).max(120),
    code: StableKeySchema,
    description: z.string().min(1).max(2_000),
    guidance: z.string().max(2_000),
  })
  .strict();
export type CategorySnapshot = z.infer<typeof CategorySnapshotSchema>;

export const SemanticEvidenceSchema = z
  .object({
    page: z.number().int().positive().max(MAX_DOCUMENT_PAGES),
    excerpt: z.string().min(1).max(MAX_SEMANTIC_EVIDENCE_EXCERPT_CHARACTERS),
    verified: z.literal(true),
  })
  .strict();
export type SemanticEvidence = z.infer<typeof SemanticEvidenceSchema>;

export const SemanticEvidenceStrengthSchema = z.enum(["HIGH", "MEDIUM", "LOW"]);
export type SemanticEvidenceStrength = z.infer<typeof SemanticEvidenceStrengthSchema>;

export const SemanticSourceCoverageSchema = z.enum(["FULL", "SAMPLED", "MISSING_SECTION"]);
export type SemanticSourceCoverage = z.infer<typeof SemanticSourceCoverageSchema>;

export const AnalysisRunStatusSchema = z.enum(ANALYSIS_RUN_STATUS_VALUES);
export type AnalysisRunStatus = z.infer<typeof AnalysisRunStatusSchema>;

export const AnalysisStageSchema = z.enum(ANALYSIS_STAGE_VALUES);
export type AnalysisStage = z.infer<typeof AnalysisStageSchema>;

export const AnalysisErrorCodeSchema = z.enum(ANALYSIS_ERROR_CODE_VALUES);
export type AnalysisErrorCode = z.infer<typeof AnalysisErrorCodeSchema>;

export const AnalysisCheckTypeSchema = z.enum(ANALYSIS_CHECK_TYPE_VALUES);
export type AnalysisCheckType = z.infer<typeof AnalysisCheckTypeSchema>;

export const AnalysisCheckStatusSchema = z.enum(ANALYSIS_CHECK_STATUS_VALUES);
export type AnalysisCheckStatus = z.infer<typeof AnalysisCheckStatusSchema>;

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

export const LanguageCheckDetailsSchema = z
  .object({
    checkType: z.literal("LANGUAGE"),
    expectedLanguage: ExpectedLanguageSchema,
    detectedLanguage: z.string().min(2).max(35).nullable(),
    sampledCharacterCount: z.number().int().nonnegative(),
    sampledPageCount: z.number().int().nonnegative().max(MAX_LANGUAGE_SAMPLE_PAGES),
    mixedLanguageSignal: z.boolean(),
    undeterminedPageCount: z.number().int().nonnegative().max(MAX_LANGUAGE_SAMPLE_PAGES),
    reason: z.enum([
      "MATCH",
      "MISMATCH",
      "TEXT_SPARSE",
      "UNDETERMINED",
      "MIXED_LANGUAGE",
      "UNSUPPORTED_EXPECTED_LANGUAGE",
    ]),
  })
  .strict();
export type LanguageCheckDetails = z.infer<typeof LanguageCheckDetailsSchema>;

export const HeadingOccurrenceSchema = z
  .object({
    pageNumber: z.number().int().positive().max(MAX_DOCUMENT_PAGES),
    documentOrder: z.number().int().nonnegative(),
    matchedText: z.string().min(1).max(MAX_MATCHED_HEADING_TEXT_CHARACTERS),
  })
  .strict();
export type HeadingOccurrence = z.infer<typeof HeadingOccurrenceSchema>;

export const SectionPresenceResultSchema = z
  .object({
    sectionKey: StableKeySchema,
    expectedTitle: z.string().min(1).max(160),
    required: z.boolean(),
    expectedOrder: z.number().int().positive().max(1_000),
    found: z.boolean(),
    pageNumber: z.number().int().positive().max(MAX_DOCUMENT_PAGES).nullable(),
    matchedText: z.string().min(1).max(MAX_MATCHED_HEADING_TEXT_CHARACTERS).nullable(),
    occurrences: z.array(HeadingOccurrenceSchema).max(MAX_HEADING_OCCURRENCES_PER_SECTION),
  })
  .strict()
  .superRefine((section, context) => {
    const hasOccurrences = section.occurrences.length > 0;
    if (section.found !== hasOccurrences) {
      context.addIssue({ code: "custom", message: "Bulunma durumu kanıtla eşleşmelidir." });
    }
    const first = section.occurrences[0];
    if (
      (first?.pageNumber ?? null) !== section.pageNumber ||
      (first?.matchedText ?? null) !== section.matchedText
    ) {
      context.addIssue({ code: "custom", message: "İlk başlık kanıtı özetle eşleşmelidir." });
    }
  });
export type SectionPresenceResult = z.infer<typeof SectionPresenceResultSchema>;

export const SectionPresenceCheckDetailsSchema = z
  .object({
    checkType: z.literal("SECTION_PRESENCE"),
    sections: z.array(SectionPresenceResultSchema).max(100),
    missingRequiredSectionKeys: z.array(StableKeySchema).max(100),
  })
  .strict();
export type SectionPresenceCheckDetails = z.infer<typeof SectionPresenceCheckDetailsSchema>;

export const TemplateStructureCheckDetailsSchema = z
  .object({
    checkType: z.literal("TEMPLATE_STRUCTURE"),
    missingRequiredSectionKeys: z.array(StableKeySchema).max(100),
    orderDeviation: z.boolean(),
    duplicateHeadingKeys: z.array(StableKeySchema).max(100),
    extractionWarnings: z.array(DocumentExtractionWarningSchema),
  })
  .strict();
export type TemplateStructureCheckDetails = z.infer<typeof TemplateStructureCheckDetailsSchema>;

export const SectionContentAssessmentSchema = z.enum([
  "SUPPORTED",
  "PARTIAL",
  "NOT_SUPPORTED",
  "NOT_EVALUATED",
]);
export type SectionContentAssessment = z.infer<typeof SectionContentAssessmentSchema>;

export const SectionContentResultSchema = z
  .object({
    sectionKey: StableKeySchema,
    title: z.string().min(1).max(160),
    required: z.boolean(),
    assessment: SectionContentAssessmentSchema,
    reason: z.string().min(1).max(MAX_SEMANTIC_REASON_CHARACTERS),
    evidenceStrength: SemanticEvidenceStrengthSchema,
    evidence: z.array(SemanticEvidenceSchema).max(MAX_SEMANTIC_EVIDENCE_ITEMS),
    missingExpectations: z.array(z.string().min(1).max(300)).max(MAX_SEMANTIC_SIGNAL_ITEMS),
    sourceCoverage: SemanticSourceCoverageSchema,
    startPage: z.number().int().positive().max(MAX_DOCUMENT_PAGES).nullable(),
    endPage: z.number().int().positive().max(MAX_DOCUMENT_PAGES).nullable(),
  })
  .strict();
export type SectionContentResult = z.infer<typeof SectionContentResultSchema>;

export const SectionContentCheckDetailsSchema = z
  .object({
    checkType: z.literal("SECTION_CONTENT"),
    sections: z.array(SectionContentResultSchema).max(100),
  })
  .strict();
export type SectionContentCheckDetails = z.infer<typeof SectionContentCheckDetailsSchema>;

export const CategoryFitAssessmentSchema = z.enum(["ALIGNED", "REVIEW", "MISALIGNED"]);
export type CategoryFitAssessment = z.infer<typeof CategoryFitAssessmentSchema>;

export const CategoryFitCheckDetailsSchema = z
  .object({
    checkType: z.literal("CATEGORY_FIT"),
    assessment: CategoryFitAssessmentSchema,
    reason: z.string().min(1).max(MAX_SEMANTIC_REASON_CHARACTERS),
    evidenceStrength: SemanticEvidenceStrengthSchema,
    evidence: z.array(SemanticEvidenceSchema).max(MAX_SEMANTIC_EVIDENCE_ITEMS),
    alignmentSignals: z.array(z.string().min(1).max(300)).max(MAX_SEMANTIC_SIGNAL_ITEMS),
    mismatchSignals: z.array(z.string().min(1).max(300)).max(MAX_SEMANTIC_SIGNAL_ITEMS),
    sourceCoverage: z.enum(["FULL", "SAMPLED"]),
  })
  .strict();
export type CategoryFitCheckDetails = z.infer<typeof CategoryFitCheckDetailsSchema>;

export const AnalysisCheckDetailsSchema = z.discriminatedUnion("checkType", [
  LanguageCheckDetailsSchema,
  TemplateStructureCheckDetailsSchema,
  SectionPresenceCheckDetailsSchema,
  SectionContentCheckDetailsSchema,
  CategoryFitCheckDetailsSchema,
]);
export type AnalysisCheckDetails = z.infer<typeof AnalysisCheckDetailsSchema>;

export const AnalysisCheckResponseSchema = z.discriminatedUnion("type", [
  z
    .object({
      id: z.string().min(1),
      analysisRunId: z.string().min(1),
      type: z.literal("LANGUAGE"),
      status: AnalysisCheckStatusSchema,
      summary: z.string().min(1).max(500),
      details: LanguageCheckDetailsSchema,
      createdAt: z.number().int().nonnegative(),
      updatedAt: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      id: z.string().min(1),
      analysisRunId: z.string().min(1),
      type: z.literal("TEMPLATE_STRUCTURE"),
      status: AnalysisCheckStatusSchema,
      summary: z.string().min(1).max(500),
      details: TemplateStructureCheckDetailsSchema,
      createdAt: z.number().int().nonnegative(),
      updatedAt: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      id: z.string().min(1),
      analysisRunId: z.string().min(1),
      type: z.literal("SECTION_PRESENCE"),
      status: AnalysisCheckStatusSchema,
      summary: z.string().min(1).max(500),
      details: SectionPresenceCheckDetailsSchema,
      createdAt: z.number().int().nonnegative(),
      updatedAt: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      id: z.string().min(1),
      analysisRunId: z.string().min(1),
      type: z.literal("SECTION_CONTENT"),
      status: AnalysisCheckStatusSchema,
      summary: z.string().min(1).max(500),
      details: SectionContentCheckDetailsSchema,
      createdAt: z.number().int().nonnegative(),
      updatedAt: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      id: z.string().min(1),
      analysisRunId: z.string().min(1),
      type: z.literal("CATEGORY_FIT"),
      status: AnalysisCheckStatusSchema,
      summary: z.string().min(1).max(500),
      details: CategoryFitCheckDetailsSchema,
      createdAt: z.number().int().nonnegative(),
      updatedAt: z.number().int().nonnegative(),
    })
    .strict(),
]);
export type AnalysisCheckResponse = z.infer<typeof AnalysisCheckResponseSchema>;

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
    ai: z
      .object({
        provider: z.string().min(1).max(40),
        modelId: z.string().min(1).max(200),
        promptBundleVersion: z.string().min(1).max(100),
      })
      .strict()
      .nullable(),
    categorySnapshot: CategorySnapshotSchema.nullable(),
    createdAt: z.number().int().nonnegative(),
    startedAt: z.number().int().nonnegative().nullable(),
    completedAt: z.number().int().nonnegative().nullable(),
    extraction: AnalysisRunExtractionSchema,
    checks: z.array(AnalysisCheckResponseSchema).max(ANALYSIS_CHECK_TYPE_VALUES.length),
    error: AnalysisRunErrorSchema.nullable(),
  })
  .strict();

export type AnalysisRunResponse = z.infer<typeof AnalysisRunResponseSchema>;

export const AnalysisRunListResponseSchema = z
  .object({ runHistory: z.array(AnalysisRunResponseSchema) })
  .strict();

export type AnalysisRunListResponse = z.infer<typeof AnalysisRunListResponseSchema>;
