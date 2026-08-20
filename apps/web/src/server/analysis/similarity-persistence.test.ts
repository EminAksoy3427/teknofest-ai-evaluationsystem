import {
  canonicalSimilarityPairIdentity,
  listAnalysisRunSimilarity,
  listEligibleCompetitionRuns,
  listSubmissionSimilarity,
  upsertSimilarityPair,
} from "@teknofest-ai/db";
import { MAX_SIMILARITY_CANDIDATES } from "@teknofest-ai/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createLocalD1,
  type LocalD1,
  migrationChain,
  type SeedRun,
  type SeedSubmission,
  seedCompetitions,
  similarityPairRows,
} from "../test-fixtures/local-d1";

const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);

function writeInput(
  sourceSubmissionId: string,
  otherSubmissionId: string,
  sourceAnalysisRunId: string,
  otherAnalysisRunId: string,
  combinedScore: number,
) {
  return {
    competitionId: "competition-a",
    sourceSubmissionId,
    otherSubmissionId,
    sourceAnalysisRunId,
    otherAnalysisRunId,
    lexicalScore: combinedScore,
    semanticScore: null,
    combinedScore,
    mode: "LEXICAL_ONLY" as const,
    level: "MEDIUM" as const,
    exactDocumentMatch: false,
    evidence: [],
  };
}

