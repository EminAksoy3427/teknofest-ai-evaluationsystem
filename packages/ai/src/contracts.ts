import {
  type CategorySnapshot,
  MAX_RUBRIC_CRITERIA,
  MAX_RUBRIC_MISSING_POINT_CHARACTERS,
  MAX_RUBRIC_MISSING_POINTS,
  MAX_RUBRIC_REASON_CHARACTERS,
  MAX_SEMANTIC_EVIDENCE_EXCERPT_CHARACTERS,
  MAX_SEMANTIC_EVIDENCE_ITEMS,
  MAX_SEMANTIC_REASON_CHARACTERS,
  MAX_SEMANTIC_SIGNAL_ITEMS,
  type SemanticSourceCoverage,
  StableKeySchema,
} from "@teknofest-ai/shared";
import { z } from "zod";

export const ClaimedEvidenceSchema = z
  .object({
    page: z.number().int().positive(),
    excerpt: z.string().min(1).max(MAX_SEMANTIC_EVIDENCE_EXCERPT_CHARACTERS),
  })
  .strict();
export type ClaimedEvidence = z.infer<typeof ClaimedEvidenceSchema>;

const evidenceStrength = z.enum(["HIGH", "MEDIUM", "LOW"]);

export const AISectionContentResultSchema = z
  .object({
    sectionKey: StableKeySchema,
    assessment: z.enum(["SUPPORTED", "PARTIAL", "NOT_SUPPORTED"]),
    reason: z.string().min(1).max(MAX_SEMANTIC_REASON_CHARACTERS),
    evidenceStrength,
    evidence: z.array(ClaimedEvidenceSchema).max(MAX_SEMANTIC_EVIDENCE_ITEMS),
    missingExpectations: z.array(z.string().min(1).max(300)).max(MAX_SEMANTIC_SIGNAL_ITEMS),
  })
  .strict();

export const AISectionContentOutputSchema = z
  .object({ sections: z.array(AISectionContentResultSchema).max(100) })
  .strict();
export type AISectionContentOutput = z.infer<typeof AISectionContentOutputSchema>;

export const AICategoryFitOutputSchema = z
  .object({
    assessment: z.enum(["ALIGNED", "REVIEW", "MISALIGNED"]),
    reason: z.string().min(1).max(MAX_SEMANTIC_REASON_CHARACTERS),
    evidenceStrength,
    evidence: z.array(ClaimedEvidenceSchema).max(MAX_SEMANTIC_EVIDENCE_ITEMS),
    alignmentSignals: z.array(z.string().min(1).max(300)).max(MAX_SEMANTIC_SIGNAL_ITEMS),
    mismatchSignals: z.array(z.string().min(1).max(300)).max(MAX_SEMANTIC_SIGNAL_ITEMS),
  })
  .strict();
export type AICategoryFitOutput = z.infer<typeof AICategoryFitOutputSchema>;

export interface AISectionInput {
  sectionKey: string;
  title: string;
  description: string;
  required: boolean;
  sourceCoverage: Exclude<SemanticSourceCoverage, "MISSING_SECTION">;
  pages: Array<{ page: number; text: string }>;
}

export interface SectionContentAnalysisInput {
  sections: AISectionInput[];
}

export interface CategoryFitAnalysisInput {
  category: CategorySnapshot;
  projectTitle: string;
  sourceCoverage: "FULL" | "SAMPLED";
  pages: Array<{ page: number; text: string }>;
}

// The model DOES receive each pinned criterion's `maxScore` as authoritative input context (see
// `RubricCriterionInput`), because otherwise it could not know whether a criterion is scored out of
// 5, 10 or 20 and its `suggestedScore` would be meaningless. What it cannot do is redefine that
// scale: `maxScore` is deliberately absent from this output schema and the schema is `.strict()`,
// so an echoed or altered `maxScore` is rejected rather than trusted. The authoritative value stays
// server-side, where `suggestedScore` is validated against it (out of range = invalid provider
// output, rejected, never clamped).
export const AIRubricCriterionResultSchema = z
  .object({
    criterionCode: StableKeySchema,
    suggestedScore: z.number().int(),
    reason: z.string().min(1).max(MAX_RUBRIC_REASON_CHARACTERS),
    evidenceStrength,
    evidence: z.array(ClaimedEvidenceSchema).max(MAX_SEMANTIC_EVIDENCE_ITEMS),
    missingPoints: z
      .array(z.string().min(1).max(MAX_RUBRIC_MISSING_POINT_CHARACTERS))
      .max(MAX_RUBRIC_MISSING_POINTS),
  })
  .strict();
export type AIRubricCriterionResult = z.infer<typeof AIRubricCriterionResultSchema>;

export const AIRubricEvaluationOutputSchema = z
  .object({ criteria: z.array(AIRubricCriterionResultSchema).max(MAX_RUBRIC_CRITERIA) })
  .strict();
export type AIRubricEvaluationOutput = z.infer<typeof AIRubricEvaluationOutputSchema>;

export interface RubricCriterionInput {
  code: string;
  title: string;
  description: string;
  evidenceExpectation: string;
  maxScore: number;
}

export interface RubricEvaluationAnalysisInput {
  criteria: RubricCriterionInput[];
  sourceCoverage: "FULL" | "SAMPLED";
  pages: Array<{ page: number; text: string }>;
}

export interface AIProvider {
  analyzeSectionContent(input: SectionContentAnalysisInput): Promise<AISectionContentOutput>;
  analyzeCategoryFit(input: CategoryFitAnalysisInput): Promise<AICategoryFitOutput>;
  evaluateRubric(input: RubricEvaluationAnalysisInput): Promise<AIRubricEvaluationOutput>;
}

export const AI_PROVIDER_ERROR_CODES = [
  "NETWORK_ERROR",
  "RATE_LIMITED",
  "TIMEOUT",
  "REFUSAL",
  "INCOMPLETE_RESPONSE",
  "STRUCTURED_OUTPUT_PARSE_FAILED",
  "OUTPUT_VALIDATION_FAILED",
] as const;
export type AIProviderErrorCode = (typeof AI_PROVIDER_ERROR_CODES)[number];

export class AIProviderError extends Error {
  readonly code: AIProviderErrorCode;
  readonly retryable: boolean;

  constructor(code: AIProviderErrorCode, safeMessage: string, retryable = false) {
    super(safeMessage);
    this.name = "AIProviderError";
    this.code = code;
    this.retryable = retryable;
  }
}
