import {
  type AnalysisCheckRepository,
  type AnalysisCheckWriteInput,
  type AnalysisRunRepository,
  analysisCheckRepository,
  analysisRunRepository,
} from "@teknofest-ai/db";
import {
  AnalysisCheckDetailsSchema,
  type AnalysisCheckStatus,
  type DocumentExtractionArtifact,
  DocumentExtractionArtifactSchema,
  MAX_HEADING_OCCURRENCES_PER_SECTION,
  MAX_LANGUAGE_SAMPLE_CHARACTERS_PER_PAGE,
  MAX_LANGUAGE_SAMPLE_PAGES,
  MAX_MATCHED_HEADING_TEXT_CHARACTERS,
  MIN_USABLE_DOCUMENT_CHARACTERS,
  type SectionPresenceResult,
  type TemplateStructuralProfile,
} from "@teknofest-ai/shared";
import { franc } from "franc-min";
import { iso6393To1 } from "iso-639-3";

import { type DocumentStorage, documentStorage } from "../storage/documents";
import { DocumentProcessingError } from "./document-extraction";

const MIN_LANGUAGE_PAGE_CHARACTERS = 80;
const MIXED_LANGUAGE_WEIGHT_RATIO = 0.3;

const iso6391To3 = new Map<string, string>();
for (const [iso6393, iso6391] of Object.entries(iso6393To1)) {
  iso6391To3.set(iso6391, iso6393);
}

export type LanguageDetector = (sample: string) => string;

export function normalizeLanguageIdentifier(identifier: string): string | null {
  const base = identifier.trim().toLowerCase().split("-")[0] ?? "";
  if (/^[a-z]{3}$/.test(base)) return base;
  if (/^[a-z]{2}$/.test(base)) return iso6391To3.get(base) ?? null;
  return null;
}

function publicLanguageIdentifier(iso6393: string): string {
  return iso6393To1[iso6393] ?? iso6393;
}

function normalizeLanguageText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function selectRepresentativePages(
  pages: DocumentExtractionArtifact["pages"],
): DocumentExtractionArtifact["pages"] {
  const eligible = pages.filter(
    (page) => normalizeLanguageText(page.text).length >= MIN_LANGUAGE_PAGE_CHARACTERS,
  );
  if (eligible.length <= MAX_LANGUAGE_SAMPLE_PAGES) return eligible;

  const selected: DocumentExtractionArtifact["pages"] = [];
  for (let index = 0; index < MAX_LANGUAGE_SAMPLE_PAGES; index += 1) {
    const sourceIndex = Math.round(
      (index * (eligible.length - 1)) / (MAX_LANGUAGE_SAMPLE_PAGES - 1),
    );
    const page = eligible[sourceIndex];
    if (page && selected.at(-1)?.pageNumber !== page.pageNumber) selected.push(page);
  }
  return selected;
}

