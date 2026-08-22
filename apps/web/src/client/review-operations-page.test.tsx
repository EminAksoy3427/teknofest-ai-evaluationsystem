import type { ReviewOperationsItem } from "@teknofest-ai/shared";
import { deriveReviewPriority } from "@teknofest-ai/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { OperationsTable, PriorityCell } from "./review-operations-page";
import {
  analysisStateOf,
  EMPTY_OPERATIONS_FILTERS,
  filterOperations,
  primaryHumanTotal,
  reviewerStateOf,
  sortOperations,
} from "./review-operations-view";

// The queue's narrowing and ordering are pure functions, so they are asserted directly rather than
// through a rendered table. The rendering assertions that matter are the product-boundary ones: the
// level always arrives with its reasons, and no percentage or verdict wording is ever produced.

function item(overrides: {
  code: string;
  categoryId?: string;
  categoryName?: string;
  latestRunStatus?: ReviewOperationsItem["analysis"]["latestRunStatus"];
  similarityLevel?: ReviewOperationsItem["analysis"]["similarityLevel"];
  aiSuggestedTotal?: number | null;
  disagreementCount?: number;
  reviewers?: ReviewOperationsItem["reviewers"];
  signals?: Parameters<typeof deriveReviewPriority>[0];
}): ReviewOperationsItem {
  const reviewers = overrides.reviewers ?? [];
  // `null` is a meaningful value for both of these, so presence of the key decides the default.
  const latestRunStatus =
    "latestRunStatus" in overrides ? overrides.latestRunStatus : ("SUCCEEDED" as const);
  const aiSuggestedTotal = "aiSuggestedTotal" in overrides ? overrides.aiSuggestedTotal : 12;
  const priority =
    overrides.signals === undefined
      ? deriveReviewPriority({
          analysisStatus: latestRunStatus ?? null,
          referenceRunAvailable: latestRunStatus === "SUCCEEDED",
          checkStatuses: latestRunStatus === "SUCCEEDED" ? { RUBRIC_EVALUATION: "PASS" } : {},
          similarityLevel: overrides.similarityLevel ?? "LOW",
          exactDocumentMatch: false,
          weakEvidenceSectionCount: 0,
          weakEvidenceCriterionCount: 0,
          assignedReviewerCount: reviewers.length,
          startedEvaluationCount: reviewers.filter((r) => r.evaluationStatus !== null).length,
          submittedEvaluationCount: reviewers.filter((r) => r.evaluationStatus === "SUBMITTED")
            .length,
          disagreementCount: overrides.disagreementCount ?? 0,
        })
      : deriveReviewPriority(overrides.signals);

  return {
    submissionId: `submission-${overrides.code}`,
    applicationCode: overrides.code,
    projectTitle: `Proje ${overrides.code}`,
    category: {
      id: overrides.categoryId ?? "category-a",
      code: "tarim",
      name: overrides.categoryName ?? "Tarım Teknolojileri",
    },
    analysis: {
      latestRunId: latestRunStatus === null ? null : "run-1",
      latestRunStatus,
      latestRunStage: latestRunStatus === null ? null : "RUBRIC_EVALUATION",
      errorCode: null,
      referenceRunId: latestRunStatus === "SUCCEEDED" ? "run-1" : null,
      checks:
        latestRunStatus === "SUCCEEDED" ? [{ type: "RUBRIC_EVALUATION", status: "PASS" }] : [],
      similarityLevel: overrides.similarityLevel ?? "LOW",
      similarityObservationCount: 0,
      exactDocumentMatch: false,
    },
    priority,
    reviewers,
    aiSuggestedTotal,
    aiMaxTotal: 15,
    submittedEvaluationCount: reviewers.filter((r) => r.evaluationStatus === "SUBMITTED").length,
    disagreementCount: overrides.disagreementCount ?? 0,
  };
}

function reviewer(overrides: {
  id: string;
  status: ReviewOperationsItem["reviewers"][number]["evaluationStatus"];
  humanTotal?: number | null;
}): ReviewOperationsItem["reviewers"][number] {
  return {
    assignmentId: `assignment-${overrides.id}`,
    userId: `user-${overrides.id}`,
    name: `Hakem ${overrides.id}`,
    email: `${overrides.id}@example.com`,
    evaluationStatus: overrides.status,
    submittedAt: overrides.status === "SUBMITTED" ? 100 : null,
    humanTotal: overrides.humanTotal ?? (overrides.status === null ? null : 10),
    humanMaxTotal: overrides.status === null ? null : 15,
    disagreementCount: overrides.status === null ? null : 0,
  };
}

