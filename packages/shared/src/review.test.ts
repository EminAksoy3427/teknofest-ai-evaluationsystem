import { describe, expect, it } from "vitest";

import {
  deriveDecisionTrace,
  deriveScoreTotals,
  ReviewerEvaluationSaveRequestSchema,
} from "./review";

describe("human-AI decision trace", () => {
  it("treats an equal human score as agreement and any other score as a plain difference", () => {
    expect(deriveDecisionTrace(7, 7)).toEqual({
      aiScore: 7,
      humanScore: 7,
      difference: 0,
      classification: "SAME_AS_AI",
    });
    expect(deriveDecisionTrace(7, 5)).toEqual({
      aiScore: 7,
      humanScore: 5,
      difference: -2,
      classification: "DIFFERENT_FROM_AI",
    });
    expect(deriveDecisionTrace(7, 9)).toEqual({
      aiScore: 7,
      humanScore: 9,
      difference: 2,
      classification: "DIFFERENT_FROM_AI",
    });
  });

  it("reports a missing AI suggestion instead of implying agreement with nothing", () => {
    expect(deriveDecisionTrace(null, 5)).toMatchObject({
      classification: "NO_AI_SUGGESTION",
      difference: null,
    });
  });

  it("never classifies an unscored criterion as agreement with the AI", () => {
    expect(deriveDecisionTrace(7, null)).toMatchObject({
      humanScore: null,
      difference: null,
      classification: "DIFFERENT_FROM_AI",
    });
  });
});

describe("score totals", () => {
  const criteria = [
    { maxScore: 10, aiSuggestion: { suggestedScore: 7 }, humanScore: 5 },
    { maxScore: 5, aiSuggestion: { suggestedScore: 3 }, humanScore: 3 },
    { maxScore: 20, aiSuggestion: null, humanScore: null },
  ];

  it("keeps the AI total and the human total as two independent sums", () => {
    expect(deriveScoreTotals(criteria)).toEqual({
      aiSuggestedTotal: 10,
      aiMaxTotal: 35,
      humanTotal: 8,
      humanMaxTotal: 35,
      scoredCriterionCount: 2,
      criterionCount: 3,
      disagreementCount: 1,
    });
  });

  it("reports an untouched rubric as unscored rather than as a real total of zero", () => {
    expect(
      deriveScoreTotals([{ maxScore: 10, aiSuggestion: { suggestedScore: 7 }, humanScore: null }]),
    ).toMatchObject({ humanTotal: null, scoredCriterionCount: 0, aiSuggestedTotal: 7 });
  });

  it("counts a deliberate zero as a scored criterion", () => {
    expect(
      deriveScoreTotals([{ maxScore: 10, aiSuggestion: { suggestedScore: 7 }, humanScore: 0 }]),
    ).toMatchObject({ humanTotal: 0, scoredCriterionCount: 1, disagreementCount: 1 });
  });
});

describe("reviewer evaluation save request", () => {
  const valid = {
    analysisRunId: "run-a",
    overallNote: null,
    scores: [{ criterionId: "criterion-a", score: 5, note: null }],
  };

  it("accepts a reviewer payload and normalises a blank note to null", () => {
    const parsed = ReviewerEvaluationSaveRequestSchema.parse({
      ...valid,
      overallNote: "   ",
      scores: [{ criterionId: "criterion-a", score: 5, note: "  Gerekçe.  " }],
    });
    expect(parsed.overallNote).toBeNull();
    expect(parsed.scores[0]?.note).toBe("Gerekçe.");
  });

  it("rejects a client-supplied reviewer identity, rubric version or total", () => {
    for (const forged of [
      { reviewerUserId: "user-b" },
      { assignmentId: "assignment-b" },
      { rubricVersionId: "rubric-b" },
      { humanTotal: 15 },
      { totalScore: 15 },
    ]) {
      expect(
        ReviewerEvaluationSaveRequestSchema.safeParse({ ...valid, ...forged }).success,
        JSON.stringify(forged),
      ).toBe(false);
    }
  });

  it("rejects a negative or fractional score and a repeated criterion", () => {
    expect(
      ReviewerEvaluationSaveRequestSchema.safeParse({
        ...valid,
        scores: [{ criterionId: "criterion-a", score: -1, note: null }],
      }).success,
    ).toBe(false);
    expect(
      ReviewerEvaluationSaveRequestSchema.safeParse({
        ...valid,
        scores: [{ criterionId: "criterion-a", score: 2.5, note: null }],
      }).success,
    ).toBe(false);
    expect(
      ReviewerEvaluationSaveRequestSchema.safeParse({
        ...valid,
        scores: [
          { criterionId: "criterion-a", score: 1, note: null },
          { criterionId: "criterion-a", score: 2, note: null },
        ],
      }).success,
    ).toBe(false);
  });
});
