import { ApiErrorResponseSchema, ReviewerWorkspaceResponseSchema } from "@teknofest-ai/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { LocalD1 } from "./test-fixtures/local-d1";
import { createReviewerTestApp, type ReviewerTestApp } from "./test-fixtures/reviewer-app";
import {
  activateRubricV2AndCreateNewerRun,
  assignReviewer,
  createReviewerWorld,
  SEED,
} from "./test-fixtures/reviewer-workflow-seed";

// Human evaluation persistence, score integrity and draft/submit semantics, driven through the real
// route and repository composition. rubric-a1 scores `quality` out of 10 and `impact` out of 5, and
// the persisted AI suggestions for run-a1 are 7 and 3 (AI total 10 / 15).

const ASSIGNMENT = "assignment-r1-a1";

let local: LocalD1;
let harness: ReviewerTestApp;

const base = `/api/v1/competitions/${SEED.competitionA}/review/assignments/${ASSIGNMENT}`;

function saveDraft(body: unknown, userId: string = SEED.reviewerOne) {
  return harness.request(userId, `${base}/evaluation`, { method: "PUT", body });
}

function submit(body: unknown, userId: string = SEED.reviewerOne) {
  return harness.request(userId, `${base}/evaluation/submit`, { method: "POST", body });
}

function workspace(userId: string = SEED.reviewerOne) {
  return harness.request(userId, `${base}/workspace`);
}

const fullScores = [
  { criterionId: SEED.criterionA1Quality, score: 5, note: "Kanıt zayıf." },
  { criterionId: SEED.criterionA1Impact, score: 3, note: null },
];

beforeEach(() => {
  local = createReviewerWorld();
  harness = createReviewerTestApp(local);
  assignReviewer(local, ASSIGNMENT, SEED.competitionA, SEED.submissionA1, SEED.reviewerOne);
});

afterEach(() => {
  local.close();
});

describe("draft persistence and server-calculated totals", () => {
  it("persists a partial draft and totals only the criteria the reviewer actually scored", async () => {
    const response = await saveDraft({
      analysisRunId: SEED.runA1,
      overallNote: "Ara not.",
      scores: [{ criterionId: SEED.criterionA1Quality, score: 5, note: null }],
    });
    expect(response.status).toBe(200);
    const saved = ReviewerWorkspaceResponseSchema.parse(await response.json());

    expect(saved.evaluation).toMatchObject({
      status: "DRAFT",
      analysisRunId: SEED.runA1,
      rubricVersionId: SEED.rubricA1,
      overallNote: "Ara not.",
      submittedAt: null,
    });
    expect(saved.totals).toEqual({
      aiSuggestedTotal: 10,
      aiMaxTotal: 15,
      humanTotal: 5,
      humanMaxTotal: 15,
      scoredCriterionCount: 1,
      criterionCount: 2,
      disagreementCount: 1,
    });
    expect(saved.editable).toBe(true);

    // The draft is durable: a fresh workspace read returns the same persisted human score.
    const reloaded = ReviewerWorkspaceResponseSchema.parse(await (await workspace()).json());
    expect(reloaded.criteria.map((c) => c.humanScore)).toEqual([5, null]);
  });

  it("recomputes the total server-side and never trusts a client-supplied total", async () => {
    const withClientTotal = await saveDraft({
      analysisRunId: SEED.runA1,
      overallNote: null,
      scores: fullScores,
      humanTotal: 15,
    });
    expect(withClientTotal.status).toBe(400);
    expect(ApiErrorResponseSchema.parse(await withClientTotal.json()).code).toBe(
      "VALIDATION_ERROR",
    );

    const accepted = await saveDraft({
      analysisRunId: SEED.runA1,
      overallNote: null,
      scores: fullScores,
    });
    // 5 + 3, not the 15 the rejected request claimed.
    expect(ReviewerWorkspaceResponseSchema.parse(await accepted.json()).totals.humanTotal).toBe(8);
  });

  it("rejects a client-supplied reviewer identity or assignment ownership claim", async () => {
    for (const forged of [
      { reviewerUserId: SEED.reviewerTwo },
      { assignmentId: "assignment-r2-a1" },
      { rubricVersionId: SEED.rubricA2 },
    ]) {
      const response = await saveDraft({
        analysisRunId: SEED.runA1,
        overallNote: null,
        scores: fullScores,
        ...forged,
      });
      expect(response.status, JSON.stringify(forged)).toBe(400);
    }
  });

  it("removes a criterion score the reviewer cleared instead of leaving a stale value", async () => {
    await saveDraft({ analysisRunId: SEED.runA1, overallNote: null, scores: fullScores });
    const cleared = await saveDraft({
      analysisRunId: SEED.runA1,
      overallNote: null,
      scores: [{ criterionId: SEED.criterionA1Impact, score: 3, note: null }],
    });
    const payload = ReviewerWorkspaceResponseSchema.parse(await cleared.json());
    expect(payload.criteria.map((c) => c.humanScore)).toEqual([null, 3]);
    expect(payload.totals.humanTotal).toBe(3);
  });
});

