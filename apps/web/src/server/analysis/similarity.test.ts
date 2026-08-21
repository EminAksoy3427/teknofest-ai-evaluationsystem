import {
  type AnalysisCheckWriteInput,
  analysisCheckRepository,
  analysisRunRepository,
  canonicalSubmissionPair,
  similarityPairRepository,
} from "@teknofest-ai/db";
import {
  type DocumentExtractionArtifact,
  SIMILARITY_HIGH_THRESHOLD,
  SIMILARITY_MEDIUM_THRESHOLD,
  type SimilaritySectionCandidate,
} from "@teknofest-ai/shared";
import { describe, expect, it, vi } from "vitest";

import type { DocumentStorage } from "../storage/documents";
import { FakeSimilarityVectorProvider } from "../test-fixtures/fake-similarity-vector-provider";
import {
  compareSimilaritySections,
  hybridSimilarityScore,
  lexicalSimilarity,
  processSimilarityChecks,
  similarityLevel,
  similaritySections,
} from "./similarity";

const agriculturalText =
  "Yapay zekâ destekli tarımsal hastalık tespit sistemi yaprak görüntülerini analiz ederek çiftçiye erken uyarı sağlar.";
const similarAgriculturalText =
  "YAPAY ZEKÂ destekli tarımsal hastalık tespit sistemi, yaprak görüntülerini analiz ederek çiftçiye erken uyarı sağlar!";
const unrelatedText =
  "Güneş panelleri için taşınabilir güç elektroniği donanımı enerji verimini artırır ve bataryayı dengeler.";

function artifact(
  submissionId: string,
  analysisRunId: string,
  sha: string,
  text: string,
): DocumentExtractionArtifact {
  return {
    schemaVersion: "document-extraction/v1",
    submissionId,
    analysisRunId,
    sourceSha256: sha,
    pageCount: 1,
    characterCount: text.length,
    pages: [{ pageNumber: 1, text, characterCount: text.length }],
    warnings: [],
  };
}

const profile = {
  expectedLanguage: "tr",
  sections: [{ key: "summary", title: "Proje Özeti", description: "", required: true, order: 1 }],
};

function candidate(
  competitionId: string,
  submissionId: string,
  text: string,
): SimilaritySectionCandidate {
  return {
    metadata: {
      competitionId,
      submissionId,
      analysisRunId: `run-${submissionId}`,
      sectionKey: "summary",
      sectionTitle: "Proje Özeti",
      pageStart: 1,
      pageEnd: 1,
    },
    text,
  };
}

describe("deterministic lexical similarity", () => {
  it("passes the P4-01A synthetic golden ordering", () => {
    const close = lexicalSimilarity(agriculturalText, similarAgriculturalText);
    const unrelated = lexicalSimilarity(agriculturalText, unrelatedText);
    expect(close).toBeGreaterThanOrEqual(0.7);
    expect(unrelated).toBeLessThan(0.35);
    expect(close).toBeGreaterThan(unrelated);
  });

  it("scores identical substantive text at the maximum", () => {
    expect(lexicalSimilarity(agriculturalText, agriculturalText)).toBe(1);
  });

  it("keeps punctuation and Turkish casing differences stable", () => {
    expect(lexicalSimilarity(agriculturalText, similarAgriculturalText)).toBe(1);
  });

  it("scores unrelated, empty, short, and repeated boilerplate conservatively", () => {
    expect(lexicalSimilarity(agriculturalText, unrelatedText)).toBe(0);
    expect(lexicalSimilarity("", agriculturalText)).toBe(0);
    expect(lexicalSimilarity("Proje Özeti", "Proje Özeti")).toBe(0);
    expect(lexicalSimilarity("Proje Özeti ".repeat(20), "Proje Özeti ".repeat(20))).toBe(0);
  });

  it("is deterministic across repeated runs and returns bounded evidence", () => {
    const first = compareSimilaritySections(
      [candidate("competition-a", "a", agriculturalText)],
      [candidate("competition-a", "b", similarAgriculturalText)],
    );
    const second = compareSimilaritySections(
      [candidate("competition-a", "a", agriculturalText)],
      [candidate("competition-a", "b", similarAgriculturalText)],
    );
    expect(first).toEqual(second);
    expect(first.sectionMatches[0]?.sourceExcerpt.length).toBeLessThanOrEqual(280);
    expect(first.sectionMatches[0]).toMatchObject({ sourcePage: 1, otherPage: 1 });
  });

  it("uses a neutral bounded page chunk fallback without inventing semantic labels", () => {
    const result = similaritySections({
      competitionId: "competition-a",
      submissionId: "a",
      analysisRunId: "run-a",
      artifact: artifact("a", "run-a", "a".repeat(64), agriculturalText),
      profile,
    });
    expect(result[0]?.metadata).toMatchObject({
      sectionKey: "document-chunk-1",
      sectionTitle: "Belge bölümü 1",
      pageStart: 1,
    });
  });
});

