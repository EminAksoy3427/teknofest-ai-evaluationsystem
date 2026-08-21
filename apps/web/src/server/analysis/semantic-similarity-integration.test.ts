import {
  type AnalysisCheckWriteInput,
  analysisCheckRepository,
  analysisRunRepository,
  similarityPairRepository,
} from "@teknofest-ai/db";
import {
  type DocumentExtractionArtifact,
  MAX_SIMILARITY_CANDIDATES,
  MAX_SIMILARITY_TOP_MATCHES,
  SIMILARITY_MEDIUM_THRESHOLD,
  type SimilarityCheckDetails,
} from "@teknofest-ai/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DocumentStorage } from "../storage/documents";
import {
  FailingSimilarityVectorProvider,
  FakeSimilarityVectorProvider,
} from "../test-fixtures/fake-similarity-vector-provider";
import {
  createLocalD1,
  type LocalD1,
  type SeedRun,
  type SeedSubmission,
  seedCompetitions,
  similarityPairRows,
  syntheticSha256,
} from "../test-fixtures/local-d1";
import {
  openAINetworkAttemptCount,
  resetOpenAINetworkGuard,
} from "../test-fixtures/openai-network-guard";
import { processSimilarityChecks } from "./similarity";
import type { SimilarityVectorProvider } from "./similarity-vector-provider";

const HEADINGS = ["Proje Özeti", "Problem Tanımı", "Çözüm Yaklaşımı"];

function report(...bodies: readonly string[]): string {
  return HEADINGS.flatMap((heading, index) => [heading, bodies[index] ?? bodies[0] ?? ""]).join(
    "\n",
  );
}

const AGRI_BODY = [
  "Yapay zekâ destekli tarımsal hastalık tespit sistemi yaprak görüntülerini analiz ederek çiftçiye erken uyarı sağlar.",
  "Üreticiler yaprak hastalığını geç fark ettiği için ürün kaybı yaşanır ve gereksiz zirai ilaç kullanılır.",
  "Mobil kamera görüntüleri evrişimli sinir ağı ile sınıflandırılır ve çiftçiye Türkçe uyarı iletilir.",
];

// Same solution, materially different wording: shares almost no 5-token shingle with AGRI_BODY.
const AGRI_PARAPHRASE_BODY = [
  "Evrişimli sinir ağı modeli bitki yaprağı fotoğraflarını sınıflandırarak zirai patojen saptama ve erken uyarı üretir.",
  "Mahsul yetiştiren üretici, bitki enfeksiyonunu vaktinde teşhis edemediğinde hasat kaybı ve fazla ilaçlama oluşur.",
  "Sera içindeki optik görsel veriler derin öğrenme algoritması ile değerlendirilip tarla bazlı uyarı kaydı tutulur.",
];

const ENERGY_BODY = [
  "Rüzgâr türbini kanat yatağı için mekanik titreşim sönümleyici donanım tasarlanarak bakım aralığı uzatılır.",
  "Kanat yatağındaki eksenel salınım rulman ömrünü kısaltır ve saha bakımı türbin duruş süresini artırır.",
  "Kademeli yay ve viskoz damper içeren mekanik grup sonlu elemanlar analiziyle boyutlandırılıp döküm gövdeye entegre edilir.",
];

const PROFILE = {
  expectedLanguage: "tr" as const,
  sections: [
    { key: "summary", title: "Proje Özeti", description: "", required: true, order: 1 },
    { key: "problem", title: "Problem Tanımı", description: "", required: true, order: 2 },
    { key: "solution", title: "Çözüm Yaklaşımı", description: "", required: true, order: 3 },
  ],
};

interface Scenario {
  local: LocalD1;
  checks: AnalysisCheckWriteInput[];
  run(provider: SimilarityVectorProvider | null): Promise<void>;
}

interface RunFixture {
  runId: string;
  submissionId: string;
  competition: "a" | "b";
  sha: string;
  body: readonly string[];
  completedAt: number;
}

