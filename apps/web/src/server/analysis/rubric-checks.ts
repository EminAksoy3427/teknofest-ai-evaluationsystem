import { type AIProvider, AIProviderError } from "@teknofest-ai/ai";
import {
  type AnalysisCheckRepository,
  type AnalysisCheckWriteInput,
  type AnalysisRunExecutionContext,
  type AnalysisRunRepository,
  analysisCheckRepository,
  analysisRunRepository,
  listCriteriaForRubric,
  type RubricSuggestionRepository,
  type RubricSuggestionWriteInput,
  rubricSuggestionRepository,
} from "@teknofest-ai/db";
import {
  AnalysisCheckDetailsSchema,
  type DocumentExtractionArtifact,
  DocumentExtractionArtifactSchema,
  type RubricCriterionSuggestion,
  type SemanticEvidenceStrength,
} from "@teknofest-ai/shared";

import { type DocumentStorage, documentStorage } from "../storage/documents";
import { DocumentProcessingError } from "./document-extraction";
import { verifyClaimedEvidence } from "./evidence-verification";
import { rubricProviderInput } from "./section-segmentation";

interface PinnedCriterion {
  id: string;
  code: string;
  title: string;
  description: string;
  evidenceExpectation: string;
  maxScore: number;
  order: number;
}

interface RubricContext {
  run: AnalysisRunExecutionContext;
  artifact: DocumentExtractionArtifact;
  criteria: PinnedCriterion[];
}

export interface RubricEvaluationResult {
  check: AnalysisCheckWriteInput;
  suggestions: RubricSuggestionWriteInput[];
}

export interface RubricCheckDependencies {
  runRepository: AnalysisRunRepository;
  checkRepository: AnalysisCheckRepository;
  suggestionRepository: RubricSuggestionRepository;
  storage: DocumentStorage;
  listPinnedCriteria(database: D1Database, rubricVersionId: string): Promise<PinnedCriterion[]>;
}

async function listPinnedCriteria(
  database: D1Database,
  rubricVersionId: string,
): Promise<PinnedCriterion[]> {
  const rows = await listCriteriaForRubric(database, rubricVersionId);
  return rows.map((criterion) => ({
    id: criterion.id,
    code: criterion.code,
    title: criterion.name,
    description: criterion.description,
    evidenceExpectation: criterion.evidenceExpectation,
    maxScore: criterion.maxScore,
    order: criterion.order,
  }));
}

const defaultDependencies: RubricCheckDependencies = {
  runRepository: analysisRunRepository,
  checkRepository: analysisCheckRepository,
  suggestionRepository: rubricSuggestionRepository,
  storage: documentStorage,
  listPinnedCriteria,
};

function mapProviderFailure(error: unknown): never {
  if (!(error instanceof AIProviderError)) {
    throw new DocumentProcessingError(
      "AI_NETWORK_ERROR",
      "Rubrik değerlendirme sağlayıcısı çalışamadı.",
    );
  }
  const codes = {
    NETWORK_ERROR: "AI_NETWORK_ERROR",
    RATE_LIMITED: "AI_RATE_LIMITED",
    TIMEOUT: "AI_TIMEOUT",
    REFUSAL: "AI_REFUSAL",
    INCOMPLETE_RESPONSE: "AI_INCOMPLETE_RESPONSE",
    STRUCTURED_OUTPUT_PARSE_FAILED: "AI_STRUCTURED_OUTPUT_INVALID",
    OUTPUT_VALIDATION_FAILED: "AI_STRUCTURED_OUTPUT_INVALID",
  } as const;
  throw new DocumentProcessingError(codes[error.code], error.message);
}