describe("SimilarityPair historical identity", () => {
  let local: LocalD1;

  beforeEach(() => {
    local = createLocalD1();
    seedCompetitions(
      local,
      [
        {
          id: "run-a1",
          submissionId: "submission-a",
          competition: "a",
          sha: SHA_A,
          completedAt: 10,
        },
        {
          id: "run-a2",
          submissionId: "submission-a",
          competition: "a",
          sha: SHA_A,
          completedAt: 20,
        },
        {
          id: "run-b1",
          submissionId: "submission-b",
          competition: "a",
          sha: SHA_B,
          completedAt: 11,
        },
        {
          id: "run-b2",
          submissionId: "submission-b",
          competition: "a",
          sha: SHA_B,
          completedAt: 21,
        },
      ],
      [
        { id: "submission-a", competition: "a" },
        { id: "submission-b", competition: "a" },
      ],
    );
  });

  afterEach(() => local.close());

  it("creates one observation for A1/B1 and keeps a same-run retry idempotent without touching identity", async () => {
    await upsertSimilarityPair(
      local.binding,
      writeInput("submission-a", "submission-b", "run-a1", "run-b1", 0.4),
    );
    const [created] = similarityPairRows(local);
    expect(similarityPairRows(local)).toHaveLength(1);
    expect(created).toMatchObject({
      submission_a_id: "submission-a",
      submission_b_id: "submission-b",
      analysis_run_a_id: "run-a1",
      analysis_run_b_id: "run-b1",
    });

    await upsertSimilarityPair(
      local.binding,
      writeInput("submission-a", "submission-b", "run-a1", "run-b1", 0.6),
    );
    const rows = similarityPairRows(local);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(created?.id);
    expect(rows[0]).toMatchObject({
      competition_id: created?.competition_id,
      submission_a_id: created?.submission_a_id,
      submission_b_id: created?.submission_b_id,
      analysis_run_a_id: "run-a1",
      analysis_run_b_id: "run-b1",
      created_at: created?.created_at,
    });
    expect(rows[0]?.combined_score).toBe(0.6);
  });

  it("resolves reversed input to the same canonical observation with aligned run identities", async () => {
    await upsertSimilarityPair(
      local.binding,
      writeInput("submission-a", "submission-b", "run-a1", "run-b1", 0.4),
    );
    await upsertSimilarityPair(
      local.binding,
      writeInput("submission-b", "submission-a", "run-b1", "run-a1", 0.5),
    );
    const rows = similarityPairRows(local);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      submission_a_id: "submission-a",
      analysis_run_a_id: "run-a1",
      submission_b_id: "submission-b",
      analysis_run_b_id: "run-b1",
      combined_score: 0.5,
    });
  });

  it("creates a new historical row for every different run combination and never mutates older ones", async () => {
    await upsertSimilarityPair(
      local.binding,
      writeInput("submission-a", "submission-b", "run-a1", "run-b1", 0.4),
    );
    const firstId = similarityPairRows(local)[0]?.id;

    await upsertSimilarityPair(
      local.binding,
      writeInput("submission-a", "submission-b", "run-a2", "run-b1", 0.5),
    );
    await upsertSimilarityPair(
      local.binding,
      writeInput("submission-a", "submission-b", "run-a1", "run-b2", 0.6),
    );
    await upsertSimilarityPair(
      local.binding,
      writeInput("submission-a", "submission-b", "run-a2", "run-b2", 0.7),
    );

    const rows = similarityPairRows(local);
    expect(rows).toHaveLength(4);
    expect(rows.map((row) => `${row.analysis_run_a_id}/${row.analysis_run_b_id}`).sort()).toEqual([
      "run-a1/run-b1",
      "run-a1/run-b2",
      "run-a2/run-b1",
      "run-a2/run-b2",
    ]);

    const original = rows.find((row) => row.id === firstId);
    expect(original).toMatchObject({
      analysis_run_a_id: "run-a1",
      analysis_run_b_id: "run-b1",
      combined_score: 0.4,
    });
  });

  it("rejects a self pair and an inverse-ordered row at the database boundary", async () => {
    await expect(
      upsertSimilarityPair(
        local.binding,
        writeInput("submission-a", "submission-a", "run-a1", "run-a2", 0.4),
      ),
    ).rejects.toThrow(/kendisiyle/u);
    expect(() =>
      local.exec(`INSERT INTO similarity_pair (
        id, competition_id, submission_a_id, submission_b_id, analysis_run_a_id, analysis_run_b_id,
        lexical_score, semantic_score, combined_score, mode, level, exact_document_match, evidence_json
      ) VALUES ('inverse', 'competition-a', 'submission-b', 'submission-a', 'run-b1', 'run-a1',
        0.4, null, 0.4, 'LEXICAL_ONLY', 'MEDIUM', 0, '[]')`),
    ).toThrow(/CHECK constraint failed/u);
    expect(similarityPairRows(local)).toHaveLength(0);
  });

  it("keeps a historical AnalysisRun query pinned to that run and derives the submission view from the current run", async () => {
    await upsertSimilarityPair(
      local.binding,
      writeInput("submission-a", "submission-b", "run-a1", "run-b1", 0.4),
    );
    await upsertSimilarityPair(
      local.binding,
      writeInput("submission-a", "submission-b", "run-a2", "run-b1", 0.9),
    );

    const historical = await listAnalysisRunSimilarity(local.binding, "competition-a", "run-a1");
    expect(historical).toHaveLength(1);
    expect(historical[0]).toMatchObject({
      analysisRunAId: "run-a1",
      analysisRunBId: "run-b1",
      combinedScore: 0.4,
    });
    expect(historical[0]?.analysisRunAId).not.toBe("run-a2");

    const current = await listSubmissionSimilarity(local.binding, "competition-a", "submission-a");
    expect(current.analysisRunId).toBe("run-a2");
    expect(current.pairs.map((pair) => pair.analysisRunAId)).toEqual(["run-a2"]);
    expect(current.pairs[0]?.otherSubmission.id).toBe("submission-b");

    const repeated = await listAnalysisRunSimilarity(local.binding, "competition-a", "run-a1");
    expect(repeated).toEqual(historical);
  });

  it("never leaks another competition through the historical or current similarity queries", async () => {
    await expect(
      listAnalysisRunSimilarity(local.binding, "competition-b", "run-a1"),
    ).rejects.toThrow();
    await expect(
      listSubmissionSimilarity(local.binding, "competition-b", "submission-a"),
    ).rejects.toThrow();
  });
});

