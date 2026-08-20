import {
  type AnalysisCheckWriteInput,
  analysisCheckRepository,
  analysisRunRepository,
  listSubmissionSimilarity,
  similarityPairRepository,
} from "@teknofest-ai/db";
import {
  type DocumentExtractionArtifact,
  MAX_SIMILARITY_CANDIDATES,
  MAX_SIMILARITY_SECTION_MATCHES,
  MAX_SIMILARITY_TOP_MATCHES,
  type SimilarityCheckDetails,
} from "@teknofest-ai/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DocumentStorage } from "../storage/documents";
import {
  createLocalD1,
  type LocalD1,
  type SeedRun,
  type SeedSubmission,
  seedCompetitions,
  similarityPairRows,
  syntheticSha256,
} from "../test-fixtures/local-d1";
import { processSimilarityChecks } from "./similarity";

const CANDIDATE_TOTAL = 25;

const AGRICULTURAL_BODY = [
  "Proje Özeti",
  "Yapay zekâ destekli tarımsal hastalık tespit sistemi yaprak görüntülerini analiz ederek çiftçiye erken uyarı sağlar ve ilaçlama kararını destekler.",
].join("\n");

const ENERGY_BODY = [
  "Proje Özeti",
  "Rüzgâr türbini kanat yatağı için mekanik titreşim sönümleyici donanım tasarlanarak bakım aralığı uzatılmakta ve saha gürültüsü azaltılmaktadır.",
].join("\n");

const sourceProfile = {
  expectedLanguage: "tr" as const,
  sections: [{ key: "summary", title: "Proje Özeti", description: "", required: true, order: 1 }],
};

describe("SIMILARITY_CHECKS candidate cap on the real retrieval path", () => {
  let local: LocalD1;

  afterEach(() => local.close());

  it("processes only the configured maximum of same-competition candidates and stays bounded, deterministic and isolated", async () => {
    local = createLocalD1();
    const sourceSha = syntheticSha256(1);
    const submissions: SeedSubmission[] = [{ id: "submission-source", competition: "a" }];
    const runs: SeedRun[] = [
      {
        id: "run-source",
        submissionId: "submission-source",
        competition: "a",
        sha: sourceSha,
        completedAt: 10_000,
      },
    ];
    const artifacts = new Map<string, DocumentExtractionArtifact>();
    const addArtifact = (
      submissionId: string,
      analysisRunId: string,
      sourceSha256: string,
      text: string,
    ) => {
      artifacts.set(`${analysisRunId}.json`, {
        schemaVersion: "document-extraction/v1",
        submissionId,
        analysisRunId,
        sourceSha256,
        pageCount: 1,
        characterCount: text.length,
        pages: [{ pageNumber: 1, text, characterCount: text.length }],
        warnings: [],
      });
    };
    addArtifact("submission-source", "run-source", sourceSha, AGRICULTURAL_BODY);

    for (let index = 1; index <= CANDIDATE_TOTAL; index += 1) {
      const submissionId = `submission-c${String(index).padStart(2, "0")}`;
      const analysisRunId = `run-${submissionId}`;
      const candidateSha = syntheticSha256(100 + index);
      submissions.push({ id: submissionId, competition: "a" });
      runs.push({
        id: analysisRunId,
        submissionId,
        competition: "a",
        sha: candidateSha,
        completedAt: 1_000 + index,
      });
      addArtifact(
        submissionId,
        analysisRunId,
        candidateSha,
        index <= 8 ? AGRICULTURAL_BODY : ENERGY_BODY,
      );
    }

    // Another competition holding a byte-identical document must never surface.
    submissions.push({ id: "submission-b1", competition: "b" });
    runs.push({
      id: "run-b1",
      submissionId: "submission-b1",
      competition: "b",
      sha: sourceSha,
      completedAt: 9_999,
    });
    addArtifact("submission-b1", "run-b1", sourceSha, AGRICULTURAL_BODY);

    seedCompetitions(local, runs, submissions);

    const checks: AnalysisCheckWriteInput[] = [];
    const dependencies = {
      runRepository: {
        ...analysisRunRepository,
        getAnalysisRunExecutionContext: async () => ({
          id: "run-source",
          competitionId: "competition-a",
          submissionId: "submission-source",
          status: "PROCESSING" as const,
          sourceSha256: sourceSha,
          sourceStorageKey: "source.pdf",
          documentArtifactKey: "run-source.json",
          templateVersionId: "template-a",
          templateStructuralProfile: sourceProfile,
          projectTitle: "Kaynak",
          aiProvider: "OPENAI",
          modelId: "test",
          promptBundleVersion: "v1",
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
      // The real repository runs against the real generated schema.
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
      vectorProvider: null,
    };

    await processSimilarityChecks(local.binding, {} as R2Bucket, "run-source", dependencies);

    expect(CANDIDATE_TOTAL).toBeGreaterThan(MAX_SIMILARITY_CANDIDATES);
    const details = checks[0]?.details as SimilarityCheckDetails;
    expect(details.candidateCount).toBe(MAX_SIMILARITY_CANDIDATES);
    expect(details.topMatches.length).toBeLessThanOrEqual(MAX_SIMILARITY_TOP_MATCHES);
    for (const match of details.topMatches) {
      expect(match.sectionMatches.length).toBeLessThanOrEqual(MAX_SIMILARITY_SECTION_MATCHES);
      expect(match.exactDocumentMatch).toBe(false);
    }

    // Exactly one persisted observation per processed candidate: no unbounded all-vs-all path.
    const persisted = similarityPairRows(local);
    expect(persisted).toHaveLength(MAX_SIMILARITY_CANDIDATES);
    expect(persisted.every((row) => row.competition_id === "competition-a")).toBe(true);
    const involved = new Set(
      persisted.flatMap((row) => [row.submission_a_id, row.submission_b_id]),
    );
    expect(involved.has("submission-b1")).toBe(false);
    expect(details.topMatches.map((match) => match.otherSubmissionId)).not.toContain(
      "submission-b1",
    );

    // A retry reconciles the same run pairs instead of creating duplicate historical rows.
    const identityBefore = persisted
      .map((row) => `${row.analysis_run_a_id}/${row.analysis_run_b_id}`)
      .sort();
    await processSimilarityChecks(local.binding, {} as R2Bucket, "run-source", dependencies);
    const afterRetry = similarityPairRows(local);
    expect(afterRetry).toHaveLength(MAX_SIMILARITY_CANDIDATES);
    expect(afterRetry.map((row) => row.id)).toEqual(persisted.map((row) => row.id));
    expect(
      afterRetry.map((row) => `${row.analysis_run_a_id}/${row.analysis_run_b_id}`).sort(),
    ).toEqual(identityBefore);

    const retryDetails = checks[1]?.details as SimilarityCheckDetails;
    expect(retryDetails.candidateCount).toBe(MAX_SIMILARITY_CANDIDATES);
    expect(retryDetails.topMatches.map((match) => match.otherSubmissionId)).toEqual(
      details.topMatches.map((match) => match.otherSubmissionId),
    );

    // The submission-level current view stays bounded and competition-scoped.
    const current = await listSubmissionSimilarity(
      local.binding,
      "competition-a",
      "submission-source",
    );
    expect(current.analysisRunId).toBe("run-source");
    expect(current.pairs.length).toBeLessThanOrEqual(MAX_SIMILARITY_TOP_MATCHES);
    expect(current.pairs.every((pair) => pair.otherSubmission.id !== "submission-b1")).toBe(true);
  });
});
