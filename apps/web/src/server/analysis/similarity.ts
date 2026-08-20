import {
  type AnalysisCheckRepository,
  type AnalysisCheckWriteInput,
  type AnalysisRunRepository,
  analysisCheckRepository,
  analysisRunRepository,
  type EligibleSimilarityRun,
  type SimilarityPairRepository,
  similarityPairRepository,
} from "@teknofest-ai/db";
import {
  type DocumentExtractionArtifact,
  DocumentExtractionArtifactSchema,
  MAX_SIMILARITY_CANDIDATES,
  MAX_SIMILARITY_EXCERPT_CHARACTERS,
  MAX_SIMILARITY_SECTION_CHARACTERS,
  MAX_SIMILARITY_SECTION_MATCHES,
  MAX_SIMILARITY_TOP_MATCHES,
  MIN_SIMILARITY_SECTION_TOKENS,
  SIMILARITY_HIGH_THRESHOLD,
  SIMILARITY_MEDIUM_THRESHOLD,
  SIMILARITY_TOKEN_SHINGLE_SIZE,
  type SimilarityLevel,
  type SimilaritySectionCandidate,
  SimilaritySectionCandidateSchema,
  type SimilaritySectionMatch,
  type SimilaritySemanticStatus,
  type SimilarityTopMatch,
  type TemplateStructuralProfile,
} from "@teknofest-ai/shared";

import { type DocumentStorage, documentStorage } from "../storage/documents";
import { DocumentProcessingError } from "./document-extraction";
import { segmentDocumentSections } from "./section-segmentation";
import type { SimilarityVectorProvider } from "./similarity-vector-provider";

const HYBRID_LEXICAL_WEIGHT = 0.6;
const HYBRID_SEMANTIC_WEIGHT = 0.4;
const MAX_SECTIONS_PER_DOCUMENT = 40;

export function normalizeSimilarityTokens(text: string): string[] {
  return text
    .normalize("NFKC")
    .toLocaleLowerCase("tr")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/u)
    .filter(Boolean);
}

function shingles(tokens: readonly string[]): Set<string> {
  if (tokens.length < MIN_SIMILARITY_SECTION_TOKENS) return new Set();
  const size = Math.min(SIMILARITY_TOKEN_SHINGLE_SIZE, tokens.length);
  if (new Set(tokens).size < size) return new Set();
  const result = new Set<string>();
  for (let index = 0; index <= tokens.length - size; index += 1) {
    result.add(tokens.slice(index, index + size).join(" "));
  }
  return result;
}

export function lexicalSimilarity(firstText: string, secondText: string): number {
  const first = shingles(normalizeSimilarityTokens(firstText));
  const second = shingles(normalizeSimilarityTokens(secondText));
  if (first.size === 0 || second.size === 0) return 0;
  let intersection = 0;
  for (const value of first) if (second.has(value)) intersection += 1;
  return intersection / (first.size + second.size - intersection);
}

export function hybridSimilarityScore(lexicalScore: number, semanticScore: number | null): number {
  const lexical = Math.min(1, Math.max(0, lexicalScore));
  if (semanticScore === null) return lexical;
  const semantic = Math.min(1, Math.max(0, semanticScore));
  return Math.min(
    1,
    Math.max(0, lexical * HYBRID_LEXICAL_WEIGHT + semantic * HYBRID_SEMANTIC_WEIGHT),
  );
}

export function similarityLevel(score: number, exactDocumentMatch = false): SimilarityLevel {
  if (exactDocumentMatch || score >= SIMILARITY_HIGH_THRESHOLD) return "HIGH";
  if (score >= SIMILARITY_MEDIUM_THRESHOLD) return "MEDIUM";
  return "LOW";
}

function boundedExcerpt(text: string): string {
  return text.replace(/\s+/gu, " ").trim().slice(0, MAX_SIMILARITY_EXCERPT_CHARACTERS);
}

