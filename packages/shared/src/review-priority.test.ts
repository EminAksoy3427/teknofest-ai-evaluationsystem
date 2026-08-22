import { describe, expect, it } from "vitest";

import {
  deriveReviewPriority,
  REVIEW_PRIORITY_HIGH_THRESHOLD,
  REVIEW_PRIORITY_MEDIUM_THRESHOLD,
  REVIEW_PRIORITY_REASON_WEIGHTS,
  ReviewPriorityAssessmentSchema,
  type ReviewPrioritySignals,
} from "./review-priority";

// The review priority is a deterministic, fully explainable ordering, not a probability and not a
// decision. These assertions pin the three properties that make it safe to show a manager: the same
// signals always give the same answer, the level is exactly what the visible reasons add up to, and
// no signal — not even a byte-identical report — is ever reported as a verdict.

const clean: ReviewPrioritySignals = {
  analysisStatus: "SUCCEEDED",
  referenceRunAvailable: true,
  checkStatuses: {
    LANGUAGE: "PASS",
    TEMPLATE_STRUCTURE: "PASS",
    SECTION_PRESENCE: "PASS",
    SECTION_CONTENT: "PASS",
    CATEGORY_FIT: "PASS",
    SIMILARITY: "PASS",
    RUBRIC_EVALUATION: "PASS",
  },
  similarityLevel: "LOW",
  exactDocumentMatch: false,
  weakEvidenceSectionCount: 0,
  weakEvidenceCriterionCount: 0,
  assignedReviewerCount: 1,
  startedEvaluationCount: 1,
  submittedEvaluationCount: 0,
  disagreementCount: 0,
};

function priority(overrides: Partial<ReviewPrioritySignals> = {}) {
  return deriveReviewPriority({ ...clean, ...overrides });
}

function codes(overrides: Partial<ReviewPrioritySignals> = {}) {
  return priority(overrides).reasons.map((reason) => reason.code);
}

describe("deterministic review priority", () => {
  it("reports a clean submission under active review as low priority with no reasons", () => {
    const assessment = priority();
    expect(assessment.level).toBe("LOW");
    expect(assessment.score).toBe(0);
    expect(assessment.reasons).toEqual([]);
  });

  it("produces byte-identical output for identical signals", () => {
    const signals: Partial<ReviewPrioritySignals> = {
      similarityLevel: "MEDIUM",
      checkStatuses: { ...clean.checkStatuses, CATEGORY_FIT: "WARN", SECTION_CONTENT: "WARN" },
      weakEvidenceCriterionCount: 2,
    };
    expect(JSON.stringify(priority(signals))).toBe(JSON.stringify(priority(signals)));
  });

  it("keeps the level exactly equal to the sum of the visible reason weights", () => {
    const assessment = priority({
      similarityLevel: "HIGH",
      exactDocumentMatch: true,
      checkStatuses: { ...clean.checkStatuses, CATEGORY_FIT: "WARN" },
    });
    // The schema itself refuses an assessment whose score is not the sum of its reasons, so parsing
    // is the assertion that nothing is hidden from the manager.
    expect(() => ReviewPriorityAssessmentSchema.parse(assessment)).not.toThrow();
    expect(assessment.score).toBe(
      assessment.reasons.reduce((total, reason) => total + reason.weight, 0),
    );
    expect(assessment.level).toBe("HIGH");
  });

  it("orders reasons by weight and then canonically, so the strongest signal reads first", () => {
    const assessment = priority({
      similarityLevel: "HIGH",
      checkStatuses: { ...clean.checkStatuses, LANGUAGE: "WARN", CATEGORY_FIT: "FAIL" },
    });
    expect(assessment.reasons.map((reason) => reason.code)).toEqual([
      "SIMILARITY_HIGH",
      "CATEGORY_FIT_FAIL",
      "LANGUAGE_WARN",
    ]);
  });

  it("uses the exported weight table rather than inlined numbers", () => {
    const assessment = priority({ similarityLevel: "MEDIUM" });
    expect(assessment.reasons[0]?.weight).toBe(REVIEW_PRIORITY_REASON_WEIGHTS.SIMILARITY_MEDIUM);
  });

  it("keeps the thresholds ordered so MEDIUM is reachable below HIGH", () => {
    expect(REVIEW_PRIORITY_MEDIUM_THRESHOLD).toBeLessThan(REVIEW_PRIORITY_HIGH_THRESHOLD);
  });
});

