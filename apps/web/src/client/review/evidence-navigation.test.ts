import type { AnalysisRunResponse } from "@teknofest-ai/shared";
import { describe, expect, it } from "vitest";

import {
  clampPage,
  collectVerifiedEvidence,
  evidenceTargetPage,
  pdfViewerUrl,
} from "./evidence-navigation";

describe("page clamping against the server-recorded page count", () => {
  it("keeps a page inside the report and never navigates past the end", () => {
    expect(clampPage(1, 8)).toBe(1);
    expect(clampPage(4, 8)).toBe(4);
    expect(clampPage(9, 8)).toBe(8);
    expect(clampPage(0, 8)).toBe(1);
    expect(clampPage(-3, 8)).toBe(1);
  });

  it("falls back to the first page when the page count or the input is unusable", () => {
    expect(clampPage(4, null)).toBe(1);
    expect(clampPage(Number.NaN, 8)).toBe(1);
    expect(clampPage(2.7, 8)).toBe(2);
  });
});

describe("evidence to page navigation", () => {
  it("navigates to the page of a server-verified evidence item", () => {
    expect(evidenceTargetPage({ page: 4, verified: true }, 8)).toBe(4);
  });

  it("refuses to navigate for evidence the server did not verify", () => {
    expect(evidenceTargetPage({ page: 4, verified: false }, 8)).toBeNull();
  });

  it("clamps a verified page that exceeds the extracted page count", () => {
    expect(evidenceTargetPage({ page: 40, verified: true }, 8)).toBe(8);
  });

  it("builds the viewer fragment the PDF pane loads for that page", () => {
    expect(pdfViewerUrl("blob:https://localhost/abc", 4, 100)).toBe(
      "blob:https://localhost/abc#page=4&zoom=100",
    );
  });
});

function runWithChecks(checks: AnalysisRunResponse["checks"]): AnalysisRunResponse {
  return {
    id: "run-a",
    submissionId: "submission-a",
    categoryId: "category-a",
    status: "SUCCEEDED",
    stage: "RUBRIC_EVALUATION",
    templateVersionId: "template-a",
    rubricVersionId: "rubric-a",
    sourceSha256: "a".repeat(64),
    ai: null,
    categorySnapshot: null,
    createdAt: 1,
    startedAt: 1,
    completedAt: 2,
    extraction: { pageCount: 8, characterCount: 100, warnings: [] },
    checks,
    error: null,
  };
}

describe("verified evidence collection", () => {
  it("collects only verified evidence and labels the check that produced it", () => {
    const run = runWithChecks([
      {
        id: "check-category",
        analysisRunId: "run-a",
        type: "CATEGORY_FIT",
        status: "PASS",
        summary: "Kategoriyle uyumlu.",
        details: {
          checkType: "CATEGORY_FIT",
          assessment: "ALIGNED",
          reason: "Sentetik gerekçe.",
          evidenceStrength: "HIGH",
          evidence: [{ page: 3, excerpt: "Doğrulanmış alıntı.", verified: true }],
          alignmentSignals: ["Tarımsal izleme"],
          mismatchSignals: [],
          sourceCoverage: "FULL",
        },
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: "check-rubric",
        analysisRunId: "run-a",
        type: "RUBRIC_EVALUATION",
        status: "PASS",
        summary: "Rubrik önerisi hazır.",
        details: {
          checkType: "RUBRIC_EVALUATION",
          criteria: [
            {
              criterionId: "criterion-a",
              code: "quality",
              title: "Teknik Kalite",
              order: 1,
              suggestedScore: 7,
              maxScore: 10,
              reason: "Sentetik gerekçe.",
              evidenceStrength: "HIGH",
              evidence: [{ page: 5, excerpt: "Kriter alıntısı.", verified: true }],
              missingPoints: [],
            },
          ],
          suggestedTotalScore: 7,
          maxTotalScore: 10,
          feedbackSummary: "Sentetik geri bildirim.",
        },
        createdAt: 1,
        updatedAt: 1,
      },
    ]);

    expect(collectVerifiedEvidence(run)).toEqual([
      { page: 3, excerpt: "Doğrulanmış alıntı.", sourceLabel: "Kategori Uyumu" },
      { page: 5, excerpt: "Kriter alıntısı.", sourceLabel: "Teknik Kalite" },
    ]);
  });
});