export function similaritySections(input: {
  competitionId: string;
  submissionId: string;
  analysisRunId: string;
  artifact: DocumentExtractionArtifact;
  profile: TemplateStructuralProfile;
}): SimilaritySectionCandidate[] {
  const segmented = segmentDocumentSections(input.artifact, input.profile)
    .filter(
      (section) => section.text.trim() && section.startPage !== null && section.endPage !== null,
    )
    .slice(0, MAX_SECTIONS_PER_DOCUMENT)
    .map((section) =>
      SimilaritySectionCandidateSchema.parse({
        metadata: {
          competitionId: input.competitionId,
          submissionId: input.submissionId,
          analysisRunId: input.analysisRunId,
          sectionKey: section.sectionKey,
          sectionTitle: section.title,
          pageStart: section.startPage,
          pageEnd: section.endPage,
        },
        text: section.text.slice(0, MAX_SIMILARITY_SECTION_CHARACTERS),
      }),
    );
  if (segmented.length > 0) return segmented;
  return input.artifact.pages
    .filter((page) => normalizeSimilarityTokens(page.text).length >= MIN_SIMILARITY_SECTION_TOKENS)
    .slice(0, MAX_SECTIONS_PER_DOCUMENT)
    .map((page, index) =>
      SimilaritySectionCandidateSchema.parse({
        metadata: {
          competitionId: input.competitionId,
          submissionId: input.submissionId,
          analysisRunId: input.analysisRunId,
          sectionKey: `document-chunk-${index + 1}`,
          sectionTitle: `Belge bölümü ${index + 1}`,
          pageStart: page.pageNumber,
          pageEnd: page.pageNumber,
        },
        text: page.text.slice(0, MAX_SIMILARITY_SECTION_CHARACTERS),
      }),
    );
}

function sectionMatch(
  source: SimilaritySectionCandidate,
  other: SimilaritySectionCandidate,
  score: number,
): SimilaritySectionMatch {
  return {
    sourceSubmissionId: source.metadata.submissionId,
    otherSubmissionId: other.metadata.submissionId,
    sectionKey: source.metadata.sectionKey,
    sectionTitle: source.metadata.sectionTitle,
    otherSectionKey: other.metadata.sectionKey,
    otherSectionTitle: other.metadata.sectionTitle,
    sourcePage: source.metadata.pageStart,
    otherPage: other.metadata.pageStart,
    lexicalScore: score,
    semanticScore: null,
    sourceExcerpt: boundedExcerpt(source.text),
    otherExcerpt: boundedExcerpt(other.text),
  };
}

export function compareSimilaritySections(
  source: readonly SimilaritySectionCandidate[],
  other: readonly SimilaritySectionCandidate[],
): { lexicalScore: number; sectionMatches: SimilaritySectionMatch[] } {
  const matches: SimilaritySectionMatch[] = [];
  for (const sourceSection of source) {
    for (const otherSection of other) {
      const score = lexicalSimilarity(sourceSection.text, otherSection.text);
      if (score > 0) matches.push(sectionMatch(sourceSection, otherSection, score));
    }
  }
  matches.sort(
    (a, b) =>
      b.lexicalScore - a.lexicalScore ||
      a.sectionKey.localeCompare(b.sectionKey) ||
      a.otherSectionKey.localeCompare(b.otherSectionKey),
  );
  const bounded = matches.slice(0, MAX_SIMILARITY_SECTION_MATCHES);
  return { lexicalScore: bounded[0]?.lexicalScore ?? 0, sectionMatches: bounded };
}

async function readArtifact(
  storage: DocumentStorage,
  bucket: R2Bucket,
  key: string,
  identity: { analysisRunId: string; submissionId: string; sourceSha256: string },
): Promise<DocumentExtractionArtifact> {
  const object = await storage.getDocumentArtifact(bucket, key);
  if (!object)
    throw new DocumentProcessingError(
      "ARTIFACT_NOT_FOUND",
      "Benzerlik için çıkarılmış belge artifact'i bulunamadı.",
    );
  try {
    const artifact = DocumentExtractionArtifactSchema.parse(JSON.parse(await object.text()));
    if (
      artifact.analysisRunId !== identity.analysisRunId ||
      artifact.submissionId !== identity.submissionId ||
      artifact.sourceSha256 !== identity.sourceSha256
    )
      throw new Error("identity");
    return artifact;
  } catch {
    throw new DocumentProcessingError(
      "ARTIFACT_INVALID",
      "Benzerlik için çıkarılmış belge artifact'i doğrulanamadı.",
    );
  }
}

export interface SimilarityProcessorDependencies {
  runRepository: AnalysisRunRepository;
  checkRepository: AnalysisCheckRepository;
  pairRepository: SimilarityPairRepository;
  storage: DocumentStorage;
  vectorProvider: SimilarityVectorProvider | null;
}

