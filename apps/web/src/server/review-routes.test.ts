import {
  ApiErrorResponseSchema,
  EligibleReviewerListResponseSchema,
  ReviewerAssignmentOperationListResponseSchema,
  ReviewerQueueResponseSchema,
  ReviewerWorkspaceResponseSchema,
} from "@teknofest-ai/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalD1 } from "./test-fixtures/local-d1";
import { createReviewerTestApp, type ReviewerTestApp } from "./test-fixtures/reviewer-app";
import {
  activateRubricV2AndCreateNewerRun,
  assignReviewer,
  createReviewerWorld,
  SEED,
} from "./test-fixtures/reviewer-workflow-seed";

// The app is composed with the REAL repositories and the REAL membership lookup over an in-memory
// database carrying the full generated migration chain, so every authorization decision asserted
// below is the production decision.

let local: LocalD1;
let harness: ReviewerTestApp;

function call(userId: string | null, path: string, init: { method?: string; body?: unknown } = {}) {
  return harness.request(userId, path, init);
}

const assignmentOne = "assignment-r1-a1";
const assignmentTwo = "assignment-r2-a1";
const assignmentB = "assignment-rb-b1";

function workspacePath(assignmentId: string, competitionId: string = SEED.competitionA) {
  return `/api/v1/competitions/${competitionId}/review/assignments/${assignmentId}/workspace`;
}

beforeEach(() => {
  local = createReviewerWorld();
  harness = createReviewerTestApp(local);
  assignReviewer(local, assignmentOne, SEED.competitionA, SEED.submissionA1, SEED.reviewerOne);
  assignReviewer(local, assignmentTwo, SEED.competitionA, SEED.submissionA1, SEED.reviewerTwo);
  assignReviewer(local, assignmentB, SEED.competitionB, SEED.submissionB1, SEED.reviewerB);
});

afterEach(() => {
  local.close();
});

describe("reviewer access requires an assignment in addition to the REVIEWER role", () => {
  it("rejects an unauthenticated request with 401", async () => {
    const response = await call(
      null,
      `/api/v1/competitions/${SEED.competitionA}/review/assignments`,
    );
    expect(response.status).toBe(401);
  });

  it("rejects a contestant, a manager and an evaluation manager with 403", async () => {
    local.exec(
      `INSERT INTO "user" (id, name, email) VALUES ('user-contestant', 'Yarışmacı', 'c@example.com');
       INSERT INTO competition_member (id, competition_id, user_id, role)
       VALUES ('m-a-contestant', '${SEED.competitionA}', 'user-contestant', 'CONTESTANT')`,
    );

    for (const userId of ["user-contestant", SEED.manager, SEED.evaluationManager]) {
      const queue = await call(
        userId,
        `/api/v1/competitions/${SEED.competitionA}/review/assignments`,
      );
      expect(queue.status, `${userId} queue`).toBe(403);
      const workspace = await call(userId, workspacePath(assignmentOne));
      expect(workspace.status, `${userId} workspace`).toBe(403);
    }
  });

  it("rejects a reviewer who holds the role but no assignment for the submission", async () => {
    local.exec(`DELETE FROM reviewer_assignment WHERE id = '${assignmentOne}'`);

    const queue = await call(
      SEED.reviewerOne,
      `/api/v1/competitions/${SEED.competitionA}/review/assignments`,
    );
    expect(queue.status).toBe(200);
    expect(ReviewerQueueResponseSchema.parse(await queue.json()).assignments).toEqual([]);

    const workspace = await call(SEED.reviewerOne, workspacePath(assignmentOne));
    expect(workspace.status).toBe(404);
  });

  it("does not let reviewer A open reviewer B's assignment for the same submission", async () => {
    const response = await call(SEED.reviewerOne, workspacePath(assignmentTwo));
    expect(response.status).toBe(404);
    expect(ApiErrorResponseSchema.parse(await response.json()).code).toBe("NOT_FOUND");
  });

  it("does not let a reviewer reach another competition", async () => {
    // Reviewer B is a member of competition B only.
    const foreignCompetition = await call(
      SEED.reviewerB,
      `/api/v1/competitions/${SEED.competitionA}/review/assignments`,
    );
    expect(foreignCompetition.status).toBe(403);

    // Requesting their own competition's route with another competition's assignment id fails.
    const foreignAssignment = await call(
      SEED.reviewerB,
      workspacePath(assignmentOne, SEED.competitionB),
    );
    expect(foreignAssignment.status).toBe(404);
  });

  it("shows a reviewer only their own queue entries", async () => {
    const response = await call(
      SEED.reviewerOne,
      `/api/v1/competitions/${SEED.competitionA}/review/assignments`,
    );
    const queue = ReviewerQueueResponseSchema.parse(await response.json());
    expect(queue.assignments.map((item) => item.assignmentId)).toEqual([assignmentOne]);
  });

  it("derives the queue state from the submission's runs and the reviewer's own evaluation", async () => {
    assignReviewer(
      local,
      "assignment-r1-a3",
      SEED.competitionA,
      SEED.submissionA3,
      SEED.reviewerOne,
    );
    assignReviewer(
      local,
      "assignment-r1-a4",
      SEED.competitionA,
      SEED.submissionA4,
      SEED.reviewerOne,
    );

    const response = await call(
      SEED.reviewerOne,
      `/api/v1/competitions/${SEED.competitionA}/review/assignments`,
    );
    const queue = ReviewerQueueResponseSchema.parse(await response.json());
    expect(
      Object.fromEntries(
        queue.assignments.map((item) => [item.submission.applicationCode, item.state]),
      ),
    ).toEqual({
      "A-001": "ASSIGNED",
      "A-003": "ANALYSIS_UNAVAILABLE",
      "A-004": "ANALYSIS_PENDING",
    });
  });
});

