import {
  MAX_SIMILARITY_SECTION_CHARACTERS,
  type SimilaritySectionCandidate,
  SimilaritySectionMetadataSchema,
} from "@teknofest-ai/shared";

import type { EmbeddingProvider } from "./embedding-provider";
import type { SimilarityVectorMatch, SimilarityVectorProvider } from "./similarity-vector-provider";

export const SIMILARITY_VECTOR_SCHEMA_VERSION = "similarity-section/v1";

/** Vectorize caps vector ids, so identity is a deterministic digest of the stable identifiers. */
const VECTOR_ID_PREFIX = "sim1-";
const VECTOR_ID_DIGEST_LENGTH = 40;
// Vectorize allows 1000 vectors per upsert through the Workers binding; a smaller batch keeps a
// single stage step well inside its time budget.
const MAX_UPSERT_BATCH = 100;
// Vectorize caps topK at 50 when full metadata is requested.
const MAX_QUERY_TOP_K = 50;

export class SimilarityVectorProviderError extends Error {
  readonly code: "VECTOR_UPSERT_FAILED" | "VECTOR_QUERY_FAILED" | "VECTOR_RESULT_INVALID";

  constructor(code: SimilarityVectorProviderError["code"], message: string) {
    super(message);
    this.name = "SimilarityVectorProviderError";
    this.code = code;
  }
}

/** The subset of the Vectorize binding this adapter uses. */
export interface SimilarityVectorizeBinding {
  upsert(vectors: VectorizeVector[]): Promise<unknown>;
  query(
    vector: number[] | VectorFloatArray,
    options?: VectorizeQueryOptions,
  ): Promise<VectorizeMatches>;
}

async function digest(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, VECTOR_ID_DIGEST_LENGTH);
}

/**
 * Deterministic semantic identity. A vector produced for AnalysisRun A1 can never collide with the
 * same submission's later AnalysisRun A2, because the run id is part of the digest input. Re-running
 * the same run rewrites exactly the same vector ids instead of appending duplicates.
 */
export async function similarityVectorId(metadata: {
  competitionId: string;
  submissionId: string;
  analysisRunId: string;
  sectionKey: string;
}): Promise<string> {
  const composite = [
    SIMILARITY_VECTOR_SCHEMA_VERSION,
    metadata.competitionId,
    metadata.submissionId,
    metadata.analysisRunId,
    metadata.sectionKey,
  ].join("\0");
  return `${VECTOR_ID_PREFIX}${await digest(composite)}`;
}

/**
 * Vectorize returns a cosine score whose documented range is [-1, 1] while observed query results
 * sit in [0, 1]. A negative cosine means "dissimilar", so clamping into [0, 1] is correct for a
 * similarity signal under either interpretation and can never inflate a score.
 */
export function normalizeVectorScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.min(1, Math.max(0, score));
}

export class VectorizeSimilarityVectorProvider implements SimilarityVectorProvider {
  readonly #index: SimilarityVectorizeBinding;
  readonly #embedder: EmbeddingProvider;

  constructor(index: SimilarityVectorizeBinding, embedder: EmbeddingProvider) {
    this.#index = index;
    this.#embedder = embedder;
  }

