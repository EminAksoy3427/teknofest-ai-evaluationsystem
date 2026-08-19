import type {
  AnalysisCheckRepository,
  AnalysisCheckWriteInput,
  AnalysisRunRepository,
} from "@teknofest-ai/db";
import {
  type DocumentExtractionArtifact,
  DocumentExtractionArtifactSchema,
  type TemplateStructuralProfile,
} from "@teknofest-ai/shared";
import { describe, expect, it, vi } from "vitest";

import type { DocumentStorage } from "../storage/documents";
import {
  evaluateLanguage,
  evaluateSections,
  normalizeHeading,
  normalizeLanguageIdentifier,
  processStructuralChecks,
  runDeterministicPrechecks,
} from "./structural-checks";

const turkish =
  "Bu proje yenilikçi bir teknoloji çözümü geliştirmektedir. Kullanıcıların ihtiyaçlarını karşılamak için kapsamlı araştırma yapılmış ve sürdürülebilir bir yöntem tasarlanmıştır. Sistem güvenli, verimli ve erişilebilir sonuçlar üretir.";
const english =
  "This project develops an innovative technology solution. Extensive research was conducted to meet user needs and a sustainable method was designed. The system produces secure efficient and accessible results for communities and organizations.";

function artifact(
  pageTexts: readonly string[],
  warnings: DocumentExtractionArtifact["warnings"] = [],
): DocumentExtractionArtifact {
  return DocumentExtractionArtifactSchema.parse({
    schemaVersion: "document-extraction/v1",
    submissionId: "submission-a",
    analysisRunId: "run-a",
    sourceSha256: "a".repeat(64),
    pageCount: pageTexts.length,
    characterCount: pageTexts.reduce((total, text) => total + text.length, 0),
    pages: pageTexts.map((text, index) => ({
      pageNumber: index + 1,
      text,
      characterCount: text.length,
    })),
    warnings,
  });
}

const profile: TemplateStructuralProfile = {
  expectedLanguage: "tr",
  sections: [
    {
      key: "summary",
      title: "Proje Özeti",
      description: "",
      required: true,
      order: 1,
    },
    {
      key: "problem",
      title: "Problem Tanımı",
      description: "",
      required: true,
      order: 2,
    },
    {
      key: "solution",
      title: "Çözüm Yaklaşımı",
      description: "",
      required: true,
      order: 3,
    },
    {
      key: "references",
      title: "Kaynakça",
      description: "",
      required: false,
      order: 4,
    },
  ],
};

function languageCheck(checks: AnalysisCheckWriteInput[]) {
  const check = checks.find((candidate) => candidate.type === "LANGUAGE");
  if (check?.details.checkType !== "LANGUAGE") throw new Error("language check missing");
  return check;
}

describe("deterministic language checks", () => {
  it("normalizes ISO-639-1, ISO-639-3, and BCP-47 base identifiers", () => {
    expect(normalizeLanguageIdentifier("tr")).toBe("tur");
    expect(normalizeLanguageIdentifier("tr-TR")).toBe("tur");
    expect(normalizeLanguageIdentifier("eng")).toBe("eng");
  });

  it("detects clear Turkish and English text", () => {
    expect(evaluateLanguage(artifact([turkish]), "tr")).toMatchObject({ status: "PASS" });
    const detectedEnglish = evaluateLanguage(artifact([english]), "en");
    expect(detectedEnglish).toMatchObject({ status: "PASS" });
    expect(detectedEnglish.details).toMatchObject({ detectedLanguage: "en" });
  });

  it("fails a clear expected-language mismatch without failing execution", () => {
    expect(evaluateLanguage(artifact([english]), "tr")).toMatchObject({
      status: "FAIL",
      details: { reason: "MISMATCH", detectedLanguage: "en" },
    });
  });

  it("warns instead of trusting a guess for sparse text", () => {
    expect(evaluateLanguage(artifact(["Kısa metin"], ["TEXT_SPARSE"]), "tr")).toMatchObject({
      status: "WARN",
      details: { reason: "TEXT_SPARSE", detectedLanguage: null },
    });
  });

  it("does not false-fail Turkish prose containing ordinary English technical terms", () => {
    const technical = `${turkish} Yapay zekâ çözümünde AI, API, machine learning ve Transformer bileşenleri birlikte kullanılmaktadır. ${turkish}`;
    expect(evaluateLanguage(artifact([technical]), "tr").status).toBe("PASS");
  });

  it("turns strong page-level mixed language into a conservative warning", () => {
    expect(evaluateLanguage(artifact([turkish, english]), "tr")).toMatchObject({
      status: "WARN",
      details: { mixedLanguageSignal: true, reason: "MIXED_LANGUAGE" },
    });
  });

  it("uses a bounded representative page sample deterministically", () => {
    const manyPages = artifact(
      Array.from({ length: 30 }, (_, index) => `${turkish} Sayfa ${index + 1}. ${turkish}`),
    );
    const first = evaluateLanguage(manyPages, "tr");
    const second = evaluateLanguage(manyPages, "tr");
    expect(first).toEqual(second);
    expect(first.details).toMatchObject({ sampledPageCount: 20 });
    if (first.details.checkType === "LANGUAGE") {
      expect(first.details.sampledCharacterCount).toBeLessThanOrEqual(20 * 2_048);
    }
  });

  it("maps detector runtime errors to a sanitized operational failure", () => {
    expect(() =>
      evaluateLanguage(artifact([turkish]), "tr", () => {
        throw new Error("secret");
      }),
    ).toThrowError(expect.objectContaining({ code: "LANGUAGE_DETECTION_FAILED" }));
  });
});