const highSimilarity = item({ code: "S-01", similarityLevel: "HIGH" });
const failedAnalysis = item({ code: "S-02", latestRunStatus: "FAILED" });
const missingAnalysis = item({ code: "S-03", latestRunStatus: null });
const inProgress = item({ code: "S-04", latestRunStatus: "PROCESSING" });
const submittedClean = item({
  code: "S-05",
  reviewers: [reviewer({ id: "one", status: "SUBMITTED", humanTotal: 11 })],
});
const draftInReview = item({
  code: "S-06",
  categoryId: "category-b",
  categoryName: "Enerji",
  reviewers: [reviewer({ id: "two", status: "DRAFT" })],
  aiSuggestedTotal: null,
  disagreementCount: 3,
});
const assignedNotStarted = item({
  code: "S-07",
  reviewers: [reviewer({ id: "three", status: null })],
});

const all = [
  highSimilarity,
  failedAnalysis,
  missingAnalysis,
  inProgress,
  submittedClean,
  draftInReview,
  assignedNotStarted,
];

function codes(items: readonly ReviewOperationsItem[]) {
  return items.map((entry) => entry.applicationCode);
}

describe("derived operational states", () => {
  it("maps each analysis status onto one operational state", () => {
    expect(analysisStateOf(highSimilarity)).toBe("SUCCEEDED");
    expect(analysisStateOf(failedAnalysis)).toBe("FAILED");
    expect(analysisStateOf(missingAnalysis)).toBe("MISSING");
    expect(analysisStateOf(inProgress)).toBe("IN_PROGRESS");
  });

  it("collapses reviewer state without calling a partly finished submission done", () => {
    expect(reviewerStateOf(highSimilarity)).toBe("UNASSIGNED");
    expect(reviewerStateOf(assignedNotStarted)).toBe("NOT_STARTED");
    expect(reviewerStateOf(draftInReview)).toBe("IN_REVIEW");
    expect(reviewerStateOf(submittedClean)).toBe("SUBMITTED");

    const twoReviewers = item({
      code: "S-08",
      reviewers: [
        reviewer({ id: "a", status: "SUBMITTED" }),
        reviewer({ id: "b", status: "DRAFT" }),
      ],
    });
    expect(reviewerStateOf(twoReviewers)).toBe("IN_REVIEW");
  });

  it("reports only a submitted evaluation's total as the row's human score", () => {
    expect(primaryHumanTotal(submittedClean)).toBe(11);
    expect(primaryHumanTotal(draftInReview)).toBeNull();
  });
});

describe("filtering", () => {
  it("returns everything with the empty filter set", () => {
    expect(filterOperations(all, EMPTY_OPERATIONS_FILTERS)).toHaveLength(all.length);
  });

  it("filters by review priority", () => {
    // S-01 high similarity, S-02 failed analysis, S-03 no analysis run at all and nobody assigned.
    const high = filterOperations(all, { ...EMPTY_OPERATIONS_FILTERS, priority: "HIGH" });
    expect(codes(high)).toEqual(["S-01", "S-02", "S-03"]);
    expect(codes(filterOperations(all, { ...EMPTY_OPERATIONS_FILTERS, priority: "LOW" }))).toEqual([
      "S-05",
      "S-06",
      "S-07",
    ]);
    // S-04's analysis is still running and nobody is assigned: worth noticing, not urgent.
    expect(
      codes(filterOperations(all, { ...EMPTY_OPERATIONS_FILTERS, priority: "MEDIUM" })),
    ).toEqual(["S-04"]);
  });

  it("filters by analysis status", () => {
    expect(
      codes(filterOperations(all, { ...EMPTY_OPERATIONS_FILTERS, analysis: "FAILED" })),
    ).toEqual(["S-02"]);
    expect(
      codes(filterOperations(all, { ...EMPTY_OPERATIONS_FILTERS, analysis: "MISSING" })),
    ).toEqual(["S-03"]);
  });

  it("filters by reviewer status", () => {
    expect(
      codes(filterOperations(all, { ...EMPTY_OPERATIONS_FILTERS, reviewer: "UNASSIGNED" })),
    ).toEqual(["S-01", "S-02", "S-03", "S-04"]);
    expect(
      codes(filterOperations(all, { ...EMPTY_OPERATIONS_FILTERS, reviewer: "SUBMITTED" })),
    ).toEqual(["S-05"]);
  });

  it("filters by category", () => {
    expect(
      codes(filterOperations(all, { ...EMPTY_OPERATIONS_FILTERS, category: "category-b" })),
    ).toEqual(["S-06"]);
  });

  it("combines filters and can narrow to nothing without throwing", () => {
    expect(
      filterOperations(all, {
        ...EMPTY_OPERATIONS_FILTERS,
        priority: "HIGH",
        reviewer: "SUBMITTED",
      }),
    ).toEqual([]);
  });

  it("matches the free-text search against the code and the project title", () => {
    expect(codes(filterOperations(all, { ...EMPTY_OPERATIONS_FILTERS, search: "s-06" }))).toEqual([
      "S-06",
    ]);
    expect(
      codes(filterOperations(all, { ...EMPTY_OPERATIONS_FILTERS, search: " Proje S-01 " })),
    ).toEqual(["S-01"]);
  });
});