describe("score integrity at the application boundary", () => {
  it("rejects a score above the pinned criterion maximum", async () => {
    const response = await saveDraft({
      analysisRunId: SEED.runA1,
      overallNote: null,
      // `quality` is scored out of 10 in rubric-a1; 11 is invalid even though rubric-a2 allows 20.
      scores: [{ criterionId: SEED.criterionA1Quality, score: 11, note: null }],
    });
    expect(response.status).toBe(400);
  });

  it("rejects a negative score", async () => {
    const response = await saveDraft({
      analysisRunId: SEED.runA1,
      overallNote: null,
      scores: [{ criterionId: SEED.criterionA1Quality, score: -1, note: null }],
    });
    expect(response.status).toBe(400);
  });

  it("accepts zero as a real reviewer judgement", async () => {
    const response = await saveDraft({
      analysisRunId: SEED.runA1,
      overallNote: null,
      scores: [{ criterionId: SEED.criterionA1Quality, score: 0, note: null }],
    });
    expect(response.status).toBe(200);
    const payload = ReviewerWorkspaceResponseSchema.parse(await response.json());
    expect(payload.criteria[0]?.humanScore).toBe(0);
    expect(payload.totals.humanTotal).toBe(0);
    expect(payload.totals.scoredCriterionCount).toBe(1);
  });

  it("rejects a criterion outside the pinned RubricVersion", async () => {
    activateRubricV2AndCreateNewerRun(local);
    const response = await saveDraft({
      analysisRunId: SEED.runA1,
      overallNote: null,
      // A criterion of the newly activated rubric-a2 cannot be scored inside a run pinned to v1.
      scores: [{ criterionId: SEED.criterionA2Quality, score: 4, note: null }],
    });
    expect(response.status).toBe(400);
  });

  it("rejects an AnalysisRun that does not belong to the assignment's submission", async () => {
    const response = await saveDraft({
      analysisRunId: SEED.runA3,
      overallNote: null,
      scores: fullScores,
    });
    expect(response.status).toBe(404);
  });

  it("rejects a duplicate score for the same criterion in one request", async () => {
    const response = await saveDraft({
      analysisRunId: SEED.runA1,
      overallNote: null,
      scores: [
        { criterionId: SEED.criterionA1Quality, score: 4, note: null },
        { criterionId: SEED.criterionA1Quality, score: 9, note: null },
      ],
    });
    expect(response.status).toBe(400);
  });
});

