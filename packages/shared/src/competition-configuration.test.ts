import { describe, expect, it } from "vitest";

import {
  CompetitionConfigurationResponseSchema,
  CriteriaReplaceRequestSchema,
  deriveConfigurationReadiness,
  TemplateStructuralProfileSchema,
} from "./competition-configuration";

describe("competition configuration contracts", () => {
  it("rejects duplicate and non-deterministic template sections", () => {
    const result = TemplateStructuralProfileSchema.safeParse({
      expectedLanguage: "tr",
      sections: [
        { key: "ozet", title: "Özet", description: "", required: true, order: 1 },
        { key: "ozet", title: "Tekrar", description: "", required: false, order: 3 },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("rejects duplicate criterion codes and invalid score values", () => {
    const result = CriteriaReplaceRequestSchema.safeParse({
      criteria: [
        {
          code: "innovation",
          name: "Yenilik",
          description: "Açıklama",
          maxScore: 0,
          weight: 50,
          evidenceExpectation: "Somut kanıt",
          order: 1,
        },
        {
          code: "innovation",
          name: "Tekrar",
          description: "Açıklama",
          maxScore: 10,
          weight: 50,
          evidenceExpectation: "Somut kanıt",
          order: 2,
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("derives readiness only from active, usable configuration", () => {
    const competition = {
      id: "competition-a",
      name: "Yarışma A",
      slug: "yarisma-a",
      description: "",
      createdAt: 1,
      updatedAt: 1,
    };
    const base = { competition, categories: [], templates: [], rubrics: [] };

    expect(deriveConfigurationReadiness(base).ready).toBe(false);

    const complete = {
      competition,
      categories: [
        {
          id: "category-a",
          competitionId: "competition-a",
          name: "Yapay Zekâ",
          code: "yapay-zeka",
          description: "Açıklama",
          guidance: "",
          order: 1,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      templates: [
        {
          id: "template-a",
          competitionId: "competition-a",
          versionNumber: 1,
          label: "v1",
          status: "ACTIVE" as const,
          structuralProfile: {
            expectedLanguage: "tr",
            sections: [{ key: "ozet", title: "Özet", description: "", required: true, order: 1 }],
          },
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      rubrics: [
        {
          id: "rubric-a",
          competitionId: "competition-a",
          versionNumber: 1,
          label: "v1",
          status: "ACTIVE" as const,
          criteria: [
            {
              id: "criterion-a",
              rubricVersionId: "rubric-a",
              code: "innovation",
              name: "Yenilik",
              description: "Açıklama",
              maxScore: 10,
              weight: 100,
              evidenceExpectation: "Somut kanıt",
              order: 1,
              createdAt: 1,
              updatedAt: 1,
            },
          ],
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    };

    const readiness = deriveConfigurationReadiness(complete);

    expect(readiness).toEqual({
      competition: true,
      categories: true,
      activeTemplate: true,
      activeRubric: true,
      rubricHasCriteria: true,
      ready: true,
    });
    expect(CompetitionConfigurationResponseSchema.parse({ ...complete, readiness })).toBeDefined();
  });
});
