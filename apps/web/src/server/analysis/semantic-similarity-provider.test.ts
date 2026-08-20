import type { SimilaritySectionCandidate } from "@teknofest-ai/shared";
import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_EMBEDDING_DIMENSIONS,
  DEFAULT_EMBEDDING_MODEL,
  EMBEDDING_DISTANCE_METRIC,
  readEmbeddingConfiguration,
} from "../ai/embedding-env";
import {
  cosineSimilarity,
  DETERMINISTIC_EMBEDDING_DIMENSIONS,
  DeterministicEmbeddingProvider,
  deterministicEmbedding,
} from "../test-fixtures/deterministic-embedding-provider";
import {
  FailingSimilarityVectorProvider,
  FakeSimilarityVectorProvider,
} from "../test-fixtures/fake-similarity-vector-provider";
import {
  EmbeddingProviderError,
  parseEmbeddingResponse,
  type WorkersAIBinding,
  WorkersAIEmbeddingProvider,
} from "./embedding-provider";
import { createSimilarityVectorProvider } from "./similarity-vector-composition";
import {
  normalizeVectorScore,
  SIMILARITY_VECTOR_SCHEMA_VERSION,
  type SimilarityVectorizeBinding,
  SimilarityVectorProviderError,
  similarityVectorId,
  VectorizeSimilarityVectorProvider,
} from "./vectorize-similarity-vector-provider";

const AGRICULTURAL_AI =
  "Yapay zekâ destekli tarımsal hastalık tespit sistemi yaprak görüntülerini analiz ederek çiftçiye erken uyarı sağlar.";
// Same solution, materially different wording: almost no shared 5-token shingles.
const AGRICULTURAL_AI_PARAPHRASE =
  "Evrişimli sinir ağı modeli bitki yaprağı fotoğraflarını sınıflandırarak zirai patojen saptama ve erken uyarı sağlar.";
const MECHANICAL_ENERGY =
  "Rüzgâr türbini kanat yatağı için mekanik titreşim sönümleyici donanım bakım aralığını uzatır ve rulman ömrünü artırır.";

function candidate(
  competitionId: string,
  submissionId: string,
  analysisRunId: string,
  text: string,
  sectionKey = "summary",
): SimilaritySectionCandidate {
  return {
    metadata: {
      competitionId,
      submissionId,
      analysisRunId,
      sectionKey,
      sectionTitle: "Proje Özeti",
      pageStart: 1,
      pageEnd: 1,
    },
    text,
  };
}

describe("embedding configuration ownership", () => {
  it("keeps the Cloudflare model identifier in provider configuration, not domain logic", () => {
    expect(readEmbeddingConfiguration({})).toEqual({
      provider: "WORKERS_AI",
      modelId: DEFAULT_EMBEDDING_MODEL,
      dimensions: DEFAULT_EMBEDDING_DIMENSIONS,
    });
    expect(DEFAULT_EMBEDDING_MODEL).toBe("@cf/baai/bge-m3");
    expect(DEFAULT_EMBEDDING_DIMENSIONS).toBe(1024);
    expect(EMBEDDING_DISTANCE_METRIC).toBe("cosine");
  });

  it("allows environment override and rejects invalid configuration", () => {
    expect(
      readEmbeddingConfiguration({
        SIMILARITY_EMBEDDING_MODEL: "@cf/baai/bge-large-en-v1.5",
        SIMILARITY_EMBEDDING_DIMENSIONS: "1024",
      }),
    ).toMatchObject({ modelId: "@cf/baai/bge-large-en-v1.5", dimensions: 1024 });
    expect(() => readEmbeddingConfiguration({ SIMILARITY_EMBEDDING_DIMENSIONS: "0" })).toThrow(
      /DIMENSIONS/u,
    );
    expect(() => readEmbeddingConfiguration({ SIMILARITY_EMBEDDING_DIMENSIONS: "4096" })).toThrow(
      /DIMENSIONS/u,
    );
    expect(() => readEmbeddingConfiguration({ SIMILARITY_EMBEDDING_MODEL: "replace_me" })).toThrow(
      /MODEL/u,
    );
  });

  it("never returns a semantic provider without both Cloudflare bindings", () => {
    expect(createSimilarityVectorProvider({})).toBeNull();
    expect(createSimilarityVectorProvider({ AI: {} as WorkersAIBinding })).toBeNull();
    expect(
      createSimilarityVectorProvider({
        SIMILARITY_VECTORS: {} as SimilarityVectorizeBinding,
      }),
    ).toBeNull();
    expect(
      createSimilarityVectorProvider({
        AI: {} as WorkersAIBinding,
        SIMILARITY_VECTORS: {} as SimilarityVectorizeBinding,
      }),
    ).toBeInstanceOf(VectorizeSimilarityVectorProvider);
  });

  it("fails loudly on operator misconfiguration instead of silently disabling semantics", () => {
    expect(() =>
      createSimilarityVectorProvider({
        AI: {} as WorkersAIBinding,
        SIMILARITY_VECTORS: {} as SimilarityVectorizeBinding,
        SIMILARITY_EMBEDDING_DIMENSIONS: "not-a-number",
      }),
    ).toThrow(/DIMENSIONS/u);
  });
});

