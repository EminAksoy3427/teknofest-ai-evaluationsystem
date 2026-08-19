import {
  type AICategoryFitOutput,
  type AIProvider,
  AIProviderError,
  type AISectionContentOutput,
  OPENAI_PROVIDER_ID,
} from "@teknofest-ai/ai";
import {
  type AnalysisCheckRepository,
  type AnalysisCheckWriteInput,
  type AnalysisRunExecutionContext,
  type AnalysisRunRepository,
  analysisCheckRepository,
  analysisRunRepository,
} from "@teknofest-ai/db";
import {
  AnalysisCheckDetailsSchema,
  type AnalysisCheckStatus,
  type DocumentExtractionArtifact,
  DocumentExtractionArtifactSchema,
  type SectionContentResult,
} from "@teknofest-ai/shared";

import { type DocumentStorage, documentStorage } from "../storage/documents";
import { DocumentProcessingError } from "./document-extraction";
import { verifyClaimedEvidence } from "./evidence-verification";
import {
  categoryProviderInput,
  sectionProviderInput,
  segmentDocumentSections,
} from "./section-segmentation";

interface SemanticContext {
  run: AnalysisRunExecutionContext;
  artifact: DocumentExtractionArtifact;
}

export interface SemanticCheckDependencies {
  runRepository: AnalysisRunRepository;
  checkRepository: AnalysisCheckRepository;
  storage: DocumentStorage;
}

const defaultDependencies: SemanticCheckDependencies = {
  runRepository: analysisRunRepository,
  checkRepository: analysisCheckRepository,
  storage: documentStorage,
};