describe("hybrid similarity contract", () => {
  it("canonicalizes inverse pairs and rejects self-comparison", () => {
    expect(canonicalSubmissionPair("submission-b", "submission-a")).toEqual([
      "submission-a",
      "submission-b",
    ]);
    expect(() => canonicalSubmissionPair("submission-a", "submission-a")).toThrow(/kendisiyle/u);
  });

  it("uses lexical-only mode math when semantic score is absent", () => {
    expect(hybridSimilarityScore(0.42, null)).toBe(0.42);
  });

  it("combines lexical and semantic scores predictably within bounds", () => {
    expect(hybridSimilarityScore(0.8, 0.5)).toBeCloseTo(0.68);
    expect(hybridSimilarityScore(2, -1)).toBe(0.6);
    expect(similarityLevel(0.7)).toBe("HIGH");
    expect(similarityLevel(0.35)).toBe("MEDIUM");
  });

  it("keeps the fake provider competition-scoped", async () => {
    const provider = new FakeSimilarityVectorProvider();
    await provider.indexSections("competition-a", [
      candidate("competition-a", "a", agriculturalText),
    ]);
    await expect(
      provider.indexSections("competition-a", [candidate("competition-b", "b", agriculturalText)]),
    ).rejects.toThrow(/yarışmalar arası/u);
    const results = await provider.findSimilarSections({
      competitionId: "competition-b",
      query: candidate("competition-b", "x", agriculturalText),
      topK: 5,
    });
    expect(results).toEqual([]);
  });
});

function r2Artifact(value: DocumentExtractionArtifact): R2ObjectBody {
  return { text: async () => JSON.stringify(value) } as R2ObjectBody;
}

describe("similarity processing", () => {
  it("persists an exact same-competition match as HIGH/WARN and remains retry-idempotent at repository boundaries", async () => {
    const sha = "a".repeat(64);
    const source = artifact("submission-a", "run-a", sha, agriculturalText);
    const other = artifact("submission-b", "run-b", sha, agriculturalText);
    const upsertPair = vi.fn();
    const upsertChecks = vi.fn();
    const storage: DocumentStorage = {
      putSubmissionReport: vi.fn(),
      getSubmissionReport: vi.fn(),
      deleteSubmissionReport: vi.fn(),
      headSubmissionReport: vi.fn(),
      putDocumentArtifact: vi.fn(),
      headDocumentArtifact: vi.fn(),
      getDocumentArtifact: async (_bucket, key) =>
        key === "source.json" ? r2Artifact(source) : r2Artifact(other),
    };
    const dependencies = {
      runRepository: {
        ...analysisRunRepository,
        getAnalysisRunExecutionContext: async () => ({
          id: "run-a",
          competitionId: "competition-a",
          submissionId: "submission-a",
          status: "PROCESSING" as const,
          sourceSha256: sha,
          sourceStorageKey: "source.pdf",
          documentArtifactKey: "source.json",
          templateVersionId: "template-v1",
          rubricVersionId: "rubric-v1",
          templateStructuralProfile: profile,
          projectTitle: "Tarım",
          aiProvider: "OPENAI",
          modelId: "test",
          promptBundleVersion: "v1",
          categorySnapshot: null,
        }),
      },
      checkRepository: { ...analysisCheckRepository, upsertAnalysisChecks: upsertChecks },
      pairRepository: {
        ...similarityPairRepository,
        listEligibleCompetitionRuns: async (
          _db: D1Database,
          competitionId: string,
          excluded: string,
          limit?: number,
        ) => {
          expect({ competitionId, excluded, limit }).toEqual({
            competitionId: "competition-a",
            excluded: "submission-a",
            limit: 20,
          });
          return [
            {
              competitionId: "competition-a",
              submissionId: "submission-b",
              analysisRunId: "run-b",
              applicationCode: "APP-B",
              projectTitle: "Tarım B",
              sourceSha256: sha,
              documentArtifactKey: "other.json",
              templateStructuralProfile: profile,
            },
          ];
        },
        upsertSimilarityPair: upsertPair,
      },
      storage,
      vectorProvider: null,
    };
    await processSimilarityChecks({} as D1Database, {} as R2Bucket, "run-a", dependencies);
    await processSimilarityChecks({} as D1Database, {} as R2Bucket, "run-a", dependencies);
    expect(upsertPair).toHaveBeenCalledTimes(2);
    expect(upsertPair.mock.calls[0]?.[1]).toMatchObject({
      exactDocumentMatch: true,
      level: "HIGH",
      combinedScore: 1,
      mode: "LEXICAL_ONLY",
    });
    expect(upsertChecks.mock.calls[0]?.[2]?.[0]).toMatchObject({
      type: "SIMILARITY",
      status: "WARN",
      details: { level: "HIGH", mode: "LEXICAL_ONLY" },
    });
  });
});