describe("SimilarityPair database ownership enforcement", () => {
  let local: LocalD1;

  beforeEach(() => {
    local = createLocalD1();
    seedCompetitions(
      local,
      [
        {
          id: "run-a1",
          submissionId: "submission-a",
          competition: "a",
          sha: SHA_A,
          completedAt: 10,
        },
        {
          id: "run-a2",
          submissionId: "submission-a2",
          competition: "a",
          sha: SHA_A,
          completedAt: 11,
        },
        {
          id: "run-b1",
          submissionId: "submission-b1",
          competition: "b",
          sha: SHA_A,
          completedAt: 12,
        },
      ],
      [
        { id: "submission-a", competition: "a" },
        { id: "submission-a2", competition: "a" },
        { id: "submission-b1", competition: "b" },
      ],
    );
  });

  afterEach(() => local.close());

  const rawInsert = (
    id: string,
    competitionId: string,
    submissionAId: string,
    submissionBId: string,
    runAId: string,
    runBId: string,
  ) => `INSERT INTO similarity_pair (
      id, competition_id, submission_a_id, submission_b_id, analysis_run_a_id, analysis_run_b_id,
      lexical_score, semantic_score, combined_score, mode, level, exact_document_match, evidence_json
    ) VALUES ('${id}', '${competitionId}', '${submissionAId}', '${submissionBId}', '${runAId}', '${runBId}',
      0.5, null, 0.5, 'LEXICAL_ONLY', 'MEDIUM', 0, '[]')`;

  it("accepts a valid same-competition row", () => {
    local.exec(
      rawInsert("valid", "competition-a", "submission-a", "submission-a2", "run-a1", "run-a2"),
    );
    expect(similarityPairRows(local)).toHaveLength(1);
  });

  it("rejects a direct insert whose submission belongs to another competition", () => {
    // submission-b1 belongs to competition-b, so (competition-a, submission-b1) has no parent row.
    expect(() =>
      local.exec(
        rawInsert("cross", "competition-a", "submission-a", "submission-b1", "run-a1", "run-b1"),
      ),
    ).toThrow(/FOREIGN KEY constraint failed/u);
    expect(similarityPairRows(local)).toHaveLength(0);
  });

  it("rejects a direct insert whose AnalysisRun belongs to another submission", () => {
    // run-a2 belongs to submission-a2, not to submission-a.
    expect(() =>
      local.exec(
        rawInsert("mismatch", "competition-a", "submission-a", "submission-a2", "run-a2", "run-a1"),
      ),
    ).toThrow(/FOREIGN KEY constraint failed/u);
    expect(similarityPairRows(local)).toHaveLength(0);
  });

  it("rejects a repository write that mixes competitions", async () => {
    await expect(
      upsertSimilarityPair(local.binding, {
        ...writeInput("submission-a", "submission-b1", "run-a1", "run-b1", 0.5),
      }),
    ).rejects.toThrow(/doğrulanamadı/u);
    expect(similarityPairRows(local)).toHaveLength(0);
  });
});

describe("canonical side alignment", () => {
  it("moves each AnalysisRun identity with its own submission", () => {
    expect(
      canonicalSimilarityPairIdentity({
        sourceSubmissionId: "submission-b",
        otherSubmissionId: "submission-a",
        sourceAnalysisRunId: "run-b1",
        otherAnalysisRunId: "run-a1",
      }),
    ).toEqual({
      submissionAId: "submission-a",
      analysisRunAId: "run-a1",
      submissionBId: "submission-b",
      analysisRunBId: "run-b1",
    });
    expect(
      canonicalSimilarityPairIdentity({
        sourceSubmissionId: "submission-a",
        otherSubmissionId: "submission-b",
        sourceAnalysisRunId: "run-a1",
        otherAnalysisRunId: "run-b1",
      }),
    ).toEqual({
      submissionAId: "submission-a",
      analysisRunAId: "run-a1",
      submissionBId: "submission-b",
      analysisRunBId: "run-b1",
    });
  });
});