describe("Workers AI embedding provider contract", () => {
  const validResponse = (count: number, dimensions = 4) => ({
    shape: [count, dimensions],
    data: Array.from({ length: count }, (_, row) =>
      Array.from({ length: dimensions }, (_, column) => (row + 1) / (column + 2)),
    ),
  });

  function binding(run: WorkersAIBinding["run"]): WorkersAIBinding {
    return { run };
  }

  it("sends only the section text and returns the parsed vectors", async () => {
    const run = vi.fn<WorkersAIBinding["run"]>(async () => validResponse(2));
    const provider = new WorkersAIEmbeddingProvider(binding(run), {
      provider: "WORKERS_AI",
      modelId: "@cf/baai/bge-m3",
      dimensions: 4,
    });
    const vectors = await provider.embed(["birinci bölüm", "ikinci bölüm"]);
    expect(vectors).toHaveLength(2);
    expect(vectors[0]).toHaveLength(4);
    expect(run).toHaveBeenCalledWith("@cf/baai/bge-m3", {
      text: ["birinci bölüm", "ikinci bölüm"],
    });
    // Nothing but the text crosses the boundary: no ids, no competition, no secrets.
    expect(Object.keys(run.mock.calls[0]?.[1] ?? {})).toEqual(["text"]);
  });

  it("returns an empty result without calling the provider for no input", async () => {
    const run = vi.fn<WorkersAIBinding["run"]>(async () => validResponse(1));
    const provider = new WorkersAIEmbeddingProvider(binding(run), {
      provider: "WORKERS_AI",
      modelId: "m",
      dimensions: 4,
    });
    expect(await provider.embed([])).toEqual([]);
    expect(run).not.toHaveBeenCalled();
  });

  it("maps a provider transport failure to a sanitized error", async () => {
    const provider = new WorkersAIEmbeddingProvider(
      binding(async () => {
        throw new Error("upstream detail that must not leak");
      }),
      { provider: "WORKERS_AI", modelId: "m", dimensions: 4 },
    );
    await expect(provider.embed(["a"])).rejects.toMatchObject({
      code: "EMBEDDING_REQUEST_FAILED",
    });
    await expect(provider.embed(["a"])).rejects.not.toThrow(/upstream detail/u);
  });

  it("rejects malformed, empty and wrong-dimension responses instead of coercing them", () => {
    expect(() => parseEmbeddingResponse(null, 4)).toThrow(EmbeddingProviderError);
    expect(() => parseEmbeddingResponse({}, 4)).toThrow(/vektör verisi/u);
    expect(() => parseEmbeddingResponse({ data: [] }, 4)).toThrow(/vektör verisi/u);
    expect(() => parseEmbeddingResponse({ data: [["a", "b"]] }, 2)).toThrow(/geçersiz vektör/u);
    expect(() => parseEmbeddingResponse({ data: [[1, Number.NaN]] }, 2)).toThrow(
      /geçersiz vektör/u,
    );
    expect(() => parseEmbeddingResponse({ data: [[1, 2, 3]] }, 4)).toThrow(EmbeddingProviderError);
    expect(() => parseEmbeddingResponse({ data: [[1, 2, 3]] }, 4)).toThrow(/boyut/u);
    expect(parseEmbeddingResponse({ data: [[1, 2]] }, 2)).toEqual([[1, 2]]);
  });

  it("rejects a response whose vector count does not match the request", async () => {
    const provider = new WorkersAIEmbeddingProvider(
      binding(async () => validResponse(1)),
      { provider: "WORKERS_AI", modelId: "m", dimensions: 4 },
    );
    await expect(provider.embed(["a", "b"])).rejects.toMatchObject({
      code: "EMBEDDING_RESPONSE_INVALID",
    });
  });
});

