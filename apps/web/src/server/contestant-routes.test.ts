import {
  ContestantOwnedSubmissionListResponseSchema,
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

describe("contestant surface: identity and ownership", () => {
  it("rejects an unauthenticated caller on both endpoints", async () => {
    const list = await harness.request(null, "/api/v1/me/submissions");
    expect(list.status).toBe(401);
    const feedback = await harness.request(
      null,
      `/api/v1/me/submissions/${P65.submissionA1}/feedback`,
    );
    expect(feedback.status).toBe(401);
  });

  it("lists only submissions this session user participates in", async () => {
    const response = await harness.request(P65.contestantOne, "/api/v1/me/submissions");
    expect(response.status).toBe(200);
    const body = ContestantOwnedSubmissionListResponseSchema.parse(await response.json());
    expect(body.submissions.map((s) => s.submissionId)).toEqual([P65.submissionA1]);
    expect(body.submissions[0]?.feedbackPublished).toBe(true);
  });

  it("reports an empty list for a contestant who owns nothing", async () => {
    const response = await harness.request(P65.contestantTwo, "/api/v1/me/submissions");
    const body = ContestantOwnedSubmissionListResponseSchema.parse(await response.json());
    expect(body.submissions).toEqual([]);
  });

  it("does not accept a client-supplied userId; identity comes only from the session", async () => {
    const response = await harness.request(
      P65.contestantTwo,
      `/api/v1/me/submissions?userId=${P65.contestantOne}`,
    );
    const body = ContestantOwnedSubmissionListResponseSchema.parse(await response.json());
    expect(body.submissions).toEqual([]);
  });
});

describe("contestant surface: published feedback", () => {
  it("returns the SAFE published projection for the owner", async () => {
    const response = await harness.request(
      P65.contestantOne,
      `/api/v1/me/submissions/${P65.submissionA1}/feedback`,
    );
    expect(response.status).toBe(200);
    const body = PublishedContestantFeedbackResponseSchema.parse(await response.json());
    expect(body.submissionId).toBe(P65.submissionA1);
    expect(body.summary).toContain("güçlü");
    expect(body.strengths.length).toBeGreaterThan(0);
  });

  it("never exposes internal identifiers, reviewer identity or AI/similarity data", async () => {
    const response = await harness.request(
      P65.contestantOne,
      `/api/v1/me/submissions/${P65.submissionA1}/feedback`,
    );
    const raw = await response.text();
    for (const forbidden of [
      P65.evaluationA1,
      P65.runA1,
      P65.reviewerOne,
      "reviewerEvaluationId",
      "analysisRunId",
      "sourceReviewerEvaluationId",
      "similarity",
      "priority",
      "disagreement",
      "storageKey",
      "storage_key",
    ]) {
      expect(raw).not.toContain(forbidden);
    }
  });

  it("does not know whether an unowned submission exists at all (404, not a different error)", async () => {
    // submissionB1 belongs to competition B; contestantOne has no participant row there.
    const response = await harness.request(
      P65.contestantOne,
      `/api/v1/me/submissions/${P65.submissionB1}/feedback`,
    );
    expect(response.status).toBe(404);
  });

  it("does not let a contestant see another submission's feedback even inside the same competition", async () => {
    const response = await harness.request(
      P65.contestantTwo,
      `/api/v1/me/submissions/${P65.submissionA1}/feedback`,
    );
    expect(response.status).toBe(404);
  });

  it("reports an owned-but-unpublished draft as 404, identical to a nonexistent one", async () => {
    // Attach contestantTwo to a submission whose feedback is still DRAFT.
    const draftSubmission = "p65-draft-submission";
    local.exec(`
      INSERT INTO submission (id, competition_id, category_id, application_code, project_title)
      VALUES ('${draftSubmission}', '${P65.competitionA}', '${P65.categoryA}', 'P65-DRAFT', 'Taslak Başvuru');
      INSERT INTO submission_file (id, submission_id, storage_key, original_filename, mime_type, size_bytes, sha256)
      VALUES ('p65-draft-file', '${draftSubmission}', 'x', 'r.pdf', 'application/pdf', 2048, '${"d".repeat(64)}');
      INSERT INTO analysis_run (
        id, submission_id, category_id, template_version_id, rubric_version_id, source_sha256,
        status, stage, workflow_instance_id, document_artifact_key, page_count, character_count,
        extraction_warnings, created_at, started_at, completed_at
      ) VALUES ('p65-draft-run', '${draftSubmission}', '${P65.categoryA}', '${P65.templateA1}', '${P65.rubricA1}', '${"d".repeat(64)}', 'SUCCEEDED', 'RUBRIC_EVALUATION', 'p65-draft-run', 'draft.json', 8, 4000, '[]', 100, 100, 200);
      INSERT INTO reviewer_assignment (id, competition_id, submission_id, reviewer_user_id, assigned_by_user_id)
      VALUES ('p65-draft-assignment', '${P65.competitionA}', '${draftSubmission}', '${P65.reviewerOne}', '${P65.manager}');
      INSERT INTO reviewer_evaluation (id, assignment_id, submission_id, analysis_run_id, rubric_version_id, status, submitted_at)
      VALUES ('p65-draft-evaluation', 'p65-draft-assignment', '${draftSubmission}', 'p65-draft-run', '${P65.rubricA1}', 'SUBMITTED', 900);
      INSERT INTO submission_participant (id, competition_id, submission_id, user_id)
      VALUES ('p65-draft-participant', '${P65.competitionA}', '${draftSubmission}', '${P65.contestantTwo}');
      INSERT INTO contestant_feedback (
        id, competition_id, submission_id, source_reviewer_evaluation_id, status, summary,
        strengths_json, improvements_json, recommendations_json, created_by_user_id
      ) VALUES (
        'p65-draft-feedback', '${P65.competitionA}', '${draftSubmission}', 'p65-draft-evaluation', 'DRAFT',
        'Henüz yayımlanmamış özet', '[]', '[]', '[]', '${P65.manager}'
      );
    `);
    const response = await harness.request(
      P65.contestantTwo,
      `/api/v1/me/submissions/${draftSubmission}/feedback`,
    );
    expect(response.status).toBe(404);
    const raw = await response.text();
    expect(raw).not.toContain("Henüz yayımlanmamış özet");

    const list = ContestantOwnedSubmissionListResponseSchema.parse(
      await (await harness.request(P65.contestantTwo, "/api/v1/me/submissions")).json(),
    );
    const draftRow = list.submissions.find((s) => s.submissionId === draftSubmission);
    expect(draftRow?.feedbackPublished).toBe(false);
  });
});