const boilerplateProfile = {
  expectedLanguage: "tr",
  sections: [
    { key: "summary", title: "Proje Özeti", description: "", required: true, order: 1 },
    { key: "problem", title: "Problem Tanımı", description: "", required: true, order: 2 },
    { key: "solution", title: "Çözüm Yaklaşımı", description: "", required: true, order: 3 },
  ],
};

const agriculturalReportBody = [
  "Proje Özeti",
  "Yapay zekâ destekli tarımsal hastalık tespit sistemi yaprak görüntülerini analiz ederek çiftçiye erken uyarı sağlar ve ilaçlama kararını destekler.",
  "Problem Tanımı",
  "Küçük ölçekli üreticiler yaprak hastalıklarını geç fark ettiği için ürün kaybı yaşanmakta ve gereksiz tarım ilacı kullanılmaktadır.",
  "Çözüm Yaklaşımı",
  "Mobil kamera görüntüleri evrişimli sinir ağı ile sınıflandırılır, sonuç çiftçiye Türkçe uyarı olarak iletilir ve tarla bazlı kayıt tutulur.",
].join("\n");

const energyReportBody = [
  "Proje Özeti",
  "Rüzgâr türbini kanat yatağı için mekanik titreşim sönümleyici donanım tasarlanarak bakım aralığı uzatılmakta ve gürültü azaltılmaktadır.",
  "Problem Tanımı",
  "Kanat yatağındaki eksenel salınım rulman ömrünü kısaltmakta, saha bakımı maliyetli olduğu için türbin duruş süreleri artmaktadır.",
  "Çözüm Yaklaşımı",
  "Kademeli yay ve viskoz damper içeren mekanik grup, sonlu elemanlar analiziyle boyutlandırılıp döküm gövdeye entegre edilmektedir.",
].join("\n");

function multiSectionArtifact(
  submissionId: string,
  analysisRunId: string,
  sha: string,
  body: string,
): DocumentExtractionArtifact {
  return {
    schemaVersion: "document-extraction/v1",
    submissionId,
    analysisRunId,
    sourceSha256: sha,
    pageCount: 1,
    characterCount: body.length,
    pages: [{ pageNumber: 1, text: body, characterCount: body.length }],
    warnings: [],
  };
}

function storageStub(artifacts: ReadonlyMap<string, DocumentExtractionArtifact>): DocumentStorage {
  return {
    putSubmissionReport: vi.fn(),
    getSubmissionReport: vi.fn(),
    deleteSubmissionReport: vi.fn(),
    headSubmissionReport: vi.fn(),
    putDocumentArtifact: vi.fn(),
    headDocumentArtifact: vi.fn(),
    getDocumentArtifact: async (_bucket: R2Bucket, key: string) => {
      const value = artifacts.get(key);
      return value ? r2Artifact(value) : null;
    },
  } as unknown as DocumentStorage;
}