describe("human-AI independence and the decision trace", () => {
  it("classifies agreement, a lower score and a higher score without treating any as an error", async () => {
    const response = await saveDraft({
      analysisRunId: SEED.runA1,
      overallNote: null,
      scores: [
        // Accepting the AI suggestion is an explicit reviewer action that writes the same number.
        { criterionId: SEED.criterionA1Quality, score: 7, note: null },
        // Scoring above the AI suggestion is allowed.
        {
          criterionId: SEED.criterionA1Impact,
          score: 5,
          note: "AI eksik nokta değerlendirmesine katılmıyorum.",
        },
      ],
    });
    const payload = ReviewerWorkspaceResponseSchema.parse(await response.json());

    expect(payload.criteria.map((c) => c.decisionTrace)).toEqual([
      { aiScore: 7, humanScore: 7, difference: 0, classification: "SAME_AS_AI" },
      { aiScore: 3, humanScore: 5, difference: 2, classification: "DIFFERENT_FROM_AI" },
    ]);
    expect(payload.totals).toMatchObject({
      aiSuggestedTotal: 10,
      humanTotal: 12,
      disagreementCount: 1,
    });
    // Both totals stay separate; the human total is not the AI total.
    expect(payload.totals.humanTotal).not.toBe(payload.totals.aiSuggestedTotal);
  });

  it("reports a criterion with no AI suggestion as such rather than inventing one", async () => {
    local.exec(`DELETE FROM rubric_suggestion WHERE criterion_id = '${SEED.criterionA1Impact}'`);
    const response = await saveDraft({
      analysisRunId: SEED.runA1,
      overallNote: null,
      scores: [{ criterionId: SEED.criterionA1Impact, score: 4, note: null }],
    });
    const payload = ReviewerWorkspaceResponseSchema.parse(await response.json());
    const impact = payload.criteria.find((c) => c.criterionId === SEED.criterionA1Impact);
    expect(impact?.aiSuggestion).toBeNull();
    expect(impact?.decisionTrace).toEqual({
      aiScore: null,
      humanScore: 4,
      difference: null,
      classification: "NO_AI_SUGGESTION",
    });
    // The disagreement count only counts criteria that actually carry an AI suggestion.
    expect(payload.totals.disagreementCount).toBe(0);
  });

  it("leaves the AI suggestion rows untouched when the reviewer scores differently", async () => {
    const before = local.query("SELECT * FROM rubric_suggestion ORDER BY id");
    await submit({ analysisRunId: SEED.runA1, overallNote: null, scores: fullScores });
    expect(local.query("SELECT * FROM rubric_suggestion ORDER BY id")).toEqual(before);
  });
});