describe("heading and template structural checks", () => {
  it("keeps the historical P3-01 positive and negative milestone outcomes structural-only", () => {
    const turkishChecks = runDeterministicPrechecks(
      artifact([
        `Proje Özeti\n${turkish}\nProblem Tanımı\n${turkish}\nÇözüm Yaklaşımı\n${turkish}`,
      ]),
      profile,
      () => "tur",
    );
    expect(turkishChecks.map(({ type, status }) => [type, status])).toEqual([
      ["LANGUAGE", "PASS"],
      ["TEMPLATE_STRUCTURE", "PASS"],
      ["SECTION_PRESENCE", "PASS"],
    ]);

    const negativeChecks = runDeterministicPrechecks(
      artifact([`Proje Özeti\n${english}\nÇözüm Yaklaşımı\n${english}`]),
      profile,
      () => "eng",
    );
    expect(negativeChecks.map(({ type, status }) => [type, status])).toEqual([
      ["LANGUAGE", "FAIL"],
      ["TEMPLATE_STRUCTURE", "FAIL"],
      ["SECTION_PRESENCE", "FAIL"],
    ]);
    expect(negativeChecks.every((check) => check.type !== "SECTION_CONTENT")).toBe(true);
    expect(negativeChecks.every((check) => check.type !== "CATEGORY_FIT")).toBe(true);
  });

  it("normalizes case, Turkish letters, numeric prefixes, whitespace, and trailing punctuation", () => {
    expect(normalizeHeading("  1.1  PROJE ÖZETİ: ")).toBe(normalizeHeading("Proje Özeti"));
    expect(normalizeHeading("PROBLEM TANIMI")).toBe(normalizeHeading("Problem Tanımı"));
    expect(normalizeHeading("ÇÖZÜM YAKLAŞIMI.")).toBe(normalizeHeading("Çözüm Yaklaşımı"));
  });

  it("finds exact heading-like lines with correct page evidence", () => {
    const result = evaluateSections(
      artifact([
        `1. PROJE ÖZETİ:\n${turkish}`,
        `1.1 Problem Tanımı\n${turkish}\nÇözüm Yaklaşımı:\n${turkish}`,
      ]),
      profile,
    );
    expect(result.sectionPresence.status).toBe("PASS");
    expect(result.templateStructure.status).toBe("PASS");
    if (result.sectionPresence.details.checkType === "SECTION_PRESENCE") {
      expect(result.sectionPresence.details.sections.map(({ pageNumber }) => pageNumber)).toEqual([
        1,
        2,
        2,
        null,
      ]);
    }
  });

  it("does not treat a body sentence mentioning a heading phrase as a heading", () => {
    const result = evaluateSections(
      artifact([
        `Proje Özeti\n${turkish}\nBu bölümde Problem Tanımı hakkında açıklama yapılmaktadır.\nÇözüm Yaklaşımı`,
      ]),
      profile,
    );
    expect(result.sectionPresence).toMatchObject({
      status: "FAIL",
      details: { missingRequiredSectionKeys: ["problem"] },
    });
  });

  it("fails missing required headings while optional absence remains neutral", () => {
    const complete = evaluateSections(
      artifact(["Proje Özeti\nProblem Tanımı\nÇözüm Yaklaşımı"]),
      profile,
    );
    expect(complete.sectionPresence.status).toBe("PASS");
    const missing = evaluateSections(artifact(["Proje Özeti\nÇözüm Yaklaşımı"]), profile);
    expect(missing.sectionPresence.status).toBe("FAIL");
    expect(missing.templateStructure.status).toBe("FAIL");
  });

  it("records bounded duplicates and warns without automatic failure", () => {
    const result = evaluateSections(
      artifact([
        "Proje Özeti\nProje Özeti\nProblem Tanımı\nÇözüm Yaklaşımı\nProje Özeti\nProje Özeti\nProje Özeti\nProje Özeti",
      ]),
      profile,
    );
    expect(result.sectionPresence.status).toBe("PASS");
    expect(result.templateStructure).toMatchObject({
      status: "WARN",
      details: { duplicateHeadingKeys: ["summary"] },
    });
    if (result.sectionPresence.details.checkType === "SECTION_PRESENCE") {
      expect(result.sectionPresence.details.sections[0]?.occurrences).toHaveLength(5);
    }
  });

  it("uses first occurrences and warns for changed required-section order", () => {
    const result = evaluateSections(
      artifact(["Problem Tanımı\nProje Özeti\nÇözüm Yaklaşımı"]),
      profile,
    );
    expect(result.sectionPresence.status).toBe("PASS");
    expect(result.templateStructure).toMatchObject({
      status: "WARN",
      details: { orderDeviation: true },
    });
  });

  it("does not inspect semantic section content", () => {
    const checks = runDeterministicPrechecks(
      artifact([
        `Proje Özeti\nİlgisiz metin\nProblem Tanımı\nİlgisiz metin\nÇözüm Yaklaşımı\nİlgisiz metin ${turkish}`,
      ]),
      profile,
    );
    expect(checks.find((check) => check.type === "SECTION_PRESENCE")?.status).toBe("PASS");
  });
});

