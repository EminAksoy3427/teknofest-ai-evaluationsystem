import { describe, expect, it } from "vitest";

import {
  AnalysisCheckResponseSchema,
  AnalysisRunResponseSchema,
  DocumentExtractionArtifactSchema,
} from "./analysis";

const artifact = {
  schemaVersion: "document-extraction/v1" as const,
  submissionId: "submission-a",
  analysisRunId: "run-a",
  sourceSha256: "a".repeat(64),
  pageCount: 2,
  characterCount: 11,
  pages: [
    { pageNumber: 1, text: "Merhaba", characterCount: 7 },
    { pageNumber: 2, text: "Test", characterCount: 4 },
  ],
  warnings: [],
};

describe("document extraction artifact contract", () => {
  it("validates deterministic 1-based page boundaries and counts", () => {
    expect(DocumentExtractionArtifactSchema.parse(artifact)).toEqual(artifact);
  });

  it("rejects inconsistent page numbering and character counts", () => {
    expect(() =>
      DocumentExtractionArtifactSchema.parse({
        ...artifact,
        characterCount: 10,
        pages: [{ ...artifact.pages[0], pageNumber: 0 }, artifact.pages[1]],
      }),
    ).toThrow();
  });
});

describe("analysis run response contract", () => {
  it("keeps full extracted text and artifact keys out of status responses", () => {
    const response = AnalysisRunResponseSchema.parse({
      id: "run-a",
      submissionId: "submission-a",
      categoryId: "category-a",
      status: "SUCCEEDED",
      stage: "INGEST_AND_EXTRACT",
      templateVersionId: "template-v1",
      rubricVersionId: "rubric-v1",
      sourceSha256: "a".repeat(64),
      ai: null,
      categorySnapshot: null,
      createdAt: 1,
      startedAt: 2,
      completedAt: 3,
      extraction: { pageCount: 2, characterCount: 11, warnings: [] },
      checks: [],
      error: null,
    });

    expect(response).not.toHaveProperty("documentArtifactKey");
    expect(response.extraction).not.toHaveProperty("pages");
    expect(JSON.stringify(response)).not.toContain("Merhaba");
  });

  it("validates check details with a type discriminator and bounded evidence", () => {
    const check = AnalysisCheckResponseSchema.parse({
      id: "check-a",
      analysisRunId: "run-a",
      type: "SECTION_PRESENCE",
      status: "PASS",
      summary: "Zorunlu başlıklar bulundu.",
      details: {
        checkType: "SECTION_PRESENCE",
        sections: [
          {
            sectionKey: "summary",
            expectedTitle: "Proje Özeti",
            required: true,
            expectedOrder: 1,
            found: true,
            pageNumber: 2,
            matchedText: "1. PROJE ÖZETİ",
            occurrences: [{ pageNumber: 2, documentOrder: 0, matchedText: "1. PROJE ÖZETİ" }],
          },
        ],
        missingRequiredSectionKeys: [],
      },
      createdAt: 1,
      updatedAt: 1,
    });
    if (check.type !== "SECTION_PRESENCE") throw new Error("Beklenmeyen kontrol türü.");
    expect(check.details.sections[0]?.pageNumber).toBe(2);
    expect(JSON.stringify(check)).not.toContain("Tam rapor metni");
  });

  it("rejects mismatched or malformed persisted check details", () => {
    expect(() =>
      AnalysisCheckResponseSchema.parse({
        id: "check-a",
        analysisRunId: "run-a",
        type: "LANGUAGE",
        status: "PASS",
        summary: "Dil uyumlu.",
        details: {
          checkType: "TEMPLATE_STRUCTURE",
          missingRequiredSectionKeys: [],
          orderDeviation: false,
          duplicateHeadingKeys: [],
          extractionWarnings: [],
        },
        createdAt: 1,
        updatedAt: 1,
      }),
    ).toThrow();
  });
});