function artifactFor(fixture: RunFixture): DocumentExtractionArtifact {
  const text = report(...fixture.body);
  return {
    schemaVersion: "document-extraction/v1",
    submissionId: fixture.submissionId,
    analysisRunId: fixture.runId,
    sourceSha256: fixture.sha,
    pageCount: 1,
    characterCount: text.length,
    pages: [{ pageNumber: 1, text, characterCount: text.length }],
    warnings: [],
  };
}

/**
 * Builds a synthetic competition world on the real generated schema and returns a driver that
 * executes the production similarity stage for `sourceRunId` with whichever semantic provider the
 * test supplies. The real repository is used, so persisted cardinality and historical identity are
 * exercised, not mocked.
 */
function scenario(fixtures: readonly RunFixture[], sourceRunId: string): Scenario {
  const local = createLocalD1();
  const submissions = new Map<string, SeedSubmission>();
  const runs: SeedRun[] = [];
  const artifacts = new Map<string, DocumentExtractionArtifact>();
  for (const fixture of fixtures) {
    submissions.set(fixture.submissionId, {
      id: fixture.submissionId,
      competition: fixture.competition,
    });
    runs.push({
      id: fixture.runId,
      submissionId: fixture.submissionId,
      competition: fixture.competition,
      sha: fixture.sha,
      completedAt: fixture.completedAt,
    });
    artifacts.set(`${fixture.runId}.json`, artifactFor(fixture));
  }
  // The candidate documents must be segmented with the same profile the source run is analysed
  // with, otherwise a candidate's first section would swallow the whole document.
  seedCompetitions(local, runs, [...submissions.values()], JSON.stringify(PROFILE));

  const source = fixtures.find((fixture) => fixture.runId === sourceRunId);
  if (!source) throw new Error(`unknown source run ${sourceRunId}`);
  const checks: AnalysisCheckWriteInput[] = [];

  const dependencies = (vectorProvider: SimilarityVectorProvider | null) => ({
    runRepository: {
      ...analysisRunRepository,
      getAnalysisRunExecutionContext: async () => ({
        id: source.runId,
        competitionId: `competition-${source.competition}`,
        submissionId: source.submissionId,
        status: "PROCESSING" as const,
        sourceSha256: source.sha,
        sourceStorageKey: "source.pdf",
        documentArtifactKey: `${source.runId}.json`,
        templateVersionId: `template-${source.competition}`,
        rubricVersionId: `rubric-${source.competition}`,
        templateStructuralProfile: PROFILE,
        projectTitle: "Kaynak",
        aiProvider: "OPENAI",
        modelId: "gpt-5-test",
        promptBundleVersion: "semantic-checks/v1",
        categorySnapshot: null,
      }),
    },
    checkRepository: {
      ...analysisCheckRepository,
      upsertAnalysisChecks: async (
        _database: D1Database,
        _analysisRunId: string,
        written: readonly AnalysisCheckWriteInput[],
      ) => {
        checks.push(...written);
      },
    },
    pairRepository: similarityPairRepository,
    storage: {
      putSubmissionReport: vi.fn(),
      getSubmissionReport: vi.fn(),
      deleteSubmissionReport: vi.fn(),
      headSubmissionReport: vi.fn(),
      putDocumentArtifact: vi.fn(),
      headDocumentArtifact: vi.fn(),
      getDocumentArtifact: async (_bucket: R2Bucket, key: string) => {
        const value = artifacts.get(key);
        return value ? ({ text: async () => JSON.stringify(value) } as R2ObjectBody) : null;
      },
    } as unknown as DocumentStorage,
    vectorProvider,
  });

  return {
    local,
    checks,
    run: async (provider) => {
      await processSimilarityChecks(
        local.binding,
        {} as R2Bucket,
        source.runId,
        dependencies(provider),
      );
    },
  };
}

function details(checks: readonly AnalysisCheckWriteInput[], index = 0): SimilarityCheckDetails {
  return checks[index]?.details as SimilarityCheckDetails;
}