describe("similarity raises review priority without producing a verdict", () => {
  it("lifts a high similarity observation to high review priority", () => {
    const assessment = priority({ similarityLevel: "HIGH" });
    expect(assessment.level).toBe("HIGH");
    expect(assessment.reasons.map((reason) => reason.label)).toEqual(["Yüksek benzerlik sinyali"]);
  });

  it("raises the level for a medium observation without reaching high on its own", () => {
    expect(priority({ similarityLevel: "MEDIUM" }).level).toBe("LOW");
    expect(priority({ similarityLevel: "MEDIUM" }).score).toBeGreaterThan(priority().score);
    expect(
      priority({
        similarityLevel: "MEDIUM",
        checkStatuses: { ...clean.checkStatuses, CATEGORY_FIT: "WARN" },
      }).level,
    ).toBe("MEDIUM");
  });

  it("treats an exact document match as a signal, never as a plagiarism finding", () => {
    const assessment = priority({ exactDocumentMatch: true });
    expect(assessment.reasons.map((reason) => reason.code)).toEqual(["EXACT_DOCUMENT_MATCH"]);
    const wording = assessment.reasons.map((reason) => reason.label).join(" ");
    for (const forbidden of ["intihal", "kopya", "sahte", "diskalifiye", "olasılık", "%"]) {
      expect(wording.toLocaleLowerCase("tr-TR")).not.toContain(forbidden);
    }
  });

  it("never double counts the SIMILARITY check status on top of its own level", () => {
    // The SIMILARITY check is WARN for every non-LOW level, so counting both would weigh one
    // observation twice.
    expect(
      codes({
        similarityLevel: "HIGH",
        checkStatuses: { ...clean.checkStatuses, SIMILARITY: "WARN" },
      }),
    ).toEqual(["SIMILARITY_HIGH"]);
  });
});

describe("analysis availability is surfaced instead of hidden", () => {
  it("raises a failed analysis to high priority", () => {
    const assessment = priority({
      analysisStatus: "FAILED",
      referenceRunAvailable: false,
      checkStatuses: {},
      similarityLevel: null,
    });
    expect(assessment.level).toBe("HIGH");
    expect(assessment.reasons.map((reason) => reason.code)).toEqual(["ANALYSIS_FAILED"]);
  });

  it("keeps an older successful run's check reasons next to a newer failure", () => {
    expect(
      codes({
        analysisStatus: "FAILED",
        checkStatuses: { ...clean.checkStatuses, SECTION_PRESENCE: "FAIL" },
      }),
    ).toEqual(["ANALYSIS_FAILED", "SECTION_PRESENCE_FAIL"]);
  });

  it("reports a submission with no analysis run at all", () => {
    expect(
      codes({
        analysisStatus: null,
        referenceRunAvailable: false,
        checkStatuses: {},
        similarityLevel: null,
        assignedReviewerCount: 0,
        startedEvaluationCount: 0,
      }),
    ).toEqual(["ANALYSIS_MISSING", "NO_REVIEWER_ASSIGNED"]);
  });

  it("reports an in-flight analysis without treating it as a problem", () => {
    const assessment = priority({
      analysisStatus: "PROCESSING",
      referenceRunAvailable: false,
      checkStatuses: {},
      similarityLevel: null,
    });
    expect(assessment.reasons.map((reason) => reason.code)).toEqual(["ANALYSIS_IN_PROGRESS"]);
    expect(assessment.level).toBe("LOW");
  });

  it("notes a successful run that carries no AI rubric suggestion", () => {
    const { RUBRIC_EVALUATION: _omitted, ...withoutRubric } = clean.checkStatuses;
    expect(codes({ checkStatuses: withoutRubric })).toEqual(["RUBRIC_SUGGESTION_MISSING"]);
  });
});

describe("reviewer state is a priority signal, not a judgement of the reviewer", () => {
  it("flags an unassigned submission and does not also claim the review has not started", () => {
    expect(codes({ assignedReviewerCount: 0, startedEvaluationCount: 0 })).toEqual([
      "NO_REVIEWER_ASSIGNED",
    ]);
  });

  it("flags an assigned submission nobody has opened yet", () => {
    expect(codes({ startedEvaluationCount: 0 })).toEqual(["REVIEW_NOT_STARTED"]);
  });

  it("states that human review finished without letting that fact change the level", () => {
    const completed = priority({ submittedEvaluationCount: 1 });
    expect(completed.reasons.map((reason) => reason.code)).toEqual(["HUMAN_REVIEW_COMPLETED"]);
    expect(completed.score).toBe(0);
    expect(completed.level).toBe("LOW");
  });

  it("keeps a remaining similarity signal visible after a reviewer submitted", () => {
    const assessment = priority({ submittedEvaluationCount: 1, similarityLevel: "HIGH" });
    expect(assessment.level).toBe("HIGH");
    expect(assessment.reasons.map((reason) => reason.code)).toEqual([
      "SIMILARITY_HIGH",
      "HUMAN_REVIEW_COMPLETED",
    ]);
  });

  it("presents an AI/human difference as an observation with a count", () => {
    const assessment = priority({ submittedEvaluationCount: 1, disagreementCount: 3 });
    const disagreement = assessment.reasons.find(
      (reason) => reason.code === "AI_HUMAN_DISAGREEMENT",
    );
    expect(disagreement?.label).toBe("3 kriterde hakem puanı AI önerisinden farklı");
    expect(disagreement?.label.toLocaleLowerCase("tr-TR")).not.toContain("hata");
  });
});

describe("weak evidence is counted, not scored as a probability", () => {
  it("names how many required sections and criteria carry weak evidence", () => {
    const assessment = priority({ weakEvidenceSectionCount: 2, weakEvidenceCriterionCount: 1 });
    expect(assessment.reasons.map((reason) => reason.label)).toEqual([
      "2 zorunlu bölümde zayıf kanıt",
      "1 kriterde AI kanıtı zayıf",
    ]);
    expect(assessment.level).toBe("MEDIUM");
  });
});