describe("candidate retrieval bounds", () => {
  let local: LocalD1;

  afterEach(() => local.close());

  it("caps and deterministically orders more than the configured maximum of eligible candidates", async () => {
    local = createLocalD1();
    const submissions: SeedSubmission[] = [{ id: "submission-source", competition: "a" }];
    const runs: SeedRun[] = [
      {
        id: "run-source",
        submissionId: "submission-source",
        competition: "a",
        sha: SHA_A,
        completedAt: 1000,
      },
    ];
    for (let index = 1; index <= 25; index += 1) {
      const submissionId = `submission-c${String(index).padStart(2, "0")}`;
      submissions.push({ id: submissionId, competition: "a" });
      // Two successful runs each, so the query must also pick only the latest run per submission.
      runs.push({
        id: `run-${submissionId}-old`,
        submissionId,
        competition: "a",
        sha: SHA_A,
        completedAt: 100 + index,
      });
      runs.push({
        id: `run-${submissionId}-new`,
        submissionId,
        competition: "a",
        sha: SHA_A,
        completedAt: 500 + index,
      });
    }
    // One same-text candidate in another competition must never appear.
    submissions.push({ id: "submission-b1", competition: "b" });
    runs.push({
      id: "run-b1",
      submissionId: "submission-b1",
      competition: "b",
      sha: SHA_A,
      completedAt: 9000,
    });
    seedCompetitions(local, runs, submissions);

    const first = await listEligibleCompetitionRuns(
      local.binding,
      "competition-a",
      "submission-source",
      MAX_SIMILARITY_CANDIDATES,
    );
    expect(first).toHaveLength(MAX_SIMILARITY_CANDIDATES);
    expect(MAX_SIMILARITY_CANDIDATES).toBeLessThan(25);
    expect(first.every((candidate) => candidate.competitionId === "competition-a")).toBe(true);
    expect(first.map((candidate) => candidate.submissionId)).not.toContain("submission-b1");
    expect(first.map((candidate) => candidate.submissionId)).not.toContain("submission-source");
    expect(first.every((candidate) => candidate.analysisRunId.endsWith("-new"))).toBe(true);
    expect(new Set(first.map((candidate) => candidate.submissionId)).size).toBe(
      MAX_SIMILARITY_CANDIDATES,
    );

    const second = await listEligibleCompetitionRuns(
      local.binding,
      "competition-a",
      "submission-source",
      MAX_SIMILARITY_CANDIDATES,
    );
    expect(second).toEqual(first);
    expect(first.map((candidate) => candidate.submissionId)).toEqual([
      ...first.map((candidate) => candidate.submissionId),
    ]);

    // An unbounded request is still clamped to the configured maximum.
    const requestedTooMany = await listEligibleCompetitionRuns(
      local.binding,
      "competition-a",
      "submission-source",
      500,
    );
    expect(requestedTooMany).toHaveLength(MAX_SIMILARITY_CANDIDATES);
    expect(requestedTooMany).toEqual(first);
  });
});

describe("generated migration chain", () => {
  it("applies cleanly from 0000 and as an upgrade from the committed 0009 state", () => {
    expect(migrationChain.map((migration) => migration.name)).toEqual(
      [...migrationChain.map((migration) => migration.name)].sort(),
    );
    const clean = createLocalD1();
    const cleanTables = clean
      .query<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .map((row) => row.name);
    expect(cleanTables).toContain("similarity_pair");
    clean.close();

    const upgraded = createLocalD1(migrationChain.length - 1);
    expect(
      upgraded.query<{ count: number }>(
        "SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'similarity_pair'",
      )[0]?.count,
    ).toBe(0);
    seedCompetitions(
      upgraded,
      [
        {
          id: "run-a1",
          submissionId: "submission-a",
          competition: "a",
          sha: SHA_A,
          completedAt: 10,
        },
      ],
      [{ id: "submission-a", competition: "a" }],
    );
    for (const migration of migrationChain.slice(migrationChain.length - 1)) {
      upgraded.exec(migration.sql);
    }
    expect(
      upgraded.query<{ count: number }>("SELECT count(*) AS count FROM submission")[0]?.count,
    ).toBe(1);
    expect(
      upgraded.query<{ count: number }>("SELECT count(*) AS count FROM analysis_run")[0]?.count,
    ).toBe(1);
    expect(
      upgraded.query<{ count: number }>(
        "SELECT count(*) AS count FROM sqlite_master WHERE type = 'index' AND name IN ('submission_competition_scope_unique', 'analysis_run_submission_scope_unique', 'similarity_pair_competition_runs_unique')",
      )[0]?.count,
    ).toBe(3);
    upgraded.close();
  });
});