/** Pre-indexes the candidate runs, mirroring production where each run indexes its own sections. */
async function indexCandidates(
  provider: FakeSimilarityVectorProvider,
  fixtures: readonly RunFixture[],
  exceptRunId: string,
): Promise<void> {
  const { similaritySections } = await import("./similarity");
  for (const fixture of fixtures) {
    if (fixture.runId === exceptRunId) continue;
    await provider.indexSections(
      `competition-${fixture.competition}`,
      similaritySections({
        competitionId: `competition-${fixture.competition}`,
        submissionId: fixture.submissionId,
        analysisRunId: fixture.runId,
        artifact: artifactFor(fixture),
        profile: PROFILE,
      }),
    );
  }
}

describe("hybrid similarity acceptance cases", () => {
  let active: LocalD1 | null = null;

  afterEach(() => {
    active?.close();
    active = null;
    resetOpenAINetworkGuard();
  });

  const sourceFixture: RunFixture = {
    runId: "run-source",
    submissionId: "submission-source",
    competition: "a",
    sha: syntheticSha256(1),
    body: AGRI_BODY,
    completedAt: 9_000,
  };

  async function runCase(candidateBody: readonly string[], candidateSha = syntheticSha256(2)) {
    const candidate: RunFixture = {
      runId: "run-candidate",
      submissionId: "submission-candidate",
      competition: "a",
      sha: candidateSha,
      body: candidateBody,
      completedAt: 1_000,
    };
    const fixtures = [sourceFixture, candidate];
    const lexicalOnly = scenario(fixtures, "run-source");
    active = lexicalOnly.local;
    await lexicalOnly.run(null);
    const lexicalDetails = details(lexicalOnly.checks);
    lexicalOnly.local.close();

    const hybrid = scenario(fixtures, "run-source");
    active = hybrid.local;
    const provider = new FakeSimilarityVectorProvider();
    await indexCandidates(provider, fixtures, "run-source");
    await hybrid.run(provider);
    return { lexicalDetails, hybridDetails: details(hybrid.checks), hybrid, provider };
  }

  it("Case A: a semantic paraphrase raises the hybrid signal well above the lexical one", async () => {
    const { lexicalDetails, hybridDetails } = await runCase(AGRI_PARAPHRASE_BODY);
    const lexicalMatch = lexicalDetails.topMatches[0];
    const hybridMatch = hybridDetails.topMatches[0];

    // Lexical alone barely notices the paraphrase.
    expect(lexicalDetails.mode).toBe("LEXICAL_ONLY");
    expect(lexicalDetails.semanticStatus).toBe("DISABLED");
    expect(lexicalMatch?.lexicalScore ?? 0).toBeLessThan(SIMILARITY_MEDIUM_THRESHOLD);
    expect(lexicalMatch?.semanticScore ?? null).toBeNull();

    // Semantic analysis recognises it and the hybrid score rises meaningfully.
    expect(hybridDetails.mode).toBe("HYBRID");
    expect(hybridDetails.semanticStatus).toBe("AVAILABLE");
    expect(hybridMatch?.semanticScore ?? 0).toBeGreaterThan(0.6);
    expect(hybridMatch?.combinedScore ?? 0).toBeGreaterThan(
      (lexicalMatch?.combinedScore ?? 0) + 0.2,
    );
    // Evidence explains both halves of the signal.
    expect(hybridMatch?.sectionMatches.length ?? 0).toBeGreaterThan(0);
    expect(hybridMatch?.sectionMatches.some((match) => (match.semanticScore ?? 0) > 0)).toBe(true);
  });

  it("Case B: identical generic headings with unrelated bodies stay below the warning threshold", async () => {
    const { hybridDetails } = await runCase(ENERGY_BODY);
    const match = hybridDetails.topMatches[0];
    expect(hybridDetails.level).toBe("LOW");
    expect(hybridDetails.mode).toBe("HYBRID");
    expect(match?.lexicalScore ?? 0).toBeLessThan(SIMILARITY_MEDIUM_THRESHOLD);
    expect(match?.semanticScore ?? 0).toBeLessThan(SIMILARITY_MEDIUM_THRESHOLD);
    expect(match?.combinedScore ?? 0).toBeLessThan(SIMILARITY_MEDIUM_THRESHOLD);
  });

  it("Case C: genuine lexical and semantic overlap produces a strong signal with evidence", async () => {
    const { hybridDetails } = await runCase(AGRI_BODY);
    const match = hybridDetails.topMatches[0];
    expect(hybridDetails.level).toBe("HIGH");
    expect(hybridDetails.semanticStatus).toBe("AVAILABLE");
    expect(match?.exactDocumentMatch).toBe(false);
    expect(match?.lexicalScore ?? 0).toBeGreaterThan(0.7);
    expect(match?.semanticScore ?? 0).toBeGreaterThan(0.7);
    expect(match?.sectionMatches.length ?? 0).toBeGreaterThan(0);
  });

  it("Case D: an exact document duplicate stays HIGH/WARN and semantics cannot downgrade it", async () => {
    const { hybridDetails, hybrid } = await runCase(ENERGY_BODY, sourceFixture.sha);
    const match = hybridDetails.topMatches[0];
    expect(match?.exactDocumentMatch).toBe(true);
    expect(match?.lexicalScore).toBe(1);
    expect(match?.combinedScore).toBe(1);
    expect(hybridDetails.level).toBe("HIGH");
    expect(hybrid.checks[0]?.status).toBe("WARN");
    expect(hybrid.checks[0]?.summary).toMatch(/Uzman incelemesi önerilir/u);
    expect(hybrid.checks[0]?.summary).not.toMatch(/İntihal|Kopya|Hile|Diskalifiye/iu);
    expect(similarityPairRows(hybrid.local)[0]?.combined_score).toBe(1);
  });

  it("makes no OpenAI network request during semantic similarity", async () => {
    await runCase(AGRI_PARAPHRASE_BODY);
    expect(openAINetworkAttemptCount()).toBe(0);
  });
});

