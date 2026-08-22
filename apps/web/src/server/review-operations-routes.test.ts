import {
  ApiErrorResponseSchema,
  type ReviewOperationsItem,
  ReviewOperationsResponseSchema,
} from "@teknofest-ai/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { LocalD1 } from "./test-fixtures/local-d1";
import { createReviewOperationsWorld, OPS } from "./test-fixtures/review-operations-seed";
import { createReviewerTestApp, type ReviewerTestApp } from "./test-fixtures/reviewer-app";

// The app is composed with the REAL repositories and the REAL membership lookup over an in-memory
// database carrying the full generated migration chain, so every authorization decision and every
// derived priority asserted below is the production one. The six synthetic scenarios are the same
// ones the demo walkthrough uses.

let local: LocalD1;
let harness: ReviewerTestApp;

const operationsPath = (competitionId: string = OPS.competitionA) =>
  `/api/v1/competitions/${competitionId}/review-operations`;

async function operations(userId: string, competitionId: string = OPS.competitionA) {
  const response = await harness.request(userId, operationsPath(competitionId));
  expect(response.status).toBe(200);
  return ReviewOperationsResponseSchema.parse(await response.json());
}

function byCode(items: readonly ReviewOperationsItem[], applicationCode: string) {
  const item = items.find((candidate) => candidate.applicationCode === applicationCode);
  if (!item) throw new Error(`${applicationCode} bulunamadı.`);
  return item;
}

function reasonCodes(item: ReviewOperationsItem) {
  return item.priority.reasons.map((reason) => reason.code);
}

beforeEach(() => {
  local = createReviewOperationsWorld();
  harness = createReviewerTestApp(local);
});

afterEach(() => {
  local.close();
});

describe("review operations authorization", () => {
  it("rejects an unauthenticated request with 401", async () => {
    const response = await harness.request(null, operationsPath());
    expect(response.status).toBe(401);
  });

  it("allows the competition manager and the evaluation manager", async () => {
    for (const userId of [OPS.manager, OPS.evaluationManager]) {
      const response = await harness.request(userId, operationsPath());
      expect(response.status, userId).toBe(200);
    }
  });

  it("denies a reviewer the competition-wide queue even though they review submissions", async () => {
    // A REVIEWER holds `submission:review`, never `competition:view-operations`.
    const response = await harness.request(OPS.reviewer, operationsPath());
    expect(response.status).toBe(403);
    expect(ApiErrorResponseSchema.parse(await response.json()).code).toBe("FORBIDDEN");
  });

  it("denies a contestant", async () => {
    const response = await harness.request(OPS.contestant, operationsPath());
    expect(response.status).toBe(403);
  });

  it("denies a manager of another competition", async () => {
    const response = await harness.request(OPS.foreignManager, operationsPath());
    expect(response.status).toBe(403);
  });
});

describe("competition isolation", () => {
  it("returns only this competition's submissions", async () => {
    const { items } = await operations(OPS.manager);
    expect(items.map((item) => item.applicationCode)).toEqual([
      "OPS-A",
      "OPS-B",
      "OPS-C",
      "OPS-D",
      "OPS-E",
      "OPS-F",
    ]);
    expect(items.some((item) => item.submissionId === OPS.foreignSubmission)).toBe(false);
  });

  it("does not let another competition's byte-identical report become an exact-match signal", async () => {
    // OPS-A and competition B's OPS-Z share the same content hash on purpose.
    const { items } = await operations(OPS.manager);
    expect(byCode(items, "OPS-A").analysis.exactDocumentMatch).toBe(false);
    expect(reasonCodes(byCode(items, "OPS-A"))).not.toContain("EXACT_DOCUMENT_MATCH");
  });

  it("does not let another competition's high similarity observation reach this queue", async () => {
    const { items } = await operations(OPS.manager);
    const foreignHighSimilarity = items.filter(
      (item) => item.analysis.similarityLevel === "HIGH" && item.applicationCode !== "OPS-D",
    );
    expect(foreignHighSimilarity).toEqual([]);
  });

  it("scopes each competition's queue to its own manager", async () => {
    const foreign = await operations(OPS.foreignManager, OPS.competitionB);
    expect(foreign.items.map((item) => item.applicationCode)).toEqual(["OPS-Z"]);
  });
});

