import { SimilarityScoreSchema, type SimilaritySectionCandidate } from "@teknofest-ai/shared";
import type { EmbeddingProvider } from "../analysis/embedding-provider";
import type {
  SimilarityVectorMatch,
  SimilarityVectorProvider,
} from "../analysis/similarity-vector-provider";
import { similarityVectorId } from "../analysis/vectorize-similarity-vector-provider";
import {
  cosineSimilarity,
  DeterministicEmbeddingProvider,
} from "./deterministic-embedding-provider";

interface StoredVector {
  id: string;
  values: number[];
  metadata: SimilaritySectionCandidate["metadata"];
}

// Test-only in-memory provider. Production composition never imports this module.
//
// It mirrors the production Vectorize adapter's shape - embed, upsert under a deterministic vector
// id, then cosine-query with a competition filter and an AnalysisRun allow-list - so the semantic
// tests exercise the same control flow as production instead of a bespoke mock.
export class FakeSimilarityVectorProvider implements SimilarityVectorProvider {
  readonly #vectors = new Map<string, StoredVector>();
  readonly #embedder: EmbeddingProvider;
  #indexCalls = 0;
  #queryCalls = 0;

  constructor(embedder: EmbeddingProvider = new DeterministicEmbeddingProvider()) {
    this.#embedder = embedder;
  }

  async indexSections(competitionId: string, sections: readonly SimilaritySectionCandidate[]) {
    this.#indexCalls += 1;
    if (sections.some((section) => section.metadata.competitionId !== competitionId)) {
      throw new Error("Fake provider yarışmalar arası bölüm indeksleyemez.");
    }
    if (sections.length === 0) return;
    const embeddings = await this.#embedder.embed(sections.map((section) => section.text));
    for (const [index, section] of sections.entries()) {
      const values = embeddings[index];
      if (!values) continue;
      // Deterministic identity: re-indexing the same AnalysisRun overwrites the same logical
      // vectors, while a later AnalysisRun of the same submission gets distinct ids.
      const id = await similarityVectorId(section.metadata);
      this.#vectors.set(id, { id, values, metadata: section.metadata });
    }
  }

  async findSimilarSections(input: {
    competitionId: string;
    query: SimilaritySectionCandidate;
    topK: number;
    analysisRunIds?: readonly string[];
  }): Promise<SimilarityVectorMatch[]> {
    this.#queryCalls += 1;
    if (input.query.metadata.competitionId !== input.competitionId) {
      throw new Error("Fake provider sorgusu yarışma kapsamıyla eşleşmiyor.");
    }
    if (input.analysisRunIds && input.analysisRunIds.length === 0) return [];
    const [queryValues] = await this.#embedder.embed([input.query.text]);
    if (!queryValues) return [];
    const allowedRuns = input.analysisRunIds ? new Set(input.analysisRunIds) : null;
    return [...this.#vectors.values()]
      .filter(
        (vector) =>
          vector.metadata.competitionId === input.competitionId &&
          vector.metadata.submissionId !== input.query.metadata.submissionId &&
          (!allowedRuns || allowedRuns.has(vector.metadata.analysisRunId)),
      )
      .map((vector) => ({
        metadata: vector.metadata,
        score: SimilarityScoreSchema.parse(
          Math.min(1, Math.max(0, cosineSimilarity(queryValues, vector.values))),
        ),
      }))
      .sort(
        (a, b) =>
          b.score - a.score ||
          a.metadata.submissionId.localeCompare(b.metadata.submissionId) ||
          a.metadata.sectionKey.localeCompare(b.metadata.sectionKey),
      )
      .slice(0, Math.max(0, input.topK));
  }

  /** Number of logical vectors held; used to assert retry does not duplicate vectors. */
  vectorCount(): number {
    return this.#vectors.size;
  }

  vectorIds(): string[] {
    return [...this.#vectors.keys()].sort();
  }

  indexCallCount(): number {
    return this.#indexCalls;
  }

  queryCallCount(): number {
    return this.#queryCalls;
  }
}

/** Test-only provider that always fails, for degraded-mode coverage. */
export class FailingSimilarityVectorProvider implements SimilarityVectorProvider {
  #calls = 0;

  async indexSections(): Promise<void> {
    this.#calls += 1;
    throw new Error("Fake vektör sağlayıcısı kullanılamıyor.");
  }

  async findSimilarSections(): Promise<SimilarityVectorMatch[]> {
    this.#calls += 1;
    throw new Error("Fake vektör sağlayıcısı kullanılamıyor.");
  }

  callCount(): number {
    return this.#calls;
  }
}