describe("semantic similarity isolation and history", () => {
  let active: LocalD1 | null = null;
  afterEach(() => {
    active?.close();
    active = null;
  });

  it("never surfaces a semantically identical candidate from another competition", async () => {
    const fixtures: RunFixture[] = [
      {
        runId: "run-source",
        submissionId: "submission-source",
        competition: "a",
        sha: syntheticSha256(1),
        body: AGRI_BODY,
        completedAt: 9_000,
      },
      {
        runId: "run-a-candidate",
        submissionId: "submission-a-candidate",
        competition: "a",
        sha: syntheticSha256(2),
        body: ENERGY_BODY,
        completedAt: 1_000,
      },
      // Byte-identical AND semantically identical, but in competition B. If isolation were broken
      // this would be the single strongest match and an exact-document hit.
      {
        runId: "run-b-leak",
        submissionId: "submission-b-leak",
        competition: "b",
        sha: syntheticSha256(1),
        body: AGRI_BODY,
        completedAt: 8_000,
      },
    ];
    const built = scenario(fixtures, "run-source");
    active = built.local;
    const provider = new FakeSimilarityVectorProvider();
    // The leaking competition-B vectors are genuinely present in the store.
    await indexCandidates(provider, fixtures, "run-source");
    expect(provider.vectorCount()).toBeGreaterThan(3);
    await built.run(provider);

    const detail = details(built.checks);
    expect(detail.candidateCount).toBe(1);
    expect(detail.topMatches.map((match) => match.otherSubmissionId)).toEqual([
      "submission-a-candidate",
    ]);
    expect(detail.topMatches.some((match) => match.exactDocumentMatch)).toBe(false);
    expect(JSON.stringify(detail)).not.toContain("submission-b-leak");
    const rows = similarityPairRows(built.local);
    expect(rows).toHaveLength(1);
    expect(rows.every((row) => row.competition_id === "competition-a")).toBe(true);
    const involved = new Set(rows.flatMap((row) => [row.submission_a_id, row.submission_b_id]));
    expect(involved.has("submission-b-leak")).toBe(false);
  });

  it("keeps A1/B1, A2/B1, A1/B2 and A2/B2 as separate historical observations under semantics", async () => {
    const base = {
      competition: "a" as const,
      body: AGRI_BODY,
    };
    const all: RunFixture[] = [
      {
        runId: "run-a1",
        submissionId: "submission-a",
        sha: syntheticSha256(11),
        completedAt: 10,
        ...base,
      },
      {
        runId: "run-a2",
        submissionId: "submission-a",
        sha: syntheticSha256(12),
        completedAt: 40,
        ...base,
      },
      {
        runId: "run-b1",
        submissionId: "submission-b",
        sha: syntheticSha256(21),
        completedAt: 20,
        ...base,
      },
      {
        runId: "run-b2",
        submissionId: "submission-b",
        sha: syntheticSha256(22),
        completedAt: 30,
        ...base,
      },
    ];

    // Only the latest run per submission is an eligible candidate, so drive four separate worlds
    // that each expose exactly one historical run pair, as production does over time.
    const combinations: Array<[string, string]> = [
      ["run-a1", "run-b1"],
      ["run-a2", "run-b1"],
      ["run-a1", "run-b2"],
      ["run-a2", "run-b2"],
    ];
    const observed: string[] = [];
    for (const [sourceRunId, candidateRunId] of combinations) {
      const fixtures = all.filter(
        (fixture) => fixture.runId === sourceRunId || fixture.runId === candidateRunId,
      );
      const built = scenario(fixtures, sourceRunId);
      const provider = new FakeSimilarityVectorProvider();
      await indexCandidates(provider, fixtures, sourceRunId);
      await built.run(provider);
      const rows = similarityPairRows(built.local);
      expect(rows).toHaveLength(1);
      observed.push(`${rows[0]?.analysis_run_a_id}/${rows[0]?.analysis_run_b_id}`);
      expect(details(built.checks).semanticStatus).toBe("AVAILABLE");
      built.local.close();
    }
    // Canonical side ordering keeps submission-a on side A, and every run pair is distinct.
    expect(observed.sort()).toEqual([
      "run-a1/run-b1",
      "run-a1/run-b2",
      "run-a2/run-b1",
      "run-a2/run-b2",
    ]);
  });

  it("never lets a newer AnalysisRun inherit an older run's semantic score", async () => {
    const fixtures: RunFixture[] = [
      {
        runId: "run-source",
        submissionId: "submission-source",
        competition: "a",
        sha: syntheticSha256(1),
        body: AGRI_BODY,
        completedAt: 9_000,
      },
      // Latest eligible candidate run: unrelated content.
      {
        runId: "run-candidate-new",
        submissionId: "submission-candidate",
        competition: "a",
        sha: syntheticSha256(3),
        body: ENERGY_BODY,
        completedAt: 2_000,
      },
      // Older run of the SAME submission with content identical to the source. Its vector exists,
      // but it is not the eligible candidate, so it must not contribute a semantic score.
      {
        runId: "run-candidate-old",
        submissionId: "submission-candidate",
        competition: "a",
        sha: syntheticSha256(4),
        body: AGRI_BODY,
        completedAt: 1_000,
      },
    ];
    const built = scenario(fixtures, "run-source");
    active = built.local;
    const provider = new FakeSimilarityVectorProvider();
    await indexCandidates(provider, fixtures, "run-source");
    await built.run(provider);

    const detail = details(built.checks);
    expect(detail.candidateCount).toBe(1);
    const match = detail.topMatches[0];
    expect(match?.otherAnalysisRunId).toBe("run-candidate-new");
    // The stale run's strong similarity must not float forward onto the newer run.
    expect(match?.semanticScore ?? 0).toBeLessThan(SIMILARITY_MEDIUM_THRESHOLD);
    expect(detail.level).toBe("LOW");
    const rows = similarityPairRows(built.local);
    expect(rows).toHaveLength(1);
    expect([rows[0]?.analysis_run_a_id, rows[0]?.analysis_run_b_id]).toContain("run-candidate-new");
    expect([rows[0]?.analysis_run_a_id, rows[0]?.analysis_run_b_id]).not.toContain(
      "run-candidate-old",
    );
  });

  it("is retry-idempotent for pairs, vectors and persisted identity", async () => {
    const fixtures: RunFixture[] = [
      {
        runId: "run-source",
        submissionId: "submission-source",
        competition: "a",
        sha: syntheticSha256(1),
        body: AGRI_BODY,
        completedAt: 9_000,
      },
      {
        runId: "run-candidate",
        submissionId: "submission-candidate",
        competition: "a",
        sha: syntheticSha256(2),
        body: AGRI_PARAPHRASE_BODY,
        completedAt: 1_000,
      },
    ];
    const built = scenario(fixtures, "run-source");
    active = built.local;
    const provider = new FakeSimilarityVectorProvider();
    await indexCandidates(provider, fixtures, "run-source");

    await built.run(provider);
    const first = similarityPairRows(built.local);
    const vectorsAfterFirst = provider.vectorIds();

    await built.run(provider);
    const second = similarityPairRows(built.local);

    expect(second).toHaveLength(first.length);
    expect(second.map((row) => row.id)).toEqual(first.map((row) => row.id));
    expect(second.map((row) => `${row.analysis_run_a_id}/${row.analysis_run_b_id}`)).toEqual(
      first.map((row) => `${row.analysis_run_a_id}/${row.analysis_run_b_id}`),
    );
    expect(second[0]?.created_at).toBe(first[0]?.created_at);
    expect(second[0]?.combined_score).toBe(first[0]?.combined_score);
    // Deterministic provider input yields deterministic persisted output.
    expect(details(built.checks, 1)).toEqual(details(built.checks, 0));
    // No duplicate logical vectors: the source run rewrote its own deterministic ids.
    expect(provider.vectorIds()).toEqual(vectorsAfterFirst);
  });

  it("keeps the candidate cap and persisted cardinality with semantics enabled", async () => {
    const fixtures: RunFixture[] = [
      {
        runId: "run-source",
        submissionId: "submission-source",
        competition: "a",
        sha: syntheticSha256(1),
        body: AGRI_BODY,
        completedAt: 90_000,
      },
    ];
    for (let index = 1; index <= 25; index += 1) {
      fixtures.push({
        runId: `run-c${String(index).padStart(2, "0")}`,
        submissionId: `submission-c${String(index).padStart(2, "0")}`,
        competition: "a",
        sha: syntheticSha256(100 + index),
        body: index <= 8 ? AGRI_PARAPHRASE_BODY : ENERGY_BODY,
        completedAt: 1_000 + index,
      });
    }
    const built = scenario(fixtures, "run-source");
    active = built.local;
    const provider = new FakeSimilarityVectorProvider();
    await indexCandidates(provider, fixtures, "run-source");
    await built.run(provider);

    const detail = details(built.checks);
    expect(detail.candidateCount).toBe(MAX_SIMILARITY_CANDIDATES);
    expect(detail.topMatches.length).toBeLessThanOrEqual(MAX_SIMILARITY_TOP_MATCHES);
    // Still one persisted observation per processed candidate: no all-vs-all regression.
    expect(similarityPairRows(built.local)).toHaveLength(MAX_SIMILARITY_CANDIDATES);
  });
});

