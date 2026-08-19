import type {
  AnalysisCheckResponse,
  AnalysisRunResponse,
  SemanticEvidenceStrength,
} from "@teknofest-ai/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AnalysisResults } from "./submissions-page";

const labels = {
  HIGH: "Yüksek",
  MEDIUM: "Orta",
  LOW: "Düşük",
} as const satisfies Record<SemanticEvidenceStrength, string>;

function runWith(check: AnalysisCheckResponse): AnalysisRunResponse {
  return {
    id: "run-1",
    submissionId: "submission-1",
    categoryId: "category-1",
    status: "SUCCEEDED",
    stage: "SEMANTIC_CHECKS",
    templateVersionId: "template-version-1",
    rubricVersionId: "rubric-version-1",
    sourceSha256: "a".repeat(64),
    ai: null,
    categorySnapshot: null,
    createdAt: 1,
    startedAt: 1,
    completedAt: 1,
    extraction: {
      pageCount: 1,
      characterCount: 32,
      warnings: [],
    },
    checks: [check],
    error: null,
  };
}

function semanticCheck(
  type: "SECTION_CONTENT" | "CATEGORY_FIT",
  evidenceStrength: SemanticEvidenceStrength,
): AnalysisCheckResponse {
  const common = {
    id: `check-${type}`,
    analysisRunId: "run-1",
    status: "PASS" as const,
    summary: "İnsan değerlendirmesini destekleyen semantik bulgu.",
    createdAt: 1,
    updatedAt: 1,
  };
  const evidence = [{ page: 1, excerpt: "Doğrulanmış sentetik kanıt.", verified: true as const }];

  if (type === "SECTION_CONTENT") {
    return {
      ...common,
      type,
      details: {
        checkType: type,
        sections: [
          {
            sectionKey: "amac",
            title: "Amaç",
            required: true,
            assessment: "SUPPORTED",
            reason: "Beklenen içerik mevcut.",
            evidenceStrength,
            evidence,
            missingExpectations: [],
            sourceCoverage: "FULL",
            startPage: 1,
            endPage: 1,
          },
        ],
      },
    };
  }

  return {
    ...common,
    type,
    details: {
      checkType: type,
      assessment: "ALIGNED",
      reason: "Kategori kapsamıyla uyumlu.",
      evidenceStrength,
      evidence,
      alignmentSignals: [],
      mismatchSignals: [],
      sourceCoverage: "FULL",
    },
  };
}

describe("semantic analysis evidence strength UI", () => {
  for (const type of ["SECTION_CONTENT", "CATEGORY_FIT"] as const) {
    it.each(Object.entries(labels))(
      `${type} renders %s as %s without a confidence percentage`,
      (strength, label) => {
        const markup = renderToStaticMarkup(
          <AnalysisResults
            run={runWith(semanticCheck(type, strength as SemanticEvidenceStrength))}
          />,
        );

        expect(markup).toContain(`Kanıt Gücü: ${label}`);
        expect(markup).not.toMatch(/confidence|güven\s*(?:yüzdesi|oranı)|%/iu);
      },
    );
  }
});