describe("configured boilerplate headings", () => {
  const sourceSha = "c".repeat(64);
  const otherSha = "d".repeat(64);

  function dependencies(otherBody: string, capture: { checks: unknown[]; pairs: unknown[] }) {
    const artifacts = new Map<string, DocumentExtractionArtifact>([
      [
        "source.json",
        multiSectionArtifact("submission-a", "run-a", sourceSha, agriculturalReportBody),
      ],
      ["other.json", multiSectionArtifact("submission-b", "run-b", otherSha, otherBody)],
    ]);
    return {
      runRepository: {
        ...analysisRunRepository,
        getAnalysisRunExecutionContext: async () => ({
          id: "run-a",
          competitionId: "competition-a",
          submissionId: "submission-a",
          status: "PROCESSING" as const,
          sourceSha256: sourceSha,
          sourceStorageKey: "source.pdf",
          documentArtifactKey: "source.json",
          templateVersionId: "template-v1",
          rubricVersionId: "rubric-v1",
          templateStructuralProfile: boilerplateProfile,
          projectTitle: "Tarım",
          aiProvider: "OPENAI",
          modelId: "test",
          promptBundleVersion: "v1",
          categorySnapshot: null,
        }),
      },
      checkRepository: {
        ...analysisCheckRepository,
        upsertAnalysisChecks: async (
          _db: D1Database,
          _runId: string,
          checks: readonly AnalysisCheckWriteInput[],
        ) => {
          capture.checks.push(...checks);
        },
      },
      pairRepository: {
        ...similarityPairRepository,
        listEligibleCompetitionRuns: async () => [
          {
            competitionId: "competition-a",
            submissionId: "submission-b",
            analysisRunId: "run-b",
            applicationCode: "APP-B",
            projectTitle: "Enerji B",
            sourceSha256: otherSha,
            documentArtifactKey: "other.json",
            templateStructuralProfile: boilerplateProfile,
          },
        ],
        upsertSimilarityPair: async (_db: D1Database, input: unknown) => {
          capture.pairs.push(input);
        },
      },
      storage: storageStub(artifacts),
      vectorProvider: null,
    };
  }

  it("segments the configured headings and excludes them from the compared bodies", () => {
    const sections = similaritySections({
      competitionId: "competition-a",
      submissionId: "submission-a",
      analysisRunId: "run-a",
      artifact: multiSectionArtifact("submission-a", "run-a", sourceSha, agriculturalReportBody),
      profile: boilerplateProfile,
    });
    expect(sections.map((section) => section.metadata.sectionKey)).toEqual([
      "summary",
      "problem",
      "solution",
    ]);
    for (const section of sections) {
      expect(section.text).not.toContain("Proje Özeti");
      expect(section.text).not.toContain("Problem Tanımı");
      expect(section.text).not.toContain("Çözüm Yaklaşımı");
    }
  });

  it("does not report a misleading HIGH signal when only the configured headings are identical", async () => {
    const capture = { checks: [] as unknown[], pairs: [] as unknown[] };
    await processSimilarityChecks(
      {} as D1Database,
      {} as R2Bucket,
      "run-a",
      dependencies(energyReportBody, capture),
    );
    expect(capture.checks[0]).toMatchObject({
      type: "SIMILARITY",
      status: "PASS",
      details: { level: "LOW", mode: "LEXICAL_ONLY" },
    });
    expect(capture.pairs[0]).toMatchObject({ level: "LOW", exactDocumentMatch: false });
    const pair = capture.pairs[0] as { lexicalScore: number; combinedScore: number };
    expect(pair.lexicalScore).toBeLessThan(SIMILARITY_MEDIUM_THRESHOLD);
    expect(pair.combinedScore).toBeLessThan(SIMILARITY_MEDIUM_THRESHOLD);
  });

  it("still reports a HIGH signal when the substantive bodies really do match", async () => {
    const capture = { checks: [] as unknown[], pairs: [] as unknown[] };
    await processSimilarityChecks(
      {} as D1Database,
      {} as R2Bucket,
      "run-a",
      dependencies(agriculturalReportBody, capture),
    );
    expect(capture.checks[0]).toMatchObject({
      type: "SIMILARITY",
      status: "WARN",
      details: { level: "HIGH" },
    });
    const pair = capture.pairs[0] as { lexicalScore: number; exactDocumentMatch: boolean };
    expect(pair.exactDocumentMatch).toBe(false);
    expect(pair.lexicalScore).toBeGreaterThanOrEqual(SIMILARITY_HIGH_THRESHOLD);
  });
});