describe("deterministic embedding fixture is meaningful", () => {
  // Control: the fixture must actually behave semantically, otherwise every semantic assertion
  // built on it would be vacuous.
  it("scores a paraphrase far above unrelated content", () => {
    const source = deterministicEmbedding(AGRICULTURAL_AI);
    const paraphrase = cosineSimilarity(source, deterministicEmbedding(AGRICULTURAL_AI_PARAPHRASE));
    const unrelated = cosineSimilarity(source, deterministicEmbedding(MECHANICAL_ENERGY));
    expect(paraphrase).toBeGreaterThan(0.6);
    expect(unrelated).toBeLessThan(0.2);
    expect(paraphrase).toBeGreaterThan(unrelated + 0.4);
  });

  it("is deterministic and dimension-stable", async () => {
    expect(deterministicEmbedding(AGRICULTURAL_AI)).toEqual(
      deterministicEmbedding(AGRICULTURAL_AI),
    );
    const provider = new DeterministicEmbeddingProvider();
    const vectors = await provider.embed([AGRICULTURAL_AI, MECHANICAL_ENERGY]);
    expect(vectors).toHaveLength(2);
    expect(vectors[0]).toHaveLength(DETERMINISTIC_EMBEDDING_DIMENSIONS);
    expect(provider.callCount()).toBe(1);
    expect(provider.embeddedTextCount()).toBe(2);
  });

  it("does not treat identical generic headings as content", () => {
    // Headings are excluded from section bodies upstream; even so, a heading-only string must not
    // read as a strong semantic match against a real body.
    const heading = deterministicEmbedding("Proje Özeti Problem Tanımı Çözüm Yaklaşımı");
    expect(cosineSimilarity(heading, deterministicEmbedding(AGRICULTURAL_AI))).toBeLessThan(0.35);
    expect(cosineSimilarity(heading, deterministicEmbedding(MECHANICAL_ENERGY))).toBeLessThan(0.35);
  });
});