const defaultDependencies: SimilarityProcessorDependencies = {
  runRepository: analysisRunRepository,
  checkRepository: analysisCheckRepository,
  pairRepository: similarityPairRepository,
  storage: documentStorage,
  vectorProvider: null,
};

export interface SemanticSimilarityOutcome {
  status: SimilaritySemanticStatus;
  /** Best semantic score per candidate AnalysisRun id. Keyed by run, never by submission, so a
   * newer AnalysisRun can never inherit an older run's semantic score. */
  runScores: Map<string, number>;
  /** Best semantic score per `${candidateRunId}::${sourceSectionKey}::${otherSectionKey}` pair. */
  sectionScores: Map<string, number>;
  /** Semantically matched section pairs per candidate AnalysisRun, strongest first. */
  sectionPairs: Map<string, SemanticSectionPair[]>;
}

export interface SemanticSectionPair {
  sourceSectionKey: string;
  otherSectionKey: string;
  score: number;
}

function sectionScoreKey(runId: string, sourceSectionKey: string, otherSectionKey: string): string {
  return `${runId}::${sourceSectionKey}::${otherSectionKey}`;
}

/**
 * Semantic scoring runs over exactly the AnalysisRun set the P4-01A D1 candidate contract selected.
 * The vector index supplies scores for those pairs; it never widens the candidate set, so the
 * candidate cap, same-competition isolation and persisted row cardinality are unchanged.
 *
 * The current run's own sections are indexed for future runs to retrieve. Because Vectorize writes
 * are eventually consistent, a candidate whose own run only just completed may not be queryable
 * yet; that yields a missing semantic score, reported as DEGRADED, never a fabricated one.
 */
/** Production stage dependencies; the caller supplies the semantic provider for its environment. */
export function similarityStageDependencies(): SimilarityProcessorDependencies {
  return { ...defaultDependencies };
}

async function semanticScores(
  provider: SimilarityVectorProvider | null,
  competitionId: string,
  sourceSections: SimilaritySectionCandidate[],
  candidateAnalysisRunIds: readonly string[],
): Promise<SemanticSimilarityOutcome> {
  const runScores = new Map<string, number>();
  const sectionScores = new Map<string, number>();
  const sectionPairs = new Map<string, SemanticSectionPair[]>();
  if (!provider) return { status: "DISABLED", runScores, sectionScores, sectionPairs };
  if (sourceSections.length === 0 || candidateAnalysisRunIds.length === 0) {
    return { status: "DEGRADED", runScores, sectionScores, sectionPairs };
  }
  try {
    // Write side: this run's own sections become retrievable for later runs.
    await provider.indexSections(competitionId, sourceSections);
    for (const query of sourceSections) {
      const matches = await provider.findSimilarSections({
        competitionId,
        query,
        topK: MAX_SIMILARITY_TOP_MATCHES,
        analysisRunIds: candidateAnalysisRunIds,
      });
      for (const match of matches) {
        if (match.metadata.competitionId !== competitionId)
          throw new Error("Semantik sağlayıcı yarışmalar arası sonuç döndürdü.");
        const score = Math.min(1, Math.max(0, match.score));
        const runId = match.metadata.analysisRunId;
        runScores.set(runId, Math.max(runScores.get(runId) ?? 0, score));
        const key = sectionScoreKey(runId, query.metadata.sectionKey, match.metadata.sectionKey);
        if (score > (sectionScores.get(key) ?? -1)) {
          sectionScores.set(key, score);
          const pairs = sectionPairs.get(runId) ?? [];
          const existing = pairs.find(
            (pair) =>
              pair.sourceSectionKey === query.metadata.sectionKey &&
              pair.otherSectionKey === match.metadata.sectionKey,
          );
          if (existing) existing.score = score;
          else
            pairs.push({
              sourceSectionKey: query.metadata.sectionKey,
              otherSectionKey: match.metadata.sectionKey,
              score,
            });
          sectionPairs.set(runId, pairs);
        }
      }
    }
  } catch (error) {
    if (error instanceof Error && /yarışmalar arası/u.test(error.message)) throw error;
    // A provider or index failure degrades to lexical-only; it never fabricates a semantic score
    // and never fails the AnalysisRun.
    return {
      status: "DEGRADED",
      runScores: new Map(),
      sectionScores: new Map(),
      sectionPairs: new Map(),
    };
  }
  for (const pairs of sectionPairs.values()) {
    pairs.sort(
      (a, b) =>
        b.score - a.score ||
        a.sourceSectionKey.localeCompare(b.sourceSectionKey) ||
        a.otherSectionKey.localeCompare(b.otherSectionKey),
    );
  }
  return {
    status: runScores.size > 0 ? "AVAILABLE" : "DEGRADED",
    runScores,
    sectionScores,
    sectionPairs,
  };
}