describe("semantic similarity degraded modes", () => {
  let active: LocalD1 | null = null;
  afterEach(() => {
    active?.close();
    active = null;
    resetOpenAINetworkGuard();
  });

  const fixtures: RunFixture[] = [
    {
      runId: "run-source",
      submissionId: "submission-source",
      competition: "a",
      sha: syntheticSha256(1),
      body: AGRI_BODY,
      completedAt: 9_000,
    },
    {
      runId: "run-candidate",
      submissionId: "submission-candidate",
      competition: "a",
      sha: syntheticSha256(2),
      body: AGRI_PARAPHRASE_BODY,
      completedAt: 1_000,
    },
  ];

  it("with no provider stays lexical-only, fabricates no semantic score and makes no network call", async () => {
    const built = scenario(fixtures, "run-source");
    active = built.local;
    await built.run(null);
    const detail = details(built.checks);
    expect(detail.mode).toBe("LEXICAL_ONLY");
    expect(detail.semanticStatus).toBe("DISABLED");
    expect(detail.topMatches.every((match) => match.semanticScore === null)).toBe(true);
    expect(similarityPairRows(built.local).every((row) => row.combined_score < 1)).toBe(true);
    expect(
      built.local.query<{ mode: string; semantic_score: number | null }>(
        "SELECT mode, semantic_score FROM similarity_pair",
      ),
    ).toEqual([{ mode: "LEXICAL_ONLY", semantic_score: null }]);
    expect(openAINetworkAttemptCount()).toBe(0);
  });

  it("with a failing provider degrades safely and is never mislabelled as successful hybrid", async () => {
    const built = scenario(fixtures, "run-source");
    active = built.local;
    const failing = new FailingSimilarityVectorProvider();
    await built.run(failing);

    const detail = details(built.checks);
    expect(failing.callCount()).toBeGreaterThan(0);
    expect(detail.semanticStatus).toBe("DEGRADED");
    expect(detail.mode).toBe("LEXICAL_ONLY");
    expect(detail.topMatches.every((match) => match.semanticScore === null)).toBe(true);
    // The AnalysisRun is not corrupted: the check still exists and the pair is still persisted.
    expect(built.checks).toHaveLength(1);
    expect(similarityPairRows(built.local)).toHaveLength(1);
    expect(built.local.query<{ mode: string }>("SELECT mode FROM similarity_pair")[0]?.mode).toBe(
      "LEXICAL_ONLY",
    );
  });

  it("reports DEGRADED when the provider runs but yields no usable semantic match", async () => {
    const built = scenario(fixtures, "run-source");
    active = built.local;
    // An empty index: the provider works, but nothing is retrievable yet. This is the eventual
    // consistency case for a candidate whose own run only just completed.
    const empty = new FakeSimilarityVectorProvider();
    await built.run(empty);
    const detail = details(built.checks);
    expect(empty.queryCallCount()).toBeGreaterThan(0);
    expect(detail.semanticStatus).toBe("DEGRADED");
    expect(detail.mode).toBe("LEXICAL_ONLY");
    expect(detail.topMatches.every((match) => match.semanticScore === null)).toBe(true);
  });
});

describe("production composition never reaches a test fixture", () => {
  const modules = import.meta.glob("../../**/*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;

  it("has no production module importing from test-fixtures", () => {
    const offenders: string[] = [];
    for (const [path, source] of Object.entries(modules)) {
      const isTest = /\.test\.tsx?$/.test(path);
      const isFixture = path.includes("/test-fixtures/");
      if (isTest || isFixture) continue;
      for (const match of source.matchAll(/from\s+["']([^"']+)["']/g)) {
        if (match[1]?.includes("test-fixtures")) offenders.push(`${path} -> ${match[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("scanned a meaningful number of production modules", () => {
    // Control: proves the glob actually resolved sources, so an empty offender list means
    // isolation rather than an empty scan.
    const production = Object.keys(modules).filter(
      (path) => !/\.test\.tsx?$/.test(path) && !path.includes("/test-fixtures/"),
    );
    expect(production.length).toBeGreaterThan(20);
    expect(Object.keys(modules).some((path) => path.includes("/test-fixtures/"))).toBe(true);
  });
});