describe("draft and submit semantics", () => {
  it("refuses to submit until every pinned criterion is scored", async () => {
    const incomplete = await submit({
      analysisRunId: SEED.runA1,
      overallNote: null,
      scores: [{ criterionId: SEED.criterionA1Quality, score: 6, note: null }],
    });
    expect(incomplete.status).toBe(400);
    expect(ApiErrorResponseSchema.parse(await incomplete.json()).message).toContain(
      "tüm rubrik kriterlerini puanlayın",
    );

    const complete = await submit({
      analysisRunId: SEED.runA1,
      overallNote: "Nihai hakem notu.",
      scores: fullScores,
    });
    expect(complete.status).toBe(200);
    const payload = ReviewerWorkspaceResponseSchema.parse(await complete.json());
    expect(payload.evaluation?.status).toBe("SUBMITTED");
    expect(payload.evaluation?.submittedAt).not.toBeNull();
    expect(payload.editable).toBe(false);
  });

  it("keeps a submitted evaluation immutable against further saves and resubmissions", async () => {
    await submit({ analysisRunId: SEED.runA1, overallNote: null, scores: fullScores });
    const stored = local.query<{ score: number }>(
      "SELECT score FROM reviewer_criterion_score ORDER BY criterion_id",
    );

    const resave = await saveDraft({
      analysisRunId: SEED.runA1,
      overallNote: "Değiştirme denemesi.",
      scores: [
        { criterionId: SEED.criterionA1Quality, score: 10, note: null },
        { criterionId: SEED.criterionA1Impact, score: 5, note: null },
      ],
    });
    expect(resave.status).toBe(409);
    expect(ApiErrorResponseSchema.parse(await resave.json()).message).toContain("değiştirilemez");

    const resubmit = await submit({
      analysisRunId: SEED.runA1,
      overallNote: null,
      scores: fullScores,
    });
    expect(resubmit.status).toBe(409);
    expect(
      local.query<{ score: number }>(
        "SELECT score FROM reviewer_criterion_score ORDER BY criterion_id",
      ),
    ).toEqual(stored);
  });

  it("does not create an evaluation merely because the workspace was opened", async () => {
    await workspace();
    await harness.request(
      SEED.reviewerOne,
      `/api/v1/competitions/${SEED.competitionA}/review/assignments`,
    );
    expect(local.query("SELECT id FROM reviewer_evaluation")).toEqual([]);
  });

  it("refuses to evaluate against an AnalysisRun that has not completed", async () => {
    assignReviewer(
      local,
      "assignment-r1-a4",
      SEED.competitionA,
      SEED.submissionA4,
      SEED.reviewerOne,
    );
    const response = await harness.request(
      SEED.reviewerOne,
      `/api/v1/competitions/${SEED.competitionA}/review/assignments/assignment-r1-a4/evaluation`,
      {
        method: "PUT",
        body: {
          analysisRunId: "run-a4-inflight",
          overallNote: null,
          scores: [{ criterionId: SEED.criterionA2Quality, score: 4, note: null }],
        },
      },
    );
    expect(response.status).toBe(409);
  });

  it("keeps another reviewer's evaluation of the same submission entirely separate", async () => {
    assignReviewer(
      local,
      "assignment-r2-a1",
      SEED.competitionA,
      SEED.submissionA1,
      SEED.reviewerTwo,
    );
    await submit({ analysisRunId: SEED.runA1, overallNote: null, scores: fullScores });

    const other = await harness.request(
      SEED.reviewerTwo,
      `/api/v1/competitions/${SEED.competitionA}/review/assignments/assignment-r2-a1/workspace`,
    );
    const payload = ReviewerWorkspaceResponseSchema.parse(await other.json());
    expect(payload.evaluation).toBeNull();
    expect(payload.totals.humanTotal).toBeNull();
    expect(payload.editable).toBe(true);
  });
});

describe("unassignment and completed evaluations", () => {
  const operationsPath = `/api/v1/competitions/${SEED.competitionA}/reviewer-assignments`;

  it("allows unassigning while the evaluation is only a draft", async () => {
    await saveDraft({ analysisRunId: SEED.runA1, overallNote: null, scores: fullScores });
    const response = await harness.request(SEED.manager, `${operationsPath}/${ASSIGNMENT}`, {
      method: "DELETE",
    });
    expect(response.status).toBe(204);
    expect(local.query("SELECT id FROM reviewer_evaluation")).toEqual([]);
  });

  it("refuses to unassign once the reviewer has submitted, preserving the record", async () => {
    await submit({ analysisRunId: SEED.runA1, overallNote: null, scores: fullScores });
    const response = await harness.request(SEED.manager, `${operationsPath}/${ASSIGNMENT}`, {
      method: "DELETE",
    });
    expect(response.status).toBe(409);
    expect(local.query("SELECT id FROM reviewer_evaluation")).toHaveLength(1);
  });
});