function mapProviderFailure(error: unknown): never {
  if (!(error instanceof AIProviderError)) {
    throw new DocumentProcessingError(
      "AI_NETWORK_ERROR",
      "Semantik analiz sağlayıcısı çalışamadı.",
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
  dependencies: SemanticCheckDependencies,
): Promise<SemanticContext> {
  const run = await dependencies.runRepository.getAnalysisRunExecutionContext(
    database,
    analysisRunId,
  );
  if (
    !run?.documentArtifactKey ||
    !run.aiProvider ||
    !run.modelId ||
    !run.promptBundleVersion ||
    !run.categorySnapshot
  ) {
    throw new DocumentProcessingError(
      "AI_CONFIGURATION_INVALID",
      "Analiz koşusunun sabitlenmiş semantik yapılandırması bulunamadı.",
    );
  }
  if (run.aiProvider !== OPENAI_PROVIDER_ID) {
    throw new DocumentProcessingError(
      "AI_CONFIGURATION_INVALID",
      "Analiz koşusunun yapay zekâ sağlayıcısı desteklenmiyor.",
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
    return { run, artifact };
  } catch {
    throw new DocumentProcessingError(
      "ARTIFACT_INVALID",
      "Çıkarılan belge artifact'i doğrulanamadı.",
    );
  }
}

function sectionStatus(results: readonly SectionContentResult[]): AnalysisCheckStatus {
  const required = results.filter(
    (result) => result.required && result.assessment !== "NOT_EVALUATED",
  );
  if (results.some((result) => result.required) && required.length === 0) return "WARN";
  if (required.some((result) => result.assessment === "NOT_SUPPORTED")) return "FAIL";
  if (
    required.some(
      (result) =>
        result.assessment === "PARTIAL" ||
        result.evidenceStrength === "LOW" ||
        result.sourceCoverage === "SAMPLED",
    )
  ) {
    return "WARN";
  }
  return "PASS";
}

function verifiedSectionCheck(
  context: SemanticContext,
  output: AISectionContentOutput,
): AnalysisCheckWriteInput {
  const segmented = segmentDocumentSections(
    context.artifact,
    context.run.templateStructuralProfile,
  );
  const evaluableKeys = new Set(
    segmented
      .filter((section) => section.sourceCoverage !== "MISSING_SECTION")
      .map((section) => section.sectionKey),
  );
  if (
    output.sections.length !== evaluableKeys.size ||
    new Set(output.sections.map((result) => result.sectionKey)).size !== output.sections.length ||
    output.sections.some((result) => !evaluableKeys.has(result.sectionKey))
  ) {
    throw new DocumentProcessingError(
      "AI_STRUCTURED_OUTPUT_INVALID",
      "Semantik bölüm çıktısı beklenen bölümlerle eşleşmiyor.",
    );
  }
  const byKey = new Map(output.sections.map((result) => [result.sectionKey, result]));
  const results: SectionContentResult[] = segmented.map((section) => {
    if (section.sourceCoverage === "MISSING_SECTION") {
      return {
        sectionKey: section.sectionKey,
        title: section.title,
        required: section.required,
        assessment: "NOT_EVALUATED",
        reason: "Yapılandırılmış başlık bulunamadığı için bölüm içeriği değerlendirilmedi.",
        evidenceStrength: "LOW",
        evidence: [],
        missingExpectations: [],
        sourceCoverage: "MISSING_SECTION",
        startPage: null,
        endPage: null,
      };
    }
    const claimed = byKey.get(section.sectionKey);
    if (!claimed) {
      throw new DocumentProcessingError(
        "AI_STRUCTURED_OUTPUT_INVALID",
        "Semantik bölüm çıktısı eksik.",
      );
    }
    const evidence = verifyClaimedEvidence(context.artifact, claimed.evidence);
    const evidenceInvalid = evidence.length !== claimed.evidence.length || evidence.length === 0;
    const assessment = evidenceInvalid
      ? claimed.assessment === "NOT_SUPPORTED"
        ? "PARTIAL"
        : claimed.assessment === "SUPPORTED"
          ? "PARTIAL"
          : claimed.assessment
      : claimed.assessment;
    return {
      sectionKey: section.sectionKey,
      title: section.title,
      required: section.required,
      assessment,
      reason: evidenceInvalid
        ? `${claimed.reason} Kanıtın tamamı sunucu tarafından doğrulanamadığı için sonuç ihtiyatlı biçimde düşürüldü.`.slice(
            0,
            1_000,
          )
        : claimed.reason,
      evidenceStrength: evidenceInvalid ? "LOW" : claimed.evidenceStrength,
      evidence,
      missingExpectations: claimed.missingExpectations,
      sourceCoverage: section.sourceCoverage,
      startPage: section.startPage,
      endPage: section.endPage,
    };
  });
  const status = sectionStatus(results);
  const details = AnalysisCheckDetailsSchema.parse({
    checkType: "SECTION_CONTENT",
    sections: results,
  });
  const summary =
    status === "PASS"
      ? "Zorunlu bölümlerin semantik içeriği şablon beklentileriyle destekleniyor."
      : status === "FAIL"
        ? "En az bir mevcut zorunlu bölüm beklenen bilgi türünü desteklemiyor; insan incelemesi gerekli."
        : "Bölüm içeriklerinde insan incelemesi gerektiren kısmi veya zayıf kanıt bulundu.";
  return { type: "SECTION_CONTENT", status, summary, details };
}

function verifiedCategoryCheck(
  context: SemanticContext,
  output: AICategoryFitOutput,
  sourceCoverage: "FULL" | "SAMPLED",
): AnalysisCheckWriteInput {
  const evidence = verifyClaimedEvidence(context.artifact, output.evidence);
  const evidenceInvalid = evidence.length !== output.evidence.length || evidence.length === 0;
  const assessment = evidenceInvalid ? "REVIEW" : output.assessment;
  const details = AnalysisCheckDetailsSchema.parse({
    checkType: "CATEGORY_FIT",
    assessment,
    reason: evidenceInvalid
      ? `${output.reason} Kanıtın tamamı sunucu tarafından doğrulanamadığı için kategori sinyali incelemeye düşürüldü.`.slice(
          0,
          1_000,
        )
      : output.reason,
    evidenceStrength: evidenceInvalid ? "LOW" : output.evidenceStrength,
    evidence,
    alignmentSignals: output.alignmentSignals,
    mismatchSignals: output.mismatchSignals,
    sourceCoverage,
  });
  const status = assessment === "ALIGNED" ? "PASS" : assessment === "MISALIGNED" ? "FAIL" : "WARN";
  const summary =
    status === "PASS"
      ? "Rapor içeriği gönderilen kategori tanımıyla uyumlu görünüyor."
      : status === "FAIL"
        ? "Kategori uyumunda olumsuz analiz sinyali bulundu; bu nihai ret veya kategori kararı değildir."
        : "Kategori uyumu için insan incelemesi gerekli.";
  return { type: "CATEGORY_FIT", status, summary, details };
}

export async function analyzeSectionContent(
  database: D1Database,
  bucket: R2Bucket,
  analysisRunId: string,
  provider: AIProvider,
  dependencies: SemanticCheckDependencies = defaultDependencies,
): Promise<AnalysisCheckWriteInput> {
  const context = await loadContext(database, bucket, analysisRunId, dependencies);
  const sections = segmentDocumentSections(context.artifact, context.run.templateStructuralProfile);
  try {
    const output = await provider.analyzeSectionContent({
      sections: sectionProviderInput(sections),
    });
    return verifiedSectionCheck(context, output);
  } catch (error) {
    if (error instanceof DocumentProcessingError) throw error;
    return mapProviderFailure(error);
  }
}

export async function analyzeCategoryFit(
  database: D1Database,
  bucket: R2Bucket,
  analysisRunId: string,
  provider: AIProvider,
  dependencies: SemanticCheckDependencies = defaultDependencies,
): Promise<AnalysisCheckWriteInput> {
  const context = await loadContext(database, bucket, analysisRunId, dependencies);
  const input = categoryProviderInput(
    context.artifact,
    context.run.categorySnapshot as NonNullable<typeof context.run.categorySnapshot>,
    context.run.projectTitle,
  );
  try {
    const output = await provider.analyzeCategoryFit(input);
    return verifiedCategoryCheck(context, output, input.sourceCoverage);
  } catch (error) {
    if (error instanceof DocumentProcessingError) throw error;
    return mapProviderFailure(error);
  }
}

export async function persistSemanticCheck(
  database: D1Database,
  analysisRunId: string,
  check: AnalysisCheckWriteInput,
  dependencies: SemanticCheckDependencies = defaultDependencies,
): Promise<void> {
  if (check.type !== "SECTION_CONTENT" && check.type !== "CATEGORY_FIT") {
    throw new DocumentProcessingError(
      "CHECK_PERSISTENCE_FAILED",
      "Semantik kontrol türü geçersiz.",
    );
  }
  try {
    await dependencies.checkRepository.upsertAnalysisChecks(database, analysisRunId, [check]);
  } catch {
    throw new DocumentProcessingError(
      "CHECK_PERSISTENCE_FAILED",
      "Semantik kontrol sonucu güvenli biçimde kaydedilemedi.",
    );
  }
}