function r2Object(body: string): R2ObjectBody {
  return { text: async () => body } as R2ObjectBody;
}

describe("structural check processing boundary", () => {
  const extraction = artifact([
    `Proje Özeti\n${turkish}\nProblem Tanımı\n${turkish}\nÇözüm Yaklaşımı\n${turkish}`,
  ]);
  const context = {
    id: "run-a",
    submissionId: "submission-a",
    status: "PROCESSING" as const,
    sourceSha256: "a".repeat(64),
    sourceStorageKey: "private/source.pdf",
    documentArtifactKey: "derived/submission-a/run-a/document.json",
    templateVersionId: "template-v1",
    templateStructuralProfile: profile,
  };

  function dependencies(
    overrides: {
      context?: typeof context | null;
      artifactBody?: string | null;
      write?: AnalysisCheckRepository["upsertAnalysisChecks"];
    } = {},
  ) {
    return {
      runRepository: {
        getAnalysisRunExecutionContext: async () =>
          "context" in overrides ? (overrides.context ?? null) : context,
      } as unknown as AnalysisRunRepository,
      checkRepository: {
        upsertAnalysisChecks: overrides.write ?? (async () => undefined),
      } as AnalysisCheckRepository,
      storage: {
        getDocumentArtifact: async () =>
          overrides.artifactBody === null
            ? null
            : r2Object(overrides.artifactBody ?? JSON.stringify(extraction)),
      } as unknown as DocumentStorage,
      detector: () => "tur",
    };
  }

  it("uses only the pinned template profile and persists exactly three trusted checks", async () => {
    const write = vi.fn<AnalysisCheckRepository["upsertAnalysisChecks"]>(async () => undefined);
    await processStructuralChecks(
      {} as D1Database,
      {} as R2Bucket,
      "run-a",
      dependencies({ write }),
    );
    expect(write).toHaveBeenCalledOnce();
    expect(write.mock.calls[0]?.[2].map((check) => check.type)).toEqual([
      "LANGUAGE",
      "TEMPLATE_STRUCTURE",
      "SECTION_PRESENCE",
    ]);
  });

  it("reconciles the same logical checks on retry instead of appending findings", async () => {
    const snapshots: string[] = [];
    const write: AnalysisCheckRepository["upsertAnalysisChecks"] = async (_db, _runId, checks) => {
      snapshots.push(JSON.stringify(checks));
    };
    const deps = dependencies({ write });
    await processStructuralChecks({} as D1Database, {} as R2Bucket, "run-a", deps);
    await processStructuralChecks({} as D1Database, {} as R2Bucket, "run-a", deps);
    expect(snapshots).toHaveLength(2);
    expect(snapshots[0]).toBe(snapshots[1]);
  });

  it.each([
    ["missing artifact", dependencies({ artifactBody: null }), "ARTIFACT_NOT_FOUND"],
    ["invalid artifact", dependencies({ artifactBody: "not json" }), "ARTIFACT_INVALID"],
    ["missing pinned template", dependencies({ context: null }), "PINNED_TEMPLATE_NOT_FOUND"],
  ] as const)("fails safely for %s", async (_name, deps, code) => {
    await expect(
      processStructuralChecks({} as D1Database, {} as R2Bucket, "run-a", deps),
    ).rejects.toMatchObject({ code });
  });

  it("maps check persistence failure without leaking the database error", async () => {
    await expect(
      processStructuralChecks(
        {} as D1Database,
        {} as R2Bucket,
        "run-a",
        dependencies({
          write: async () => {
            throw new Error("secret SQL");
          },
        }),
      ),
    ).rejects.toMatchObject({
      code: "CHECK_PERSISTENCE_FAILED",
      safeMessage: "Ön kontrol sonuçları güvenli biçimde kaydedilemedi.",
    });
  });

  it("keeps report text out of persisted check details", () => {
    const serialized = JSON.stringify(runDeterministicPrechecks(extraction, profile, () => "tur"));
    expect(serialized).not.toContain(turkish);
    expect(languageCheck(runDeterministicPrechecks(extraction, profile, () => "tur")).status).toBe(
      "PASS",
    );
  });
});