describe("one evaluation per assignment, enforced end to end", () => {
  it("creates exactly one evaluation on the first save and resolves the same row on every later save", async () => {
    const first = await saveDraft({
      analysisRunId: SEED.runA1,
      overallNote: null,
      scores: [{ criterionId: SEED.criterionA1Quality, score: 4, note: null }],
    });
    const firstPayload = ReviewerWorkspaceResponseSchema.parse(await first.json());
    const evaluationId = firstPayload.evaluation?.id;
    expect(evaluationId).toBeTruthy();
    expect(local.query("SELECT id FROM reviewer_evaluation")).toHaveLength(1);

    const second = await saveDraft({
      analysisRunId: SEED.runA1,
      overallNote: "Güncellendi.",
      scores: [{ criterionId: SEED.criterionA1Quality, score: 6, note: null }],
    });
    const secondPayload = ReviewerWorkspaceResponseSchema.parse(await second.json());
    expect(secondPayload.evaluation?.id).toBe(evaluationId);
    expect(local.query("SELECT id FROM reviewer_evaluation")).toHaveLength(1);
  });

  it("rejects a concurrent/retried first save for the same assignment without creating a duplicate", async () => {
    const send = () =>
      saveDraft({
        analysisRunId: SEED.runA1,
        overallNote: null,
        scores: [{ criterionId: SEED.criterionA1Quality, score: 4, note: null }],
      });

    const [first, second] = await Promise.all([send(), send()]);
    const statuses = [first.status, second.status].sort();
    // Exactly one of the two racing requests creates the evaluation; the other observes a
    // controlled conflict rather than crashing or silently forking a second row.
    expect(statuses).toEqual([200, 409]);
    expect(local.query("SELECT id FROM reviewer_evaluation")).toHaveLength(1);

    const losingResponse = first.status === 409 ? first : second;
    expect(ApiErrorResponseSchema.parse(await losingResponse.json()).code).toBe("CONFLICT");
  });

  it("keeps an assignment's evaluation pinned to its original run even while still a draft", async () => {
    await saveDraft({
      analysisRunId: SEED.runA1,
      overallNote: null,
      scores: [{ criterionId: SEED.criterionA1Quality, score: 4, note: null }],
    });
    activateRubricV2AndCreateNewerRun(local);

    const redirected = await saveDraft({
      analysisRunId: SEED.runA2,
      overallNote: null,
      scores: [{ criterionId: SEED.criterionA2Quality, score: 12, note: null }],
    });
    expect(redirected.status).toBe(409);
    expect(
      local.query<{ analysis_run_id: string }>("SELECT analysis_run_id FROM reviewer_evaluation"),
    ).toEqual([{ analysis_run_id: SEED.runA1 }]);
  });

  it("refuses a second evaluation for a submitted assignment even against a newer run", async () => {
    await submit({ analysisRunId: SEED.runA1, overallNote: null, scores: fullScores });
    activateRubricV2AndCreateNewerRun(local);

    const secondAttempt = await saveDraft({
      analysisRunId: SEED.runA2,
      overallNote: null,
      scores: [{ criterionId: SEED.criterionA2Quality, score: 12, note: null }],
    });
    expect(secondAttempt.status).toBe(409);
    expect(local.query("SELECT id FROM reviewer_evaluation")).toHaveLength(1);
    expect(
      local.query<{ status: string; analysis_run_id: string }>(
        "SELECT status, analysis_run_id FROM reviewer_evaluation",
      ),
    ).toEqual([{ status: "SUBMITTED", analysis_run_id: SEED.runA1 }]);
  });

  it("leaves another reviewer's assignment for the same submission with its own independent evaluation", async () => {
    assignReviewer(
      local,
      "assignment-r2-a1",
      SEED.competitionA,
      SEED.submissionA1,
      SEED.reviewerTwo,
    );
    await submit({ analysisRunId: SEED.runA1, overallNote: null, scores: fullScores });

    const other = await harness.request(
      SEED.reviewerTwo,
      `/api/v1/competitions/${SEED.competitionA}/review/assignments/assignment-r2-a1/evaluation`,
      {
        method: "PUT",
        body: {
          analysisRunId: SEED.runA1,
          overallNote: null,
          scores: [{ criterionId: SEED.criterionA1Quality, score: 9, note: null }],
        },
      },
    );
    expect(other.status).toBe(200);
    expect(local.query("SELECT id FROM reviewer_evaluation")).toHaveLength(2);
  });
});