describe("reviewer report access", () => {
  it("streams the report through the reviewer's own assignment without exposing the storage key", async () => {
    const response = await call(
      SEED.reviewerOne,
      `/api/v1/competitions/${SEED.competitionA}/review/assignments/${assignmentOne}/report`,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const body = await response.text();
    expect(body.startsWith("%PDF-1.4")).toBe(true);
    // The key was resolved server-side and appears nowhere in the response.
    expect(harness.requestedStorageKeys).toHaveLength(1);
    expect(body).not.toContain("competitions/");
  });

  it("denies the report to a reviewer without that assignment", async () => {
    const response = await call(
      SEED.reviewerTwo,
      `/api/v1/competitions/${SEED.competitionA}/review/assignments/${assignmentOne}/report`,
    );
    expect(response.status).toBe(404);
    expect(harness.requestedStorageKeys).toHaveLength(0);
  });
});

describe("reviewer workspace projection", () => {
  it("pins the run, exposes verified evidence pages and keeps AI and human scores separate", async () => {
    const response = await call(SEED.reviewerOne, workspacePath(assignmentOne));
    expect(response.status).toBe(200);
    const workspace = ReviewerWorkspaceResponseSchema.parse(await response.json());

    expect(workspace.analysisRun.id).toBe(SEED.runA1);
    expect(workspace.rubricVersionId).toBe(SEED.rubricA1);
    expect(workspace.evaluation).toBeNull();
    expect(workspace.editable).toBe(true);

    const quality = workspace.criteria.find((c) => c.criterionId === SEED.criterionA1Quality);
    expect(quality?.maxScore).toBe(10);
    expect(quality?.aiSuggestion?.suggestedScore).toBe(7);
    expect(quality?.aiSuggestion?.evidence).toEqual([
      { page: 4, excerpt: "Sentetik doğrulanmış alıntı.", verified: true },
    ]);
    // The AI suggestion is never written into the human score.
    expect(quality?.humanScore).toBeNull();
    expect(quality?.decisionTrace).toEqual({
      aiScore: 7,
      humanScore: null,
      difference: null,
      classification: "DIFFERENT_FROM_AI",
    });

    expect(workspace.totals).toEqual({
      aiSuggestedTotal: 10,
      aiMaxTotal: 15,
      humanTotal: null,
      humanMaxTotal: 15,
      scoredCriterionCount: 0,
      criterionCount: 2,
      disagreementCount: 0,
    });
  });

  it("reports a conflict when the submission has no completed analysis run", async () => {
    assignReviewer(
      local,
      "assignment-r1-a3",
      SEED.competitionA,
      SEED.submissionA3,
      SEED.reviewerOne,
    );
    const response = await call(SEED.reviewerOne, workspacePath("assignment-r1-a3"));
    expect(response.status).toBe(409);
    expect(ApiErrorResponseSchema.parse(await response.json()).code).toBe("CONFLICT");
  });
});

describe("evaluation manager and competition manager operations visibility", () => {
  const operationsPath = `/api/v1/competitions/${SEED.competitionA}/reviewer-assignments`;

  it("lets both manager roles read the assignment operations summary", async () => {
    for (const userId of [SEED.manager, SEED.evaluationManager]) {
      const response = await call(userId, operationsPath);
      expect(response.status, userId).toBe(200);
      const payload = ReviewerAssignmentOperationListResponseSchema.parse(await response.json());
      expect(payload.assignments.map((item) => item.reviewer.userId).sort()).toEqual([
        SEED.reviewerOne,
        SEED.reviewerTwo,
      ]);
    }
  });

  it("denies the operations summary to a reviewer and to a contestant", async () => {
    const reviewer = await call(SEED.reviewerOne, operationsPath);
    expect(reviewer.status).toBe(403);
  });

  it("lets both manager roles assign and unassign, and lists only reviewers of this competition", async () => {
    const reviewers = await call(
      SEED.evaluationManager,
      `/api/v1/competitions/${SEED.competitionA}/reviewers`,
    );
    expect(
      EligibleReviewerListResponseSchema.parse(await reviewers.json()).reviewers.map(
        (reviewer) => reviewer.userId,
      ),
    ).toEqual([SEED.reviewerOne, SEED.reviewerTwo]);

    const created = await call(SEED.evaluationManager, operationsPath, {
      method: "POST",
      body: { submissionId: SEED.submissionA2, reviewerUserId: SEED.reviewerOne },
    });
    expect(created.status).toBe(201);

    const duplicate = await call(SEED.evaluationManager, operationsPath, {
      method: "POST",
      body: { submissionId: SEED.submissionA2, reviewerUserId: SEED.reviewerOne },
    });
    expect(duplicate.status).toBe(409);

    const removed = await call(
      SEED.manager,
      `${operationsPath}/${(await created.json<{ id: string }>()).id}`,
      { method: "DELETE" },
    );
    expect(removed.status).toBe(204);
  });

  it("refuses to assign a submission or a reviewer belonging to another competition", async () => {
    const foreignSubmission = await call(SEED.manager, operationsPath, {
      method: "POST",
      body: { submissionId: SEED.submissionB1, reviewerUserId: SEED.reviewerOne },
    });
    expect(foreignSubmission.status).toBe(404);

    const foreignReviewer = await call(SEED.manager, operationsPath, {
      method: "POST",
      body: { submissionId: SEED.submissionA2, reviewerUserId: SEED.reviewerB },
    });
    expect(foreignReviewer.status).toBe(409);
  });

  it("refuses to assign a user who is a member but not a reviewer", async () => {
    const response = await call(SEED.manager, operationsPath, {
      method: "POST",
      body: { submissionId: SEED.submissionA2, reviewerUserId: SEED.evaluationManager },
    });
    expect(response.status).toBe(409);
  });

  it("summarises both totals and the disagreement count separately once a reviewer submits", async () => {
    await call(
      SEED.reviewerOne,
      `/api/v1/competitions/${SEED.competitionA}/review/assignments/${assignmentOne}/evaluation/submit`,
      {
        method: "POST",
        body: {
          analysisRunId: SEED.runA1,
          overallNote: "Sentetik hakem notu.",
          scores: [
            { criterionId: SEED.criterionA1Quality, score: 5, note: "Daha düşük puan verdim." },
            { criterionId: SEED.criterionA1Impact, score: 3, note: null },
          ],
        },
      },
    );

    const response = await call(SEED.evaluationManager, operationsPath);
    const payload = ReviewerAssignmentOperationListResponseSchema.parse(await response.json());
    const submitted = payload.assignments.find((item) => item.assignmentId === assignmentOne);
    expect(submitted).toMatchObject({
      evaluationStatus: "SUBMITTED",
      humanTotal: 8,
      humanMaxTotal: 15,
      aiSuggestedTotal: 10,
      aiMaxTotal: 15,
      // Only the quality criterion differs from the AI suggestion (5 vs 7).
      disagreementCount: 1,
    });

    const untouched = payload.assignments.find((item) => item.assignmentId === assignmentTwo);
    expect(untouched).toMatchObject({ evaluationStatus: null, humanTotal: null });
  });
});

describe("historical integrity across a rubric activation", () => {
  it("keeps a submitted evaluation on its own pinned run and rubric after v2 is activated", async () => {
    const submitted = await call(
      SEED.reviewerOne,
      `/api/v1/competitions/${SEED.competitionA}/review/assignments/${assignmentOne}/evaluation/submit`,
      {
        method: "POST",
        body: {
          analysisRunId: SEED.runA1,
          overallNote: null,
          scores: [
            { criterionId: SEED.criterionA1Quality, score: 9, note: null },
            { criterionId: SEED.criterionA1Impact, score: 4, note: null },
          ],
        },
      },
    );
    expect(submitted.status).toBe(200);

    activateRubricV2AndCreateNewerRun(local);

    const workspace = ReviewerWorkspaceResponseSchema.parse(
      await (await call(SEED.reviewerOne, workspacePath(assignmentOne))).json(),
    );
    // Nothing floated to rubric v2 or to the newer AnalysisRun.
    expect(workspace.analysisRun.id).toBe(SEED.runA1);
    expect(workspace.rubricVersionId).toBe(SEED.rubricA1);
    expect(workspace.evaluation?.status).toBe("SUBMITTED");
    expect(workspace.editable).toBe(false);
    expect(workspace.criteria.map((c) => [c.criterionId, c.maxScore, c.humanScore])).toEqual([
      [SEED.criterionA1Quality, 10, 9],
      [SEED.criterionA1Impact, 5, 4],
    ]);
    expect(workspace.totals).toMatchObject({
      humanTotal: 13,
      humanMaxTotal: 15,
      aiSuggestedTotal: 10,
    });
  });
});
