import { describe, expect, it } from "vitest";

import {
  ExactDuplicateSignalSchema,
  MAX_SUBMISSION_PDF_BYTES,
  SubmissionCreateMetadataSchema,
  SubmissionResponseSchema,
} from "./submission";

describe("submission contracts", () => {
  it("centralizes the 20 MiB application boundary", () => {
    expect(MAX_SUBMISSION_PDF_BYTES).toBe(20_971_520);
  });

  it("normalizes required scalar upload metadata", () => {
    expect(
      SubmissionCreateMetadataSchema.parse({
        applicationCode: "  APP-42  ",
        projectTitle: "  Güvenli Değerlendirme  ",
        categoryId: " category-a ",
      }),
    ).toEqual({
      applicationCode: "APP-42",
      projectTitle: "Güvenli Değerlendirme",
      categoryId: "category-a",
    });
  });

  it("rejects storage keys and client-computed file facts in strict metadata input", () => {
    expect(
      SubmissionCreateMetadataSchema.safeParse({
        applicationCode: "APP-42",
        projectTitle: "Proje",
        categoryId: "category-a",
        storageKey: "attacker/key",
        sha256: "0".repeat(64),
      }).success,
    ).toBe(false);
  });

  it("models exact duplicates as a neutral signal", () => {
    expect(
      ExactDuplicateSignalSchema.parse({ exactDuplicate: true, matchingSubmissionCount: 2 }),
    ).toEqual({ exactDuplicate: true, matchingSubmissionCount: 2 });
  });

  it("does not allow a storage key in the public response", () => {
    const parsed = SubmissionResponseSchema.parse({
      id: "submission-a",
      competitionId: "competition-a",
      applicationCode: "APP-42",
      projectTitle: "Proje",
      category: { id: "category-a", code: "ai", name: "Yapay Zekâ" },
      file: {
        id: "file-a",
        originalFilename: "rapor.pdf",
        mimeType: "application/pdf",
        sizeBytes: 20,
        sha256: "a".repeat(64),
        createdAt: 1,
      },
      exactDuplicate: false,
      matchingSubmissionCount: 0,
      createdAt: 1,
      updatedAt: 1,
    });

    expect(parsed).not.toHaveProperty("storageKey");
    expect(parsed.file).not.toHaveProperty("storageKey");
  });
});