describe("sorting", () => {
  it("puts the highest review priority first and breaks ties deterministically", () => {
    const sorted = sortOperations(all, "PRIORITY");
    expect(sorted[0]?.priority.level).toBe("HIGH");
    expect(sorted.at(-1)?.priority.level).toBe("LOW");
    expect(codes(sortOperations(all, "PRIORITY"))).toEqual(codes(sortOperations(all, "PRIORITY")));
  });

  it("never mutates the input array", () => {
    const original = codes(all);
    sortOperations(all, "DISAGREEMENT");
    expect(codes(all)).toEqual(original);
  });

  it("sorts by application code, category and disagreement count", () => {
    expect(codes(sortOperations(all, "APPLICATION_CODE"))).toEqual([
      "S-01",
      "S-02",
      "S-03",
      "S-04",
      "S-05",
      "S-06",
      "S-07",
    ]);
    expect(codes(sortOperations(all, "CATEGORY"))[0]).toBe("S-06");
    expect(codes(sortOperations(all, "DISAGREEMENT"))[0]).toBe("S-06");
  });

  it("sorts rows with no value to the end instead of treating them as zero", () => {
    const byAi = sortOperations(all, "AI_TOTAL");
    expect(byAi.at(-1)?.applicationCode).toBe("S-06");
    const byHuman = sortOperations(all, "HUMAN_TOTAL");
    expect(byHuman[0]?.applicationCode).toBe("S-05");
  });
});

describe("priority is rendered as an explained level, never as a probability", () => {
  it("shows the level together with every reason that produced it", () => {
    const markup = renderToStaticMarkup(<PriorityCell item={highSimilarity} />);
    expect(markup).toContain("İnceleme Önceliği: Yüksek");
    expect(markup).toContain("Yüksek benzerlik sinyali");
    expect(markup).toContain("Hakem atanmamış");
  });

  it("never renders a percentage, a probability or the internal score", () => {
    const markup = renderToStaticMarkup(<OperationsTable items={all} />);
    expect(markup).not.toMatch(/\d+\s*%/);
    expect(markup).not.toContain("olasılık");
    expect(markup).not.toContain("risk");
    for (const forbidden of ["İntihal", "Diskalifiye", "Kesin ret", "AI kararı"]) {
      expect(markup).not.toContain(forbidden);
    }
  });

  it("states that a low-priority row simply has no recorded signal", () => {
    const markup = renderToStaticMarkup(<PriorityCell item={submittedClean} />);
    expect(markup).toContain("İnceleme Önceliği: Düşük");
    expect(markup).toContain("Hakem değerlendirmesi gönderildi");
  });

  it("keeps the AI suggestion and the human decision in separate labelled columns", () => {
    const markup = renderToStaticMarkup(<OperationsTable items={[submittedClean]} />);
    expect(markup).toContain("AI önerisi");
    expect(markup).toContain("Hakem kararı");
    expect(markup).toContain("12 / 15");
    expect(markup).toContain("11 / 15");
  });

  it("surfaces a failed analysis instead of leaving the row looking clean", () => {
    const markup = renderToStaticMarkup(<OperationsTable items={[failedAnalysis]} />);
    expect(markup).toContain("Analiz tamamlanamadı");
    expect(markup).toContain("Analiz çalışması tamamlanamadı");
    expect(markup).toContain("Sinyaller son başarılı koşudan okunur");
  });
});
