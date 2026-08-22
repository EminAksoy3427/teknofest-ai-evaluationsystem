import {
  ContestantFeedbackOperationSchema,
  PublishedContestantFeedbackResponseSchema,
} from "@teknofest-ai/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createFullTestApp, type FullTestApp } from "./test-fixtures/full-app";
import type { LocalD1 } from "./test-fixtures/local-d1";
import { createMemoryDocumentStorage } from "./test-fixtures/memory-document-storage";
import {
  activateNewVersionsAndAnalyze,
  createP65World,
  P65,
} from "./test-fixtures/p65a-world-seed";

// Required scenario:
//   Template v1 active, Submission S1 -> AnalysisRun R1, ReviewerEvaluation E1 submitted,
//   ContestantFeedback F1 published.
// Then: Template v2 activated, Rubric v2 activated, AnalysisRun R2 created for the SAME submission.
// F1 must still point to its original submitted evaluation context; R1 must still resolve to
// Template v1; nothing historical floats forward onto v2/R2.

let local: LocalD1;
let harness: FullTestApp;

beforeEach(() => {
  local = createP65World();
  harness = createFullTestApp(local, createMemoryDocumentStorage().storage);
});

afterEach(() => {
  local.close();
});

describe("historical integrity across a template/rubric upgrade and a newer AnalysisRun", () => {
  it("keeps R1 pinned to Template v1 and its own file hash even after v2 is activated", async () => {
    const before = local.query(
      "SELECT template_version_id FROM analysis_run WHERE id = ?",
      P65.runA1,
    ) as { template_version_id: string }[];
    expect(before[0]?.template_version_id).toBe(P65.templateA1);

    activateNewVersionsAndAnalyze(local);

    const after = local.query(
      "SELECT template_version_id FROM analysis_run WHERE id = ?",
      P65.runA1,
    ) as { template_version_id: string }[];
    expect(after[0]?.template_version_id).toBe(P65.templateA1);

    const templateRows = local.query(
      "SELECT id, status, sha256 FROM template_version WHERE competition_id = ? ORDER BY version_number",
      P65.competitionA,
    ) as { id: string; status: string; sha256: string }[];
    expect(templateRows).toEqual([
      { id: P65.templateA1, status: "RETIRED", sha256: expect.any(String) },
      { id: P65.templateA2, status: "ACTIVE", sha256: expect.any(String) },
    ]);
    expect(templateRows[0]?.sha256).not.toBe(templateRows[1]?.sha256);
  });

  it("keeps the published feedback F1 pinned to its original SUBMITTED evaluation E1, unaffected by the new run R2", async () => {
    const beforeFeedback = ContestantFeedbackOperationSchema.parse(
      await (
        await harness.request(
          P65.manager,
          `/api/v1/competitions/${P65.competitionA}/submissions/${P65.submissionA1}/feedback`,
        )
      ).json(),
    );
    expect(beforeFeedback.sourceReviewerEvaluationId).toBe(P65.evaluationA1);
    expect(beforeFeedback.status).toBe("PUBLISHED");

    activateNewVersionsAndAnalyze(local);

    const afterFeedback = ContestantFeedbackOperationSchema.parse(
      await (
        await harness.request(
          P65.manager,
          `/api/v1/competitions/${P65.competitionA}/submissions/${P65.submissionA1}/feedback`,
        )
      ).json(),
    );
    // Byte-identical: nothing about the record moved.
    expect(afterFeedback).toEqual(beforeFeedback);

    // The contestant's own published view is likewise unaffected.
    const contestantView = PublishedContestantFeedbackResponseSchema.parse(
      await (
        await harness.request(
          P65.contestantOne,
          `/api/v1/me/submissions/${P65.submissionA1}/feedback`,
        )
      ).json(),
    );
    expect(contestantView.summary).toBe(beforeFeedback.content.summary);
  });

  it("cannot create a second publication for the same submission even against the new run", async () => {
    activateNewVersionsAndAnalyze(local);

    // A manager attempting to "re-publish" against the new AnalysisRun's context must still hit
    // the one-per-submission rule; there is exactly one ContestantFeedback row for submissionA1.
    const rows = local.query(
      "SELECT id FROM contestant_feedback WHERE submission_id = ?",
      P65.submissionA1,
    );
    expect(rows).toHaveLength(1);

    const response = await harness.request(
      P65.manager,
      `/api/v1/competitions/${P65.competitionA}/submissions/${P65.submissionA1}/feedback/publish`,
      { method: "POST" },
    );
    // Already PUBLISHED: publishing again is rejected.
    expect(response.status).toBe(409);
  });

  it("the newer AnalysisRun R2 exists and is pinned to v2, while R1 remains a separate historical row", async () => {
    activateNewVersionsAndAnalyze(local);
    const runs = local.query(
      "SELECT id, template_version_id, rubric_version_id FROM analysis_run WHERE submission_id = ? ORDER BY created_at",
      P65.submissionA1,
    ) as { id: string; template_version_id: string; rubric_version_id: string }[];
    expect(runs).toEqual([
      { id: P65.runA1, template_version_id: P65.templateA1, rubric_version_id: P65.rubricA1 },
      { id: P65.runA2, template_version_id: P65.templateA2, rubric_version_id: P65.rubricA2 },
    ]);
  });
});