export function evaluateLanguage(
  artifact: DocumentExtractionArtifact,
  expectedLanguage: string,
  detector: LanguageDetector = franc,
): AnalysisCheckWriteInput {
  const selectedPages = selectRepresentativePages(artifact.pages);
  const languageWeights = new Map<string, number>();
  let sampledCharacterCount = 0;
  let undeterminedPageCount = 0;

  for (const page of selectedPages) {
    const sample = normalizeLanguageText(page.text).slice(
      0,
      MAX_LANGUAGE_SAMPLE_CHARACTERS_PER_PAGE,
    );
    sampledCharacterCount += sample.length;
    let detected: string;
    try {
      detected = detector(sample);
    } catch {
      throw new DocumentProcessingError(
        "LANGUAGE_DETECTION_FAILED",
        "Rapor dili güvenilir biçimde tespit edilemedi.",
      );
    }
    if (detected === "und" || !/^[a-z]{3}$/.test(detected)) {
      undeterminedPageCount += 1;
      continue;
    }
    languageWeights.set(detected, (languageWeights.get(detected) ?? 0) + sample.length);
  }

  const ranked = [...languageWeights.entries()].sort(
    ([languageA, weightA], [languageB, weightB]) =>
      weightB - weightA || languageA.localeCompare(languageB),
  );
  const dominant = ranked[0]?.[0] ?? null;
  const determinedWeight = ranked.reduce((total, [, weight]) => total + weight, 0);
  const secondaryWeight = ranked[1]?.[1] ?? 0;
  const mixedLanguageSignal =
    ranked.length > 1 &&
    secondaryWeight / Math.max(1, determinedWeight) >= MIXED_LANGUAGE_WEIGHT_RATIO;
  const normalizedExpected = normalizeLanguageIdentifier(expectedLanguage);
  const sparse =
    artifact.warnings.includes("TEXT_SPARSE") ||
    sampledCharacterCount < MIN_USABLE_DOCUMENT_CHARACTERS;

  let status: AnalysisCheckStatus;
  let reason:
    | "MATCH"
    | "MISMATCH"
    | "TEXT_SPARSE"
    | "UNDETERMINED"
    | "MIXED_LANGUAGE"
    | "UNSUPPORTED_EXPECTED_LANGUAGE";
  let summary: string;
  if (sparse) {
    status = "WARN";
    reason = "TEXT_SPARSE";
    summary = "Dil kararı için kullanılabilir metin seyrek; insan incelemesi gerekli.";
  } else if (!normalizedExpected) {
    status = "WARN";
    reason = "UNSUPPORTED_EXPECTED_LANGUAGE";
    summary = "Beklenen dil tanımlayıcısı algılayıcıyla karşılaştırılamadı.";
  } else if (!dominant) {
    status = "WARN";
    reason = "UNDETERMINED";
    summary = "Raporun baskın dili belirlenemedi; insan incelemesi gerekli.";
  } else if (mixedLanguageSignal) {
    status = "WARN";
    reason = "MIXED_LANGUAGE";
    summary = "Raporun farklı sayfalarında güçlü karma dil sinyali bulundu.";
  } else if (dominant === normalizedExpected) {
    status = "PASS";
    reason = "MATCH";
    summary = "Tespit edilen baskın dil beklenen dille uyumlu.";
  } else {
    status = "FAIL";
    reason = "MISMATCH";
    summary = "Tespit edilen baskın dil beklenen dille uyumlu değil.";
  }

  const details = AnalysisCheckDetailsSchema.parse({
    checkType: "LANGUAGE",
    expectedLanguage,
    detectedLanguage: dominant ? publicLanguageIdentifier(dominant) : null,
    sampledCharacterCount,
    sampledPageCount: selectedPages.length,
    mixedLanguageSignal,
    undeterminedPageCount,
    reason,
  });
  return { type: "LANGUAGE", status, summary, details };
}

export function normalizeHeading(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/^\s*(?:\d+(?:\.\d+)*[.)]?|[ivxlcdm]+[.)])\s+/iu, "")
    .replace(/[\s:：;,.\-–—]+$/u, "")
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("tr");
}

function headingLikeLine(value: string): string | null {
  const line = value.trim();
  if (!line || line.length > MAX_MATCHED_HEADING_TEXT_CHARACTERS) return null;
  if (line.split(/\s+/).length > 16) return null;
  return line;
}

export function evaluateSections(
  artifact: DocumentExtractionArtifact,
  profile: TemplateStructuralProfile,
): { sectionPresence: AnalysisCheckWriteInput; templateStructure: AnalysisCheckWriteInput } {
  const targets = new Map(
    profile.sections.map((section) => [normalizeHeading(section.title), section]),
  );
  const occurrences = new Map<string, SectionPresenceResult["occurrences"]>();
  let documentOrder = 0;

  for (const page of artifact.pages) {
    for (const rawLine of page.text.split("\n")) {
      const line = headingLikeLine(rawLine);
      if (!line) continue;
      const section = targets.get(normalizeHeading(line));
      if (!section) continue;
      const current = occurrences.get(section.key) ?? [];
      if (current.length < MAX_HEADING_OCCURRENCES_PER_SECTION) {
        current.push({
          pageNumber: page.pageNumber,
          documentOrder,
          matchedText: line.slice(0, MAX_MATCHED_HEADING_TEXT_CHARACTERS),
        });
        occurrences.set(section.key, current);
      }
      documentOrder += 1;
    }
  }

  const sections: SectionPresenceResult[] = profile.sections.map((section) => {
    const matches = occurrences.get(section.key) ?? [];
    return {
      sectionKey: section.key,
      expectedTitle: section.title,
      required: section.required,
      expectedOrder: section.order,
      found: matches.length > 0,
      pageNumber: matches[0]?.pageNumber ?? null,
      matchedText: matches[0]?.matchedText ?? null,
      occurrences: matches,
    };
  });
  const missingRequiredSectionKeys = sections
    .filter((section) => section.required && !section.found)
    .map((section) => section.sectionKey);
  const requiredOccurrences = sections
    .filter((section) => section.required && section.occurrences[0])
    .sort((a, b) => a.expectedOrder - b.expectedOrder)
    .map((section) => section.occurrences[0]?.documentOrder ?? -1);
  const orderDeviation = requiredOccurrences.some(
    (documentPosition, index) =>
      index > 0 && documentPosition <= (requiredOccurrences[index - 1] ?? -1),
  );
  const duplicateHeadingKeys = sections
    .filter((section) => section.occurrences.length > 1)
    .map((section) => section.sectionKey);

  const sectionDetails = AnalysisCheckDetailsSchema.parse({
    checkType: "SECTION_PRESENCE",
    sections,
    missingRequiredSectionKeys,
  });
  const sectionPresence: AnalysisCheckWriteInput = {
    type: "SECTION_PRESENCE",
    status: missingRequiredSectionKeys.length > 0 ? "FAIL" : "PASS",
    summary:
      missingRequiredSectionKeys.length > 0
        ? `${missingRequiredSectionKeys.length} zorunlu başlık bulunamadı.`
        : "Yapılandırılmış zorunlu başlıkların tamamı bulundu.",
    details: sectionDetails,
  };

  let templateStatus: AnalysisCheckStatus = "PASS";
  let templateSummary = "Zorunlu bölüm yapısı şablonla uyumlu.";
  if (missingRequiredSectionKeys.length > 0) {
    templateStatus = "FAIL";
    templateSummary = "Zorunlu bölüm yapısı eksik.";
  } else if (orderDeviation || duplicateHeadingKeys.length > 0 || artifact.warnings.length > 0) {
    templateStatus = "WARN";
    templateSummary = "Bölüm yapısında insan incelemesi gerektiren sinyaller bulundu.";
  }
  const templateDetails = AnalysisCheckDetailsSchema.parse({
    checkType: "TEMPLATE_STRUCTURE",
    missingRequiredSectionKeys,
    orderDeviation,
    duplicateHeadingKeys,
    extractionWarnings: artifact.warnings,
  });

  return {
    sectionPresence,
    templateStructure: {
      type: "TEMPLATE_STRUCTURE",
      status: templateStatus,
      summary: templateSummary,
      details: templateDetails,
    },
  };
}