/**
 * Builds the bounded section evidence for one candidate.
 *
 * Lexical matches come first, annotated with their semantic contribution. A pure paraphrase has no
 * lexical overlap at all, so semantically matched section pairs are then added; without this a
 * semantic-only signal would raise the score while leaving the reviewer nothing to inspect.
 */
function buildSectionEvidence(input: {
  analysisRunId: string;
  lexicalMatches: readonly SimilaritySectionMatch[];
  sourceSections: readonly SimilaritySectionCandidate[];
  candidateSections: readonly SimilaritySectionCandidate[];
  semantic: SemanticSimilarityOutcome;
}): SimilaritySectionMatch[] {
  const evidence: SimilaritySectionMatch[] = input.lexicalMatches.map((match) => ({
    ...match,
    semanticScore:
      input.semantic.sectionScores.get(
        sectionScoreKey(input.analysisRunId, match.sectionKey, match.otherSectionKey),
      ) ?? null,
  }));
  const covered = new Set(evidence.map((match) => `${match.sectionKey}::${match.otherSectionKey}`));
  const sourceByKey = new Map(
    input.sourceSections.map((section) => [section.metadata.sectionKey, section]),
  );
  const candidateByKey = new Map(
    input.candidateSections.map((section) => [section.metadata.sectionKey, section]),
  );
  for (const pair of input.semantic.sectionPairs.get(input.analysisRunId) ?? []) {
    if (evidence.length >= MAX_SIMILARITY_SECTION_MATCHES) break;
    const key = `${pair.sourceSectionKey}::${pair.otherSectionKey}`;
    if (covered.has(key)) continue;
    const source = sourceByKey.get(pair.sourceSectionKey);
    const other = candidateByKey.get(pair.otherSectionKey);
    if (!source || !other) continue;
    covered.add(key);
    evidence.push({
      ...sectionMatch(source, other, lexicalSimilarity(source.text, other.text)),
      semanticScore: pair.score,
    });
  }
  return evidence.slice(0, MAX_SIMILARITY_SECTION_MATCHES);
}