describe("Vectorize similarity vector provider", () => {
  function vectorizeBinding(overrides: Partial<SimilarityVectorizeBinding> = {}) {
    const upserted: VectorizeVector[][] = [];
    const queries: Array<{ vector: number[]; options: VectorizeQueryOptions | undefined }> = [];
    const binding: SimilarityVectorizeBinding = {
      upsert: async (vectors) => {
        upserted.push(vectors);
        return { mutationId: "mutation-1" };
      },
      query: async (vector, options) => {
        queries.push({ vector: [...(vector as number[])], options });
        return { matches: [], count: 0 };
      },
      ...overrides,
    };
    return { binding, upserted, queries };
  }

  const embedder = () => new DeterministicEmbeddingProvider();

  it("derives deterministic, run-scoped vector identity within the 64 byte id limit", async () => {
    const base = {
      competitionId: "competition-a",
      submissionId: "submission-a",
      analysisRunId: "run-a1",
      sectionKey: "summary",
    };
    const first = await similarityVectorId(base);
    expect(await similarityVectorId(base)).toBe(first);
    expect(new TextEncoder().encode(first).byteLength).toBeLessThanOrEqual(64);
    // A later AnalysisRun of the same submission must never collide with the earlier one.
    expect(await similarityVectorId({ ...base, analysisRunId: "run-a2" })).not.toBe(first);
    expect(await similarityVectorId({ ...base, sectionKey: "problem" })).not.toBe(first);
    expect(await similarityVectorId({ ...base, submissionId: "submission-b" })).not.toBe(first);
    expect(await similarityVectorId({ ...base, competitionId: "competition-b" })).not.toBe(first);
  });

  it("stores only identity metadata and never raw report text", async () => {
    const { binding, upserted } = vectorizeBinding();
    const provider = new VectorizeSimilarityVectorProvider(binding, embedder());
    await provider.indexSections("competition-a", [
      candidate("competition-a", "submission-a", "run-a1", AGRICULTURAL_AI),
    ]);
    const vector = upserted[0]?.[0];
    expect(Object.keys(vector?.metadata ?? {}).sort()).toEqual([
      "analysisRunId",
      "competitionId",
      "pageEnd",
      "pageStart",
      "schemaVersion",
      "sectionKey",
      "sectionTitle",
      "submissionId",
    ]);
    expect(vector?.metadata?.schemaVersion).toBe(SIMILARITY_VECTOR_SCHEMA_VERSION);
    expect(JSON.stringify(vector?.metadata)).not.toContain("yaprak");
    expect(vector?.values).toHaveLength(DETERMINISTIC_EMBEDDING_DIMENSIONS);
  });

  it("refuses to index sections from another competition", async () => {
    const { binding, upserted } = vectorizeBinding();
    const provider = new VectorizeSimilarityVectorProvider(binding, embedder());
    await expect(
      provider.indexSections("competition-a", [
        candidate("competition-b", "submission-b", "run-b1", AGRICULTURAL_AI),
      ]),
    ).rejects.toBeInstanceOf(SimilarityVectorProviderError);
    expect(upserted).toEqual([]);
  });

  it("always applies a competition filter and bounded topK to the index query", async () => {
    const { binding, queries } = vectorizeBinding();
    const provider = new VectorizeSimilarityVectorProvider(binding, embedder());
    await provider.findSimilarSections({
      competitionId: "competition-a",
      query: candidate("competition-a", "submission-a", "run-a1", AGRICULTURAL_AI),
      topK: 500,
      analysisRunIds: ["run-b1"],
    });
    expect(queries[0]?.options?.filter).toEqual({ competitionId: { $eq: "competition-a" } });
    expect(queries[0]?.options?.topK).toBe(50);
    expect(queries[0]?.options?.returnMetadata).toBe("all");
  });

  it("drops a cross-competition match even when the index returns it as the top result", async () => {
    // Meaningfulness control: the leaking vector is the strongest match, so if isolation were
    // broken it would certainly surface.
    const leaking: VectorizeMatch = {
      id: "leak",
      score: 0.99,
      metadata: {
        schemaVersion: SIMILARITY_VECTOR_SCHEMA_VERSION,
        competitionId: "competition-b",
        submissionId: "submission-b1",
        analysisRunId: "run-b1",
        sectionKey: "summary",
        sectionTitle: "Proje Özeti",
        pageStart: 1,
        pageEnd: 1,
      },
    };
    const allowed: VectorizeMatch = {
      ...leaking,
      id: "ok",
      score: 0.4,
      metadata: {
        ...leaking.metadata,
        competitionId: "competition-a",
        submissionId: "submission-c",
      },
    };
    const { binding } = vectorizeBinding({
      query: async () => ({ matches: [leaking, allowed], count: 2 }),
    });
    const provider = new VectorizeSimilarityVectorProvider(binding, embedder());
    const matches = await provider.findSimilarSections({
      competitionId: "competition-a",
      query: candidate("competition-a", "submission-a", "run-a1", AGRICULTURAL_AI),
      topK: 5,
      analysisRunIds: ["run-b1"],
    });
    expect(matches).toHaveLength(1);
    expect(matches[0]?.metadata.submissionId).toBe("submission-c");
    expect(matches.map((match) => match.metadata.competitionId)).toEqual(["competition-a"]);
  });

  it("drops matches outside the pinned AnalysisRun set, self matches and malformed metadata", async () => {
    const make = (
      id: string,
      submissionId: string,
      analysisRunId: string,
      metadata?: Record<string, unknown>,
    ): VectorizeMatch =>
      ({
        id,
        score: 0.9,
        metadata: metadata ?? {
          competitionId: "competition-a",
          submissionId,
          analysisRunId,
          sectionKey: "summary",
          sectionTitle: "Proje Özeti",
          pageStart: 1,
          pageEnd: 1,
        },
      }) as VectorizeMatch;
    const { binding } = vectorizeBinding({
      query: async () => ({
        matches: [
          make("stale", "submission-c", "run-c-old"),
          make("self", "submission-a", "run-a1"),
          make("broken", "submission-d", "run-d1", { competitionId: "competition-a" }),
          make("good", "submission-e", "run-e1"),
        ],
        count: 4,
      }),
    });
    const provider = new VectorizeSimilarityVectorProvider(binding, embedder());
    const matches = await provider.findSimilarSections({
      competitionId: "competition-a",
      query: candidate("competition-a", "submission-a", "run-a1", AGRICULTURAL_AI),
      topK: 10,
      analysisRunIds: ["run-e1", "run-a1"],
    });
    expect(matches.map((match) => match.metadata.submissionId)).toEqual(["submission-e"]);
  });

  it("returns nothing when the pinned AnalysisRun set is empty and never queries the index", async () => {
    const { binding, queries } = vectorizeBinding();
    const provider = new VectorizeSimilarityVectorProvider(binding, embedder());
    expect(
      await provider.findSimilarSections({
        competitionId: "competition-a",
        query: candidate("competition-a", "submission-a", "run-a1", AGRICULTURAL_AI),
        topK: 5,
        analysisRunIds: [],
      }),
    ).toEqual([]);
    expect(queries).toEqual([]);
  });

  it("clamps scores defensively and maps index failures to typed errors", async () => {
    expect(normalizeVectorScore(1.4)).toBe(1);
    expect(normalizeVectorScore(-0.8)).toBe(0);
    expect(normalizeVectorScore(Number.NaN)).toBe(0);
    expect(normalizeVectorScore(0.42)).toBeCloseTo(0.42);

    const upsertFailure = new VectorizeSimilarityVectorProvider(
      vectorizeBinding({
        upsert: async () => {
          throw new Error("index unavailable");
        },
      }).binding,
      embedder(),
    );
    await expect(
      upsertFailure.indexSections("competition-a", [
        candidate("competition-a", "submission-a", "run-a1", AGRICULTURAL_AI),
      ]),
    ).rejects.toMatchObject({ code: "VECTOR_UPSERT_FAILED" });

    const queryFailure = new VectorizeSimilarityVectorProvider(
      vectorizeBinding({
        query: async () => {
          throw new Error("index unavailable");
        },
      }).binding,
      embedder(),
    );
    await expect(
      queryFailure.findSimilarSections({
        competitionId: "competition-a",
        query: candidate("competition-a", "submission-a", "run-a1", AGRICULTURAL_AI),
        topK: 5,
      }),
    ).rejects.toMatchObject({ code: "VECTOR_QUERY_FAILED" });
  });

  it("rejects a query whose section belongs to a different competition", async () => {
    const provider = new VectorizeSimilarityVectorProvider(vectorizeBinding().binding, embedder());
    await expect(
      provider.findSimilarSections({
        competitionId: "competition-a",
        query: candidate("competition-b", "submission-b", "run-b1", AGRICULTURAL_AI),
        topK: 5,
      }),
    ).rejects.toMatchObject({ code: "VECTOR_QUERY_FAILED" });
  });
});