async function loadContext(
  database: D1Database,
  bucket: R2Bucket,
  analysisRunId: string,
  dependencies: RubricCheckDependencies,
): Promise<RubricContext> {
  const run = await dependencies.runRepository.getAnalysisRunExecutionContext(
    database,
    analysisRunId,
  );
  if (!run?.documentArtifactKey || !run.aiProvider || !run.modelId || !run.promptBundleVersion) {
    throw new DocumentProcessingError(
      "AI_CONFIGURATION_INVALID",
      "Analiz koşusunun sabitlenmiş rubrik yapılandırması bulunamadı.",
    );
  }
  const criteria = await dependencies.listPinnedCriteria(database, run.rubricVersionId);
  if (criteria.length === 0) {
    throw new DocumentProcessingError(
      "AI_CONFIGURATION_INVALID",
      "Analiz koşusunun sabitlenmiş rubrik sürümünde kriter bulunamadı.",
    );
  }
  const object = await dependencies.storage.getDocumentArtifact(bucket, run.documentArtifactKey);
  if (!object) {
    throw new DocumentProcessingError(
      "ARTIFACT_NOT_FOUND",
      "Çıkarılan belge artifact'i bulunamadı.",
    );
  }
  try {
    const artifact = DocumentExtractionArtifactSchema.parse(JSON.parse(await object.text()));
    if (
      artifact.analysisRunId !== run.id ||
      artifact.submissionId !== run.submissionId ||
      artifact.sourceSha256 !== run.sourceSha256
    ) {
      throw new Error("identity mismatch");
    }
    return { run, artifact, criteria };
  } catch {
    throw new DocumentProcessingError(
      "ARTIFACT_INVALID",
      "Çıkarılan belge artifact'i doğrulanamadı.",
    );
  }
}

/** Reviewer-facing sentences built only from server-validated fields; never a second model call. */
export function synthesizeFeedback(criteria: readonly RubricCriterionSuggestion[]): string {
  const weak = criteria.filter(
    (criterion) =>
      criterion.missingPoints.length > 0 ||
      criterion.evidenceStrength === "LOW" ||
      criterion.suggestedScore / criterion.maxScore < 0.6,
  );
  if (weak.length === 0) {
    return (
      "Değerlendirilen rubrik kriterlerinin tümünde yeterli kanıt bulundu; hakem incelemesi için " +
      "önerilen ek bir geliştirme notu yok."
    );
  }
  const sentences = weak.slice(0, 3).map((criterion) => {
    const point = criterion.missingPoints[0];
    if (point) return `${criterion.title}: ${criterion.title.toLowerCase()} açık ancak ${point}.`;
    return `${criterion.title} için sunulan kanıt sınırlı; uzman incelemesi önerilir.`;
  });
  return sentences.join(" ").slice(0, 1_200);
}

/**
 * `0` is a legitimate, fully-trusted rubric judgment ("this criterion is not met at all"); a score
 * outside `0..maxScore` is not a low judgment, it is invalid provider output and must never be
 * coerced into one. This check runs before any criterion result is built, so an out-of-range score
 * rejects the whole evaluation rather than silently becoming a fabricated `0`.
 */
function isScoreWithinBounds(suggestedScore: number, maxScore: number): boolean {
  return Number.isInteger(suggestedScore) && suggestedScore >= 0 && suggestedScore <= maxScore;
}

function verifiedCriterionResult(
  criterion: PinnedCriterion,
  claimed: {
    suggestedScore: number;
    reason: string;
    evidenceStrength: SemanticEvidenceStrength;
    evidence: readonly { page: number; excerpt: string }[];
    missingPoints: readonly string[];
  },
  artifact: DocumentExtractionArtifact,
): RubricCriterionSuggestion {
  const evidence = verifyClaimedEvidence(artifact, claimed.evidence);
  const evidenceInvalid = evidence.length !== claimed.evidence.length || evidence.length === 0;
  const evidenceStrength = evidenceInvalid ? "LOW" : claimed.evidenceStrength;
  const reason = evidenceInvalid
    ? `${claimed.reason} Kanıt sunucu tarafında tam doğrulanamadığı için sonuç ihtiyatlı biçimde düşürüldü.`.slice(
        0,
        600,
      )
    : claimed.reason;
  return {
    criterionId: criterion.id,
    code: criterion.code,
    title: criterion.title,
    order: criterion.order,
    // Bounds are already enforced for every criterion before this function ever runs; the claimed
    // score is trusted as-is here, never clamped or fabricated.
    suggestedScore: claimed.suggestedScore,
    maxScore: criterion.maxScore,
    reason,
    evidenceStrength,
    evidence,
    missingPoints: [...claimed.missingPoints],
  };
}

