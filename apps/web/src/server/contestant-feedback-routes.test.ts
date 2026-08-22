import {
  ApiErrorResponseSchema,
  ContestantFeedbackOperationSchema,
  ContestantFeedbackSuggestionSchema,
  EligibleFeedbackSourceListResponseSchema,
  PublishedContestantFeedbackResponseSchema,
} from "@teknofest-ai/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createFullTestApp, type FullTestApp } from "./test-fixtures/full-app";
import type { LocalD1 } from "./test-fixtures/local-d1";
import { createMemoryDocumentStorage } from "./test-fixtures/memory-document-storage";
import { createP65World, P65 } from "./test-fixtures/p65a-world-seed";

let local: LocalD1;
let harness: FullTestApp;

beforeEach(() => {
  local = createP65World();
  harness = createFullTestApp(local, createMemoryDocumentStorage().storage);
});

afterEach(() => {
  local.close();
});

function feedbackPath(competitionId: string, submissionId: string) {
  return `/api/v1/competitions/${competitionId}/submissions/${submissionId}/feedback`;
}

const draftContent = {
  sourceReviewerEvaluationId: P65.evaluationA1,
  summary: "Sentetik özet metni.",
  strengths: ["Yöntem güçlü."],
  improvements: ["Etki ölçütü geliştirilebilir."],
  recommendations: ["Pilot uygulama önerilir."],
};

describe("feedback operations: authorization", () => {
  it("rejects an unauthenticated caller", async () => {
    const response = await harness.request(null, feedbackPath(P65.competitionA, P65.submissionA1));
    expect(response.status).toBe(401);
  });

  it("denies a reviewer from publishing", async () => {
    const response = await harness.request(
      P65.reviewerOne,
      `${feedbackPath(P65.competitionA, P65.submissionA1)}/publish`,
      { method: "POST" },
    );
    expect(response.status).toBe(403);
  });

  it("denies a contestant from managing feedback", async () => {
    const response = await harness.request(
      P65.contestantOne,
      feedbackPath(P65.competitionA, P65.submissionA1),
      { method: "PUT", body: draftContent },
    );
    expect(response.status).toBe(403);
  });

  it("allows the competition manager and the evaluation manager", async () => {
    for (const userId of [P65.manager, P65.evaluationManager]) {
      const response = await harness.request(
        userId,
        feedbackPath(P65.competitionA, P65.submissionA1),
      );
      expect(response.status, userId).toBe(200);
    }
  });
});

describe("feedback source selection", () => {
  it("lists only SUBMITTED evaluations for this submission", async () => {
    const response = await harness.request(
      P65.manager,
      `${feedbackPath(P65.competitionA, P65.submissionA1)}/sources`,
    );
    const body = EligibleFeedbackSourceListResponseSchema.parse(await response.json());
    expect(body.sources.map((s) => s.reviewerEvaluationId)).toEqual([P65.evaluationA1]);
  });

  it("rejects a draft save that cites an evaluation from a different submission", async () => {
    const response = await harness.request(
      P65.manager,
      feedbackPath(P65.competitionA, P65.submissionA1),
      {
        method: "PUT",
        body: { ...draftContent, sourceReviewerEvaluationId: "unknown-evaluation" },
      },
    );
    expect(response.status).toBe(404);
  });

  it("computes a deterministic suggestion only for a validated eligible source", async () => {
    const invalid = await harness.request(
      P65.manager,
      `${feedbackPath(P65.competitionA, P65.submissionA1)}/suggestion?sourceReviewerEvaluationId=not-real`,
    );
    expect(invalid.status).toBe(404);

    const valid = await harness.request(
      P65.manager,
      `${feedbackPath(P65.competitionA, P65.submissionA1)}/suggestion?sourceReviewerEvaluationId=${P65.evaluationA1}`,
    );
    expect(valid.status).toBe(200);
    const suggestion = ContestantFeedbackSuggestionSchema.parse(await valid.json());
    expect(suggestion.summary.length).toBeGreaterThan(0);
  });
});