describe("fake similarity vector provider instrumentation", () => {
  it("records calls and keeps deterministic vector identity across re-indexing", async () => {
    const provider = new FakeSimilarityVectorProvider();
    const sections = [
      candidate("competition-a", "submission-a", "run-a1", AGRICULTURAL_AI),
      candidate("competition-a", "submission-a", "run-a1", MECHANICAL_ENERGY, "problem"),
    ];
    await provider.indexSections("competition-a", sections);
    const firstIds = provider.vectorIds();
    expect(provider.vectorCount()).toBe(2);
    await provider.indexSections("competition-a", sections);
    expect(provider.vectorCount()).toBe(2);
    expect(provider.vectorIds()).toEqual(firstIds);
    expect(provider.indexCallCount()).toBe(2);

    // A later AnalysisRun adds new logical vectors instead of overwriting the earlier run's.
    await provider.indexSections("competition-a", [
      candidate("competition-a", "submission-a", "run-a2", AGRICULTURAL_AI),
    ]);
    expect(provider.vectorCount()).toBe(3);
  });

  it("stays competition-scoped and honours the pinned AnalysisRun set", async () => {
    const provider = new FakeSimilarityVectorProvider();
    await provider.indexSections("competition-a", [
      candidate("competition-a", "submission-b", "run-b1", AGRICULTURAL_AI),
    ]);
    await expect(
      provider.indexSections("competition-a", [
        candidate("competition-b", "submission-x", "run-x1", AGRICULTURAL_AI),
      ]),
    ).rejects.toThrow(/yarışmalar arası/u);
    expect(
      await provider.findSimilarSections({
        competitionId: "competition-b",
        query: candidate("competition-b", "submission-x", "run-x1", AGRICULTURAL_AI),
        topK: 5,
      }),
    ).toEqual([]);
    // Present in the store, but not in the pinned run set.
    expect(
      await provider.findSimilarSections({
        competitionId: "competition-a",
        query: candidate("competition-a", "submission-a", "run-a1", AGRICULTURAL_AI),
        topK: 5,
        analysisRunIds: ["run-other"],
      }),
    ).toEqual([]);
    const matches = await provider.findSimilarSections({
      competitionId: "competition-a",
      query: candidate("competition-a", "submission-a", "run-a1", AGRICULTURAL_AI_PARAPHRASE),
      topK: 5,
      analysisRunIds: ["run-b1"],
    });
    expect(matches).toHaveLength(1);
    expect(matches[0]?.score).toBeGreaterThan(0.6);
    expect(provider.queryCallCount()).toBeGreaterThan(0);
  });

  it("reports failures from the failing fixture provider", async () => {
    const failing = new FailingSimilarityVectorProvider();
    await expect(failing.indexSections()).rejects.toThrow(/kullanılamıyor/u);
    expect(failing.callCount()).toBe(1);
  });
});