export async function evaluateRubric(
  database: D1Database,
  bucket: R2Bucket,
  analysisRunId: string,
  provider: AIProvider,
  dependencies: RubricCheckDependencies = defaultDependencies,
): Promise<RubricEvaluationResult> {
  const context = await loadContext(database, bucket, analysisRunId, dependencies);
  const expectedCodes = new Set(context.criteria.map((criterion) => criterion.code));
  const input = rubricProviderInput(
    context.artifact,
    context.criteria.map((criterion) => ({
      code: criterion.code,
      title: criterion.title,
      description: criterion.description,
      evidenceExpectation: criterion.evidenceExpectation,
      maxScore: criterion.maxScore,
    })),
  );
  let output: Awaited<ReturnType<AIProvider["evaluateRubric"]>>;
  try {
    output = await provider.evaluateRubric(input);
  } catch (error) {
    return mapProviderFailure(error);
  }
  const returnedCodes = output.criteria.map((result) => result.criterionCode);
  if (
    returnedCodes.length !== context.criteria.length ||
    new Set(returnedCodes).size !== returnedCodes.length ||
    returnedCodes.some((code) => !expectedCodes.has(code))
  ) {
    throw new DocumentProcessingError(
      "AI_STRUCTURED_OUTPUT_INVALID",
      "Rubrik değerlendirme çıktısı pinlenmiş kriter kümesiyle eşleşmiyor.",
    );
  }
  const byCode = new Map(output.criteria.map((result) => [result.criterionCode, result]));
  // A score outside `0..maxScore` is invalid provider output, not a legitimate low judgment: reject
  // the whole evaluation here, before any criterion result is built, so an out-of-range score can
  // never be clamped/fabricated into a persisted `0`.
  const criteriaByCode = new Map(context.criteria.map((criterion) => [criterion.code, criterion]));
  for (const result of output.criteria) {
    const criterion = criteriaByCode.get(result.criterionCode);
    if (!criterion || !isScoreWithinBounds(result.suggestedScore, criterion.maxScore)) {
      throw new DocumentProcessingError(
        "AI_STRUCTURED_OUTPUT_INVALID",
        "Rubrik değerlendirme çıktısı sınır dışı bir puan içeriyor.",
      );
    }
  }
  const suggestions = context.criteria
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((criterion) => {
      const claimed = byCode.get(criterion.code);
      if (!claimed) {
        throw new DocumentProcessingError(
          "AI_STRUCTURED_OUTPUT_INVALID",
          "Rubrik değerlendirme çıktısı eksik.",
        );
      }
      return verifiedCriterionResult(criterion, claimed, context.artifact);
    });

  const suggestedTotalScore = suggestions.reduce((total, item) => total + item.suggestedScore, 0);
  const maxTotalScore = suggestions.reduce((total, item) => total + item.maxScore, 0);
  const feedbackSummary = synthesizeFeedback(suggestions);
  const weakCount = suggestions.filter((item) => item.evidenceStrength === "LOW").length;

  const details = AnalysisCheckDetailsSchema.parse({
    checkType: "RUBRIC_EVALUATION",
    criteria: suggestions,
    suggestedTotalScore,
    maxTotalScore,
    feedbackSummary,
  });
  const check: AnalysisCheckWriteInput = {
    type: "RUBRIC_EVALUATION",
    // A low or negative-signal suggestion is never a pipeline failure: this is an advisory score,
    // never a reviewer decision, and status here reflects evidence integrity only.
    status: weakCount === 0 ? "PASS" : "WARN",
    summary:
      weakCount === 0
        ? "Rubrik kriterlerinin tamamı için kanıt destekli AI önerisi üretildi."
        : "Bazı rubrik kriterlerinde kanıt sınırlı; hakem incelemesi önerilir. Bu bir hakem kararı değildir.",
    details,
  };
  return {
    check,
    suggestions: suggestions.map((item) => ({
      criterionId: item.criterionId,
      suggestedScore: item.suggestedScore,
      reason: item.reason,
      evidenceStrength: item.evidenceStrength,
      evidence: item.evidence,
      missingPoints: item.missingPoints,
    })),
  };
}

export async function persistRubricEvaluation(
  database: D1Database,
  analysisRunId: string,
  result: RubricEvaluationResult,
  dependencies: RubricCheckDependencies = defaultDependencies,
): Promise<void> {
  const run = await dependencies.runRepository.getAnalysisRunExecutionContext(
    database,
    analysisRunId,
  );
  if (!run) {
    throw new DocumentProcessingError("ANALYSIS_INTERNAL_ERROR", "Analiz kaydı bulunamadı.");
  }
  try {
    await dependencies.checkRepository.upsertAnalysisChecks(database, analysisRunId, [
      result.check,
    ]);
    await dependencies.suggestionRepository.upsertRubricSuggestions(
      database,
      analysisRunId,
      run.rubricVersionId,
      result.suggestions,
    );
  } catch {
    throw new DocumentProcessingError(
      "CHECK_PERSISTENCE_FAILED",
      "Rubrik değerlendirme sonucu güvenli biçimde kaydedilemedi.",
    );
  }
}
