import { DocumentExtractionArtifactSchema, MAX_DOCUMENT_PAGES } from "@teknofest-ai/shared";
import { describe, expect, it } from "vitest";

import { createSyntheticTextPdf } from "../test-fixtures/synthetic-pdf";
import { DocumentProcessingError, extractDocument } from "./document-extraction";

const baseInput = {
  submissionId: "submission-a",
  analysisRunId: "run-a",
  sourceSha256: "a".repeat(64),
};

describe("Worker-compatible PDF text extraction", () => {
  it("extracts a valid one-page PDF with deterministic counts", async () => {
    const artifact = await extractDocument({
      ...baseInput,
      bytes: createSyntheticTextPdf([
        "Synthetic one page report with enough useful text for extraction.",
      ]),
    });

    expect(artifact.pageCount).toBe(1);
    expect(artifact.pages[0]).toEqual({
      pageNumber: 1,
      text: "Synthetic one page report with enough useful text for extraction.",
      characterCount: 65,
    });
    expect(artifact.characterCount).toBe(65);
    expect(DocumentExtractionArtifactSchema.parse(artifact)).toEqual(artifact);
  });

  it("preserves multi-page boundaries and 1-based ordering", async () => {
    const artifact = await extractDocument({
      ...baseInput,
      bytes: createSyntheticTextPdf(["First page evidence", "Second page evidence"]),
    });

    expect(artifact.pages.map((page) => [page.pageNumber, page.text])).toEqual([
      [1, "First page evidence"],
      [2, "Second page evidence"],
    ]);
    expect(artifact.characterCount).toBe(
      artifact.pages.reduce((total, page) => total + page.text.length, 0),
    );
  });

  it("returns a neutral sparse-text warning without inventing OCR output", async () => {
    const artifact = await extractDocument({
      ...baseInput,
      bytes: createSyntheticTextPdf([""]),
    });

    expect(artifact.pages[0]?.text).toBe("");
    expect(artifact.warnings).toEqual(["TEXT_SPARSE"]);
  });

  it("sanitizes malformed parser failures", async () => {
    const error = await extractDocument({
      ...baseInput,
      bytes: new TextEncoder().encode("%PDF-1.4\nmalformed synthetic content"),
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(DocumentProcessingError);
    expect(error).toMatchObject({
      code: "PDF_PARSE_FAILED",
      safeMessage: "PDF metni güvenli biçimde çıkarılamadı.",
    });
    expect((error as Error).message).not.toContain("xref");
  });

  it("rejects documents above the page guard without a large fixture", async () => {
    const bytes = createSyntheticTextPdf(Array.from({ length: MAX_DOCUMENT_PAGES + 1 }, () => "x"));
    const error = await extractDocument({ ...baseInput, bytes }).catch((caught: unknown) => caught);

    expect(error).toMatchObject({ code: "DOCUMENT_TOO_COMPLEX" });
  });
});