describe("draft/publish lifecycle on a fresh submission", () => {
  // submissionA1 already has a PUBLISHED feedback in the seed; exercise the lifecycle on a second,
  // freshly assigned+evaluated submission instead so DRAFT behaviour can be observed.
  const freshSubmission = "p65-fresh-submission";
  const freshAssignment = "p65-fresh-assignment";
  const freshEvaluation = "p65-fresh-evaluation";

  beforeEach(() => {
    local.exec(`
      INSERT INTO submission (id, competition_id, category_id, application_code, project_title)
      VALUES ('${freshSubmission}', '${P65.competitionA}', '${P65.categoryA}', 'P65-FRESH', 'Taze Başvuru');
      INSERT INTO submission_file (id, submission_id, storage_key, original_filename, mime_type, size_bytes, sha256)
      VALUES ('p65-fresh-file', '${freshSubmission}', 'competitions/${P65.competitionA}/submissions/${freshSubmission}/file/report.pdf', 'rapor.pdf', 'application/pdf', 2048, '${"f".repeat(64)}');
      INSERT INTO analysis_run (
        id, submission_id, category_id, template_version_id, rubric_version_id, source_sha256,
        status, stage, workflow_instance_id, document_artifact_key, page_count, character_count,
        extraction_warnings, created_at, started_at, completed_at
      ) VALUES ('p65-fresh-run', '${freshSubmission}', '${P65.categoryA}', '${P65.templateA1}', '${P65.rubricA1}', '${"f".repeat(64)}', 'SUCCEEDED', 'RUBRIC_EVALUATION', 'p65-fresh-run', 'fresh.json', 8, 4000, '[]', 100, 100, 200);
      INSERT INTO reviewer_assignment (id, competition_id, submission_id, reviewer_user_id, assigned_by_user_id)
      VALUES ('${freshAssignment}', '${P65.competitionA}', '${freshSubmission}', '${P65.reviewerOne}', '${P65.manager}');
      INSERT INTO reviewer_evaluation (id, assignment_id, submission_id, analysis_run_id, rubric_version_id, status)
      VALUES ('${freshEvaluation}-draft', '${freshAssignment}', '${freshSubmission}', 'p65-fresh-run', '${P65.rubricA1}', 'DRAFT');
    `);
  });

  it("does not let a draft (unfinished) evaluation become a feedback source", async () => {
    const sources = EligibleFeedbackSourceListResponseSchema.parse(
      await (
        await harness.request(
          P65.manager,
          `${feedbackPath(P65.competitionA, freshSubmission)}/sources`,
        )
      ).json(),
    );
    expect(sources.sources).toEqual([]);

    const response = await harness.request(
      P65.manager,
      feedbackPath(P65.competitionA, freshSubmission),
      {
        method: "PUT",
        body: { ...draftContent, sourceReviewerEvaluationId: `${freshEvaluation}-draft` },
      },
    );
    expect(response.status).toBe(404);
  });

  it("full lifecycle: submit evaluation, save draft, publish, then verify immutability", async () => {
    local.exec(
      `UPDATE reviewer_evaluation SET status = 'SUBMITTED', submitted_at = 900 WHERE id = '${freshEvaluation}-draft'`,
    );

    const saved = await harness.request(
      P65.evaluationManager,
      feedbackPath(P65.competitionA, freshSubmission),
      {
        method: "PUT",
        body: { ...draftContent, sourceReviewerEvaluationId: `${freshEvaluation}-draft` },
      },
    );
    expect(saved.status).toBe(200);
    const savedBody = ContestantFeedbackOperationSchema.parse(await saved.json());
    expect(savedBody.status).toBe("DRAFT");
    expect(savedBody.content.summary).toBe(draftContent.summary);

    // Re-saving with a DIFFERENT, but equally valid and SUBMITTED, source for the SAME submission
    // is rejected: the pin does not float once a draft exists.
    local.exec(`
      INSERT INTO "user" (id, name, email) VALUES ('p65-user-reviewer-two', 'Hakem İki', 'p65-r2@example.com');
      INSERT INTO competition_member (id, competition_id, user_id, role)
      VALUES ('p65-m-a-r2', '${P65.competitionA}', 'p65-user-reviewer-two', 'REVIEWER');
      INSERT INTO reviewer_assignment (id, competition_id, submission_id, reviewer_user_id, assigned_by_user_id)
      VALUES ('p65-fresh-assignment-2', '${P65.competitionA}', '${freshSubmission}', 'p65-user-reviewer-two', '${P65.manager}');
      INSERT INTO reviewer_evaluation (id, assignment_id, submission_id, analysis_run_id, rubric_version_id, status, submitted_at)
      VALUES ('p65-fresh-evaluation-2', 'p65-fresh-assignment-2', '${freshSubmission}', 'p65-fresh-run', '${P65.rubricA1}', 'SUBMITTED', 950);
    `);
    const staleAttempt = await harness.request(
      P65.manager,
      feedbackPath(P65.competitionA, freshSubmission),
      {
        method: "PUT",
        body: { ...draftContent, sourceReviewerEvaluationId: "p65-fresh-evaluation-2" },
      },
    );
    expect(staleAttempt.status).toBe(409);

    const published = await harness.request(
      P65.manager,
      `${feedbackPath(P65.competitionA, freshSubmission)}/publish`,
      { method: "POST" },
    );
    expect(published.status).toBe(200);
    const publishedBody = ContestantFeedbackOperationSchema.parse(await published.json());
    expect(publishedBody.status).toBe("PUBLISHED");
    expect(publishedBody.publishedByUserId).toBe(P65.manager);
    expect(publishedBody.publishedAt).not.toBeNull();

    // Published feedback is immutable: neither another save nor another publish is accepted.
    const editAfterPublish = await harness.request(
      P65.manager,
      feedbackPath(P65.competitionA, freshSubmission),
      {
        method: "PUT",
        body: {
          ...draftContent,
          sourceReviewerEvaluationId: `${freshEvaluation}-draft`,
          summary: "Değiştirilmiş özet",
        },
      },
    );
    expect(editAfterPublish.status).toBe(409);

    const republish = await harness.request(
      P65.manager,
      `${feedbackPath(P65.competitionA, freshSubmission)}/publish`,
      { method: "POST" },
    );
    expect(republish.status).toBe(409);
  });

  // A DRAFT may stay partial for as long as the manager needs, but a PUBLICATION must carry every
  // section the contestant flow promises: summary, strengths, improvements and recommendations.
  describe("publication completeness", () => {
    beforeEach(() => {
      local.exec(
        `UPDATE reviewer_evaluation SET status = 'SUBMITTED', submitted_at = 900 WHERE id = '${freshEvaluation}-draft'`,
      );
    });

    async function saveDraft(content: Record<string, unknown>) {
      const response = await harness.request(
        P65.manager,
        feedbackPath(P65.competitionA, freshSubmission),
        {
          method: "PUT",
          body: {
            ...draftContent,
            sourceReviewerEvaluationId: `${freshEvaluation}-draft`,
            ...content,
          },
        },
      );
      return response;
    }

    async function publish() {
      return harness.request(
        P65.manager,
        `${feedbackPath(P65.competitionA, freshSubmission)}/publish`,
        { method: "POST" },
      );
    }

    const incompleteDrafts = {
      "only a summary": {
        summary: "Yalnızca özet.",
        strengths: [],
        improvements: [],
        recommendations: [],
      },
      "no summary": { summary: null },
      "no strengths": { strengths: [] },
      "no improvements": { improvements: [] },
      "no recommendations": { recommendations: [] },
    } as const;

    for (const [label, content] of Object.entries(incompleteDrafts)) {
      it(`accepts the incomplete draft with ${label} but refuses to publish it`, async () => {
        expect((await saveDraft(content)).status).toBe(200);

        const response = await publish();
        expect(response.status).toBe(400);
        expect(ApiErrorResponseSchema.parse(await response.json()).code).toBe("VALIDATION_ERROR");

        // Nothing was published: the contestant still sees no result.
        const stored = local.query(
          "SELECT status FROM contestant_feedback WHERE submission_id = ?",
          freshSubmission,
        ) as { status: string }[];
        expect(stored[0]?.status).toBe("DRAFT");
      });
    }

    it("rejects whitespace-only content at the draft boundary, so it can never reach publication", async () => {
      const whitespacePoints = await saveDraft({ strengths: ["   "] });
      expect(whitespacePoints.status).toBe(400);
      expect(ApiErrorResponseSchema.parse(await whitespacePoints.json()).code).toBe(
        "VALIDATION_ERROR",
      );

      // A whitespace-only summary is stored as "no summary at all", and therefore blocks publishing
      // exactly like an omitted one rather than publishing a blank section.
      expect((await saveDraft({ summary: "    " })).status).toBe(200);
      const stored = local.query(
        "SELECT summary FROM contestant_feedback WHERE submission_id = ?",
        freshSubmission,
      ) as { summary: string | null }[];
      expect(stored[0]?.summary).toBeNull();
      expect((await publish()).status).toBe(400);
    });

    it("publishes once all four sections are written and delivers all three to the contestant", async () => {
      expect((await saveDraft({})).status).toBe(200);
      const published = await publish();
      expect(published.status).toBe(200);
      expect(ContestantFeedbackOperationSchema.parse(await published.json()).status).toBe(
        "PUBLISHED",
      );

      local.exec(
        `INSERT INTO submission_participant (id, competition_id, submission_id, user_id)
         VALUES ('p65-fresh-participant', '${P65.competitionA}', '${freshSubmission}', '${P65.contestantOne}')`,
      );
      const contestantView = PublishedContestantFeedbackResponseSchema.parse(
        await (
          await harness.request(
            P65.contestantOne,
            `/api/v1/me/submissions/${freshSubmission}/feedback`,
          )
        ).json(),
      );
      expect(contestantView.summary).toBe(draftContent.summary);
      expect(contestantView.strengths).toEqual(draftContent.strengths);
      expect(contestantView.improvements).toEqual(draftContent.improvements);
      expect(contestantView.recommendations).toEqual(draftContent.recommendations);
    });
  });
});

describe("feedback source cannot cross a competition boundary", () => {
  it("rejects a source evaluation id that belongs to a submission in a DIFFERENT competition", async () => {
    // evaluationA1 belongs to competitionA/submissionA1. Attempting to cite it as the source for
    // competitionB's own submission must fail even though the id itself is real and SUBMITTED.
    const response = await harness.request(
      P65.foreignManager,
      feedbackPath(P65.competitionB, P65.submissionB1),
      { method: "PUT", body: { ...draftContent, sourceReviewerEvaluationId: P65.evaluationA1 } },
    );
    expect(response.status).toBe(404);
  });
});
