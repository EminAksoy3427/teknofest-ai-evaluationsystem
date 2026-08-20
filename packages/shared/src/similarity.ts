import { z } from "zod";

export const SIMILARITY_MODE_VALUES = ["LEXICAL_ONLY", "HYBRID"] as const;
// Records whether semantic analysis actually ran, so a degraded lexical result is never presented
// as a successful hybrid one. `DISABLED` means no vector provider was configured at all.
export const SIMILARITY_SEMANTIC_STATUS_VALUES = ["DISABLED", "AVAILABLE", "DEGRADED"] as const;
export const SIMILARITY_LEVEL_VALUES = ["LOW", "MEDIUM", "HIGH"] as const;

// Development policy only; calibration on a synthetic/golden corpus is still required.
export const SIMILARITY_MEDIUM_THRESHOLD = 0.35;
export const SIMILARITY_HIGH_THRESHOLD = 0.7;
export const SIMILARITY_TOKEN_SHINGLE_SIZE = 5;
export const MAX_SIMILARITY_CANDIDATES = 20;
export const MAX_SIMILARITY_TOP_MATCHES = 5;
export const MAX_SIMILARITY_SECTION_MATCHES = 3;
export const MAX_SIMILARITY_EXCERPT_CHARACTERS = 280;
export const MAX_SIMILARITY_SECTION_CHARACTERS = 12_000;
export const MIN_SIMILARITY_SECTION_TOKENS = 8;

export const SimilarityModeSchema = z.enum(SIMILARITY_MODE_VALUES);
export type SimilarityMode = z.infer<typeof SimilarityModeSchema>;
export const SimilaritySemanticStatusSchema = z.enum(SIMILARITY_SEMANTIC_STATUS_VALUES);
export type SimilaritySemanticStatus = z.infer<typeof SimilaritySemanticStatusSchema>;
export const SimilarityLevelSchema = z.enum(SIMILARITY_LEVEL_VALUES);
export type SimilarityLevel = z.infer<typeof SimilarityLevelSchema>;
export const SimilarityScoreSchema = z.number().min(0).max(1);

export const SimilaritySectionMetadataSchema = z
  .object({
    competitionId: z.string().min(1),
    submissionId: z.string().min(1),
    analysisRunId: z.string().min(1),
    sectionKey: z.string().min(1).max(120),
    sectionTitle: z.string().min(1).max(160),
    pageStart: z.number().int().positive(),
    pageEnd: z.number().int().positive(),
  })
  .strict()
  .refine((value) => value.pageEnd >= value.pageStart, {
    message: "Bölüm bitiş sayfası başlangıç sayfasından önce olamaz.",
  });
export type SimilaritySectionMetadata = z.infer<typeof SimilaritySectionMetadataSchema>;

export const SimilaritySectionCandidateSchema = z
  .object({
    metadata: SimilaritySectionMetadataSchema,
    text: z.string().min(1).max(MAX_SIMILARITY_SECTION_CHARACTERS),
  })
  .strict();
export type SimilaritySectionCandidate = z.infer<typeof SimilaritySectionCandidateSchema>;

export const SimilaritySectionMatchSchema = z
  .object({
    sourceSubmissionId: z.string().min(1),
    otherSubmissionId: z.string().min(1),
    sectionKey: z.string().min(1).max(120),
    sectionTitle: z.string().min(1).max(160),
    otherSectionKey: z.string().min(1).max(120),
    otherSectionTitle: z.string().min(1).max(160),
    sourcePage: z.number().int().positive(),
    otherPage: z.number().int().positive(),
    lexicalScore: SimilarityScoreSchema,
    // Semantic contribution for this specific section pair; null when semantic analysis did not
    // produce a score for it. Present so evidence can explain both halves of the hybrid signal.
    semanticScore: SimilarityScoreSchema.nullable().default(null),
    sourceExcerpt: z.string().min(1).max(MAX_SIMILARITY_EXCERPT_CHARACTERS),
    otherExcerpt: z.string().min(1).max(MAX_SIMILARITY_EXCERPT_CHARACTERS),
  })
  .strict();
export type SimilaritySectionMatch = z.infer<typeof SimilaritySectionMatchSchema>;

export const SimilarityTopMatchSchema = z
  .object({
    otherSubmissionId: z.string().min(1),
    otherAnalysisRunId: z.string().min(1),
    applicationCode: z.string().min(1).max(80),
    projectTitle: z.string().min(1).max(240),
    exactDocumentMatch: z.boolean(),
    combinedScore: SimilarityScoreSchema,
    lexicalScore: SimilarityScoreSchema,
    semanticScore: SimilarityScoreSchema.nullable(),
    sectionMatches: z.array(SimilaritySectionMatchSchema).max(MAX_SIMILARITY_SECTION_MATCHES),
  })
  .strict();
export type SimilarityTopMatch = z.infer<typeof SimilarityTopMatchSchema>;

export const SimilarityCheckDetailsSchema = z
  .object({
    checkType: z.literal("SIMILARITY"),
    mode: SimilarityModeSchema,
    // Defaulted so SIMILARITY details written before P4-01B still parse.
    semanticStatus: SimilaritySemanticStatusSchema.default("DISABLED"),
    level: SimilarityLevelSchema,
    candidateCount: z.number().int().nonnegative().max(MAX_SIMILARITY_CANDIDATES),
    topMatches: z.array(SimilarityTopMatchSchema).max(MAX_SIMILARITY_TOP_MATCHES),
  })
  .strict();
export type SimilarityCheckDetails = z.infer<typeof SimilarityCheckDetailsSchema>;

export const SimilarityPairResponseSchema = z
  .object({
    id: z.string().min(1),
    competitionId: z.string().min(1),
    submissionAId: z.string().min(1),
    submissionBId: z.string().min(1),
    analysisRunAId: z.string().min(1),
    analysisRunBId: z.string().min(1),
    lexicalScore: SimilarityScoreSchema,
    semanticScore: SimilarityScoreSchema.nullable(),
    combinedScore: SimilarityScoreSchema,
    mode: SimilarityModeSchema,
    level: SimilarityLevelSchema,
    exactDocumentMatch: z.boolean(),
    evidence: z.array(SimilaritySectionMatchSchema).max(MAX_SIMILARITY_SECTION_MATCHES),
    otherSubmission: z
      .object({
        id: z.string().min(1),
        applicationCode: z.string().min(1).max(80),
        projectTitle: z.string().min(1).max(240),
      })
      .strict(),
    createdAt: z.number().int().nonnegative(),
    updatedAt: z.number().int().nonnegative(),
  })
  .strict();
export type SimilarityPairResponse = z.infer<typeof SimilarityPairResponseSchema>;

// `analysisRunId` names the AnalysisRun the returned observations are pinned to, so the reviewer
// view never implies that a historical run carries the newest measurements.
export const SubmissionSimilarityResponseSchema = z
  .object({
    submissionId: z.string().min(1),
    analysisRunId: z.string().min(1).nullable(),
    pairs: z.array(SimilarityPairResponseSchema).max(MAX_SIMILARITY_TOP_MATCHES),
  })
  .strict();
export type SubmissionSimilarityResponse = z.infer<typeof SubmissionSimilarityResponseSchema>;