export function runDeterministicPrechecks(
  artifact: DocumentExtractionArtifact,
  profile: TemplateStructuralProfile,
  detector: LanguageDetector = franc,
): AnalysisCheckWriteInput[] {
  const language = evaluateLanguage(artifact, profile.expectedLanguage, detector);
  const structural = evaluateSections(artifact, profile);
  return [language, structural.templateStructure, structural.sectionPresence];
}

export interface StructuralCheckProcessorDependencies {
  runRepository: AnalysisRunRepository;
  checkRepository: AnalysisCheckRepository;
  storage: DocumentStorage;
  detector: LanguageDetector;
}

const defaultDependencies: StructuralCheckProcessorDependencies = {
  runRepository: analysisRunRepository,
  checkRepository: analysisCheckRepository,
  storage: documentStorage,
  detector: franc,
};

export async function processStructuralChecks(
  database: D1Database,
  bucket: R2Bucket,
  analysisRunId: string,
  dependencies: StructuralCheckProcessorDependencies = defaultDependencies,
): Promise<void> {
  const run = await dependencies.runRepository.getAnalysisRunExecutionContext(
    database,
    analysisRunId,
  );
  if (!run) {
    throw new DocumentProcessingError(
      "PINNED_TEMPLATE_NOT_FOUND",
      "Analiz koşusunun sabitlenmiş şablon sürümü bulunamadı.",
    );
  }
  if (!run.documentArtifactKey) {
    throw new DocumentProcessingError(
      "ARTIFACT_NOT_FOUND",
      "Çıkarılan belge artifact'i bulunamadı.",
    );
  }

  let object: R2ObjectBody | null;
  try {
    object = await dependencies.storage.getDocumentArtifact(bucket, run.documentArtifactKey);
  } catch {
    object = null;
  }
  if (!object) {
    throw new DocumentProcessingError(
      "ARTIFACT_NOT_FOUND",
      "Çıkarılan belge artifact'i bulunamadı.",
    );
  }

  let artifact: DocumentExtractionArtifact;
  try {
    artifact = DocumentExtractionArtifactSchema.parse(JSON.parse(await object.text()));
    if (
      artifact.analysisRunId !== run.id ||
      artifact.submissionId !== run.submissionId ||
      artifact.sourceSha256 !== run.sourceSha256
    ) {
      throw new Error("artifact identity mismatch");
    }
  } catch {
    throw new DocumentProcessingError(
      "ARTIFACT_INVALID",
      "Çıkarılan belge artifact'i doğrulanamadı.",
    );
  }

  const checks = runDeterministicPrechecks(
    artifact,
    run.templateStructuralProfile,
    dependencies.detector,
  );
  try {
    await dependencies.checkRepository.upsertAnalysisChecks(database, analysisRunId, checks);
  } catch {
    throw new DocumentProcessingError(
      "CHECK_PERSISTENCE_FAILED",
      "Ön kontrol sonuçları güvenli biçimde kaydedilemedi.",
    );
  }
}