describe("deterministic priority levels across the golden scenarios", () => {
  it("assigns each scenario the level its visible reasons add up to", async () => {
    const { items, summary } = await operations(OPS.manager);
    const levels = Object.fromEntries(
      items.map((item) => [item.applicationCode, item.priority.level]),
    );
    expect(levels).toEqual({
      "OPS-A": "LOW",
      "OPS-B": "HIGH",
      "OPS-C": "HIGH",
      "OPS-D": "HIGH",
      "OPS-E": "MEDIUM",
      "OPS-F": "HIGH",
    });
    expect(summary).toEqual({ high: 4, medium: 1, low: 1 });
  });

  it("returns the identical projection on a repeated request", async () => {
    const first = await operations(OPS.manager);
    const second = await operations(OPS.manager);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("explains every level with reasons whose weights sum to the reported score", async () => {
    const { items } = await operations(OPS.manager);
    for (const item of items) {
      expect(
        item.priority.reasons.reduce((total, reason) => total + reason.weight, 0),
        item.applicationCode,
      ).toBe(item.priority.score);
      if (item.priority.level !== "LOW") {
        expect(item.priority.reasons.length, item.applicationCode).toBeGreaterThan(0);
      }
    }
  });
});

describe("explainable reasons per scenario", () => {
  it("A: a clean submission whose reviewer submitted is low priority and says so", async () => {
    const item = byCode((await operations(OPS.manager)).items, "OPS-A");
    expect(reasonCodes(item)).toEqual(["HUMAN_REVIEW_COMPLETED"]);
    expect(item.submittedEvaluationCount).toBe(1);
    expect(item.disagreementCount).toBe(0);
  });

  it("B: a structurally problematic report names each structural signal", async () => {
    const item = byCode((await operations(OPS.manager)).items, "OPS-B");
    expect(reasonCodes(item)).toEqual([
      "SECTION_PRESENCE_FAIL",
      "TEMPLATE_STRUCTURE_FAIL",
      "NO_REVIEWER_ASSIGNED",
      "LANGUAGE_WARN",
    ]);
    expect(item.reviewers).toEqual([]);
  });

  it("C: a category-content concern names the fit, the content and the weak evidence count", async () => {
    const item = byCode((await operations(OPS.manager)).items, "OPS-C");
    expect(reasonCodes(item)).toEqual([
      "CATEGORY_FIT_WARN",
      "SECTION_CONTENT_WARN",
      "REQUIRED_SECTION_WEAK_EVIDENCE",
      "REVIEW_NOT_STARTED",
    ]);
    expect(item.priority.reasons.map((reason) => reason.label)).toContain(
      "2 zorunlu bölümde zayıf kanıt",
    );
  });

  it("D: high similarity raises the priority and stays an attention signal", async () => {
    const item = byCode((await operations(OPS.manager)).items, "OPS-D");
    expect(item.priority.level).toBe("HIGH");
    expect(item.analysis.similarityLevel).toBe("HIGH");
    expect(item.analysis.similarityObservationCount).toBe(1);
    expect(item.analysis.exactDocumentMatch).toBe(false);
    const wording = item.priority.reasons.map((reason) => reason.label).join(" ");
    for (const forbidden of ["intihal", "kopya", "diskalifiye", "kesin", "olasılık"]) {
      expect(wording.toLocaleLowerCase("tr-TR")).not.toContain(forbidden);
    }
  });

  it("E: an AI/human difference is reported with its count and the AI total stays separate", async () => {
    const item = byCode((await operations(OPS.manager)).items, "OPS-E");
    expect(item.priority.level).toBe("MEDIUM");
    expect(reasonCodes(item)).toEqual([
      "RUBRIC_WEAK_EVIDENCE",
      "AI_HUMAN_DISAGREEMENT",
      "HUMAN_REVIEW_COMPLETED",
    ]);
    expect(item.disagreementCount).toBe(2);
    // The AI suggestion and the reviewer's own total are two separate numbers at every layer.
    expect(item.aiSuggestedTotal).toBe(13);
    expect(item.aiMaxTotal).toBe(15);
    expect(item.reviewers[0]?.humanTotal).toBe(11);
    expect(item.reviewers[0]?.evaluationStatus).toBe("SUBMITTED");
  });

  it("F: a failed analysis run is surfaced instead of looking like a clean submission", async () => {
    const item = byCode((await operations(OPS.manager)).items, "OPS-F");
    expect(item.priority.level).toBe("HIGH");
    expect(reasonCodes(item)).toEqual(["ANALYSIS_FAILED", "NO_REVIEWER_ASSIGNED"]);
    expect(item.analysis.latestRunStatus).toBe("FAILED");
    expect(item.analysis.referenceRunId).toBeNull();
    expect(item.analysis.checks).toEqual([]);
    expect(item.aiSuggestedTotal).toBeNull();
  });
});

describe("the queue reacts to persisted state without any new inference", () => {
  it("drops the unassigned reason as soon as a reviewer is assigned", async () => {
    const before = byCode((await operations(OPS.manager)).items, "OPS-D");
    expect(reasonCodes(before)).toContain("NO_REVIEWER_ASSIGNED");

    local.exec(
      `INSERT INTO reviewer_assignment (id, competition_id, submission_id, reviewer_user_id, assigned_by_user_id)
       VALUES ('ops-assignment-d', '${OPS.competitionA}', '${OPS.similaritySubmission}', '${OPS.reviewer}', '${OPS.manager}')`,
    );

    const after = byCode((await operations(OPS.manager)).items, "OPS-D");
    expect(reasonCodes(after)).toEqual(["SIMILARITY_HIGH", "REVIEW_NOT_STARTED"]);
    expect(after.priority.level).toBe("HIGH");
    expect(after.reviewers.map((reviewer) => reviewer.email)).toEqual(["ops-r1@example.com"]);
  });

  it("keeps the older successful run's evidence when a newer run fails", async () => {
    local.exec(
      `INSERT INTO analysis_run (
         id, submission_id, category_id, template_version_id, rubric_version_id, source_sha256,
         status, stage, workflow_instance_id, extraction_warnings, error_code, error_message,
         created_at, started_at, completed_at
       ) VALUES (
         'ops-run-a-retry', '${OPS.cleanSubmission}', '${OPS.categoryA}', '${OPS.templateA}',
         '${OPS.rubricA}', '${"a".repeat(64)}', 'FAILED', 'SEMANTIC_CHECKS', 'ops-run-a-retry',
         '[]', 'AI_TIMEOUT', 'Sentetik zaman aşımı.', 900, 900, 950
       )`,
    );

    const item = byCode((await operations(OPS.manager)).items, "OPS-A");
    expect(item.analysis.latestRunStatus).toBe("FAILED");
    expect(item.analysis.referenceRunId).toBe("ops-run-a");
    expect(reasonCodes(item)).toEqual(["ANALYSIS_FAILED", "HUMAN_REVIEW_COMPLETED"]);
    // The older run's persisted checks are still the evidence the reviewer has.
    expect(item.analysis.checks.length).toBe(7);
    expect(item.aiSuggestedTotal).toBe(12);
  });

  it("reports an exact document match inside the same competition as a signal", async () => {
    local.exec(
      `UPDATE submission_file SET sha256 = '${"a".repeat(64)}'
       WHERE submission_id = '${OPS.structuralSubmission}'`,
    );

    const items = (await operations(OPS.manager)).items;
    for (const code of ["OPS-A", "OPS-B"]) {
      expect(byCode(items, code).analysis.exactDocumentMatch, code).toBe(true);
      expect(reasonCodes(byCode(items, code)), code).toContain("EXACT_DOCUMENT_MATCH");
    }
  });
});
