import { describe, expect, it } from "vitest";

import { AnalysisRunResponseSchema, DocumentExtractionArtifactSchema } from "./analysis";

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
      createdAt: 1,
      startedAt: 2,
      completedAt: 3,
      extraction: { pageCount: 2, characterCount: 11, warnings: [] },
      error: null,
    });

    expect(response).not.toHaveProperty("documentArtifactKey");
    expect(response.extraction).not.toHaveProperty("pages");
    expect(JSON.stringify(response)).not.toContain("Merhaba");
  });
});