export async function processSimilarityChecks(
  database: D1Database,
  bucket: R2Bucket,
  analysisRunId: string,
  dependencies: SimilarityProcessorDependencies = defaultDependencies,
): Promise<void> {
  try {
    const run = await dependencies.runRepository.getAnalysisRunExecutionContext(
      database,
      analysisRunId,
    );
    if (!run?.documentArtifactKey)
      throw new DocumentProcessingError(
        "ARTIFACT_NOT_FOUND",
        "Benzerlik için çıkarılmış belge artifact'i bulunamadı.",
      );
    if (!run.competitionId) throw new Error("Analiz koşusunun yarışma kapsamı bulunamadı.");
    const sourceArtifact = await readArtifact(
      dependencies.storage,
      bucket,
      run.documentArtifactKey,
      {
        analysisRunId: run.id,
        submissionId: run.submissionId,
        sourceSha256: run.sourceSha256,
      },
    );
    const sourceSections = similaritySections({
      competitionId: run.competitionId,
      submissionId: run.submissionId,
      analysisRunId: run.id,
      artifact: sourceArtifact,
      profile: run.templateStructuralProfile,
    });
    const candidates = await dependencies.pairRepository.listEligibleCompetitionRuns(
      database,
      run.competitionId,
      run.submissionId,
      MAX_SIMILARITY_CANDIDATES,
    );
    const prepared: Array<{ run: EligibleSimilarityRun; sections: SimilaritySectionCandidate[] }> =
      [];
    for (const candidate of candidates) {
      if (candidate.competitionId !== run.competitionId)
        throw new Error("Aday yarışma kapsamı geçersiz.");
      const artifact = await readArtifact(
        dependencies.storage,
        bucket,
        candidate.documentArtifactKey,
        candidate,
      );
      prepared.push({
        run: candidate,
        sections: similaritySections({
          competitionId: candidate.competitionId,
          submissionId: candidate.submissionId,
          analysisRunId: candidate.analysisRunId,
          artifact,
          profile: candidate.templateStructuralProfile,
        }),
      });
    }
    const semantic = await semanticScores(
      dependencies.vectorProvider,
      run.competitionId,
      sourceSections,
      prepared.map((item) => item.run.analysisRunId),
    );
    const matches: SimilarityTopMatch[] = [];
    for (const candidate of prepared) {
      const exactDocumentMatch = run.sourceSha256 === candidate.run.sourceSha256;
      const lexical = exactDocumentMatch
        ? {
            lexicalScore: 1,
            sectionMatches:
              sourceSections[0] && candidate.sections[0]
                ? [sectionMatch(sourceSections[0], candidate.sections[0], 1)]
                : [],
          }
        : compareSimilaritySections(sourceSections, candidate.sections);
      // Keyed by AnalysisRun, so a newer run can never inherit an older run's semantic score.
      const semanticScore = semantic.runScores.get(candidate.run.analysisRunId) ?? null;
      const combinedScore = exactDocumentMatch
        ? 1
        : hybridSimilarityScore(lexical.lexicalScore, semanticScore);
      const level = similarityLevel(combinedScore, exactDocumentMatch);
      const mode = semanticScore === null ? ("LEXICAL_ONLY" as const) : ("HYBRID" as const);
      // Evidence explains both halves of the hybrid signal for each reported section pair.
      const sectionMatches = buildSectionEvidence({
        analysisRunId: candidate.run.analysisRunId,
        lexicalMatches: lexical.sectionMatches,
        sourceSections,
        candidateSections: candidate.sections,
        semantic,
      });
      await dependencies.pairRepository.upsertSimilarityPair(database, {
        competitionId: run.competitionId,
        sourceSubmissionId: run.submissionId,
        otherSubmissionId: candidate.run.submissionId,
        sourceAnalysisRunId: run.id,
        otherAnalysisRunId: candidate.run.analysisRunId,
        lexicalScore: lexical.lexicalScore,
        semanticScore,
        combinedScore,
        mode,
        level,
        exactDocumentMatch,
        evidence: sectionMatches,
      });
      matches.push({
        otherSubmissionId: candidate.run.submissionId,
        otherAnalysisRunId: candidate.run.analysisRunId,
        applicationCode: candidate.run.applicationCode,
        projectTitle: candidate.run.projectTitle,
        exactDocumentMatch,
        combinedScore,
        lexicalScore: lexical.lexicalScore,
        semanticScore,
        sectionMatches,
      });
    }
    matches.sort(
      (a, b) =>
        b.combinedScore - a.combinedScore || a.otherSubmissionId.localeCompare(b.otherSubmissionId),
    );
    const topMatches = matches.slice(0, MAX_SIMILARITY_TOP_MATCHES);
    const level = topMatches.reduce<SimilarityLevel>(
      (current, match) =>
        current === "HIGH" ||
        similarityLevel(match.combinedScore, match.exactDocumentMatch) === "HIGH"
          ? "HIGH"
          : current === "MEDIUM" || similarityLevel(match.combinedScore) === "MEDIUM"
            ? "MEDIUM"
            : "LOW",
      "LOW",
    );
    // `mode` is HYBRID only when semantic analysis actually produced a score for a reported match.
    // `semanticStatus` distinguishes "no provider configured" from "provider ran but degraded".
    const semanticStatus: SimilaritySemanticStatus = semantic.status;
    const details = {
      checkType: "SIMILARITY" as const,
      mode: topMatches.some((match) => match.semanticScore !== null)
        ? ("HYBRID" as const)
        : ("LEXICAL_ONLY" as const),
      semanticStatus,
      level,
      candidateCount: candidates.length,
      topMatches,
    };
    const check: AnalysisCheckWriteInput = {
      type: "SIMILARITY",
      status: level === "LOW" ? "PASS" : "WARN",
      summary:
        level === "HIGH"
          ? "Yüksek benzerlik sinyali bulundu. Uzman incelemesi önerilir."
          : level === "MEDIUM"
            ? "Orta düzey benzerlik sinyali bulundu; uzman incelemesi önerilir."
            : "Düşük benzerlik sinyali bulundu.",
      details,
    };
    await dependencies.checkRepository.upsertAnalysisChecks(database, analysisRunId, [check]);
  } catch (error) {
    if (error instanceof DocumentProcessingError) throw error;
    throw new DocumentProcessingError(
      "SIMILARITY_PROCESSING_FAILED",
      "Benzerlik analizi güvenli biçimde tamamlanamadı.",
    );
  }
}