  /**
   * Indexes the sections of one AnalysisRun. Only the bounded, heading-free section body is sent to
   * the embedding provider; metadata carries just the identifiers needed for competition-scoped
   * filtering and evidence lookup. Raw report text is never stored as metadata and never logged.
   */
  async indexSections(
    competitionId: string,
    sections: readonly SimilaritySectionCandidate[],
  ): Promise<void> {
    if (sections.length === 0) return;
    const scoped = sections.filter((section) => section.metadata.competitionId === competitionId);
    if (scoped.length !== sections.length) {
      throw new SimilarityVectorProviderError(
        "VECTOR_UPSERT_FAILED",
        "Vektör sağlayıcısı yarışmalar arası bölüm indeksleyemez.",
      );
    }
    const embeddings = await this.#embedder.embed(
      scoped.map((section) => section.text.slice(0, MAX_SIMILARITY_SECTION_CHARACTERS)),
    );
    const vectors: VectorizeVector[] = [];
    for (const [index, section] of scoped.entries()) {
      const values = embeddings[index];
      if (!values) {
        throw new SimilarityVectorProviderError(
          "VECTOR_UPSERT_FAILED",
          "Bölüm için gömme vektörü üretilemedi.",
        );
      }
      vectors.push({
        id: await similarityVectorId(section.metadata),
        values,
        metadata: {
          schemaVersion: SIMILARITY_VECTOR_SCHEMA_VERSION,
          competitionId: section.metadata.competitionId,
          submissionId: section.metadata.submissionId,
          analysisRunId: section.metadata.analysisRunId,
          sectionKey: section.metadata.sectionKey,
          sectionTitle: section.metadata.sectionTitle,
          pageStart: section.metadata.pageStart,
          pageEnd: section.metadata.pageEnd,
        },
      });
    }
    for (let offset = 0; offset < vectors.length; offset += MAX_UPSERT_BATCH) {
      const batch = vectors.slice(offset, offset + MAX_UPSERT_BATCH);
      try {
        await this.#index.upsert(batch);
      } catch {
        throw new SimilarityVectorProviderError(
          "VECTOR_UPSERT_FAILED",
          "Benzerlik vektörleri indekslenemedi.",
        );
      }
    }
  }

  async findSimilarSections(input: {
    competitionId: string;
    query: SimilaritySectionCandidate;
    topK: number;
    analysisRunIds?: readonly string[];
  }): Promise<SimilarityVectorMatch[]> {
    if (input.query.metadata.competitionId !== input.competitionId) {
      throw new SimilarityVectorProviderError(
        "VECTOR_QUERY_FAILED",
        "Vektör sorgusu yarışma kapsamıyla eşleşmiyor.",
      );
    }
    if (input.analysisRunIds && input.analysisRunIds.length === 0) return [];
    const [values] = await this.#embedder.embed([
      input.query.text.slice(0, MAX_SIMILARITY_SECTION_CHARACTERS),
    ]);
    if (!values) return [];
    let result: VectorizeMatches;
    try {
      result = await this.#index.query(values, {
        topK: Math.min(MAX_QUERY_TOP_K, Math.max(1, Math.trunc(input.topK))),
        // Competition isolation is enforced at the index, then re-verified below.
        filter: { competitionId: { $eq: input.competitionId } },
        returnValues: false,
        returnMetadata: "all",
      });
    } catch {
      throw new SimilarityVectorProviderError(
        "VECTOR_QUERY_FAILED",
        "Benzerlik vektör sorgusu tamamlanamadı.",
      );
    }
    const allowedRuns = input.analysisRunIds ? new Set(input.analysisRunIds) : null;
    const matches: SimilarityVectorMatch[] = [];
    for (const match of result.matches ?? []) {
      const raw = (match.metadata ?? {}) as Record<string, unknown>;
      // Only the known identity fields are projected out; `schemaVersion` and any future metadata
      // key is ignored rather than fed into the strict section-metadata schema.
      const parsed = SimilaritySectionMetadataSchema.safeParse({
        competitionId: raw.competitionId,
        submissionId: raw.submissionId,
        analysisRunId: raw.analysisRunId,
        sectionKey: raw.sectionKey,
        sectionTitle: raw.sectionTitle,
        pageStart: raw.pageStart,
        pageEnd: raw.pageEnd,
      });
      // A match without well-formed metadata cannot be attributed safely, so it is dropped.
      if (!parsed.success) continue;
      // Defence in depth: never trust the index filter alone for competition isolation.
      if (parsed.data.competitionId !== input.competitionId) continue;
      // The source run must never semantically match itself.
      if (parsed.data.submissionId === input.query.metadata.submissionId) continue;
      // Historical pinning: only the AnalysisRuns selected by the D1 candidate contract may score.
      if (allowedRuns && !allowedRuns.has(parsed.data.analysisRunId)) continue;
      matches.push({ metadata: parsed.data, score: normalizeVectorScore(match.score) });
    }
    return matches;
  }
}
