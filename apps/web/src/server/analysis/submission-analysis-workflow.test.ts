import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  markProcessing: vi.fn(),
  markStructural: vi.fn(),
  markSemantic: vi.fn(),
  markSimilarity: vi.fn(),
  markSucceeded: vi.fn(),
  markFailed: vi.fn(),
  getContext: vi.fn(),
  processRun: vi.fn(),
  structural: vi.fn(),
  section: vi.fn(),
  category: vi.fn(),
  persist: vi.fn(),
  similarity: vi.fn(),
}));

vi.mock("@teknofest-ai/db", () => ({
  analysisRunRepository: {
    markAnalysisRunProcessing: mocks.markProcessing,
    markAnalysisRunStructuralChecks: mocks.markStructural,
    markAnalysisRunSemanticChecks: mocks.markSemantic,
    markAnalysisRunSimilarityChecks: mocks.markSimilarity,
    markAnalysisRunSucceeded: mocks.markSucceeded,
    markAnalysisRunFailed: mocks.markFailed,
    getAnalysisRunExecutionContext: mocks.getContext,
  },
}));

vi.mock("./process-analysis-run", () => ({
  processAnalysisRun: mocks.processRun,
  encodeSafeFailure: (error: unknown) => error,
  safeAnalysisFailure: (error: unknown) =>
    error instanceof Error && error.message === "category unavailable"
      ? { code: "AI_NETWORK_ERROR", message: "Semantik analiz sağlayıcısı çalışamadı." }
      : { code: "ANALYSIS_INTERNAL_ERROR", message: "Beklenmeyen hata." },
}));

vi.mock("./structural-checks", () => ({ processStructuralChecks: mocks.structural }));
vi.mock("./semantic-checks", () => ({
  analyzeSectionContent: mocks.section,
  analyzeCategoryFit: mocks.category,
  persistSemanticCheck: mocks.persist,
}));
vi.mock("./similarity", () => ({
  processSimilarityChecks: mocks.similarity,
  similarityStageDependencies: () => ({}),
}));

import { SubmissionAnalysisWorkflow } from "./submission-analysis-workflow";

const sectionCheck = {
  type: "SECTION_CONTENT",
  status: "FAIL",
  summary: "Olumsuz bölüm sinyali.",
  details: { checkType: "SECTION_CONTENT", sections: [] },
};
const categoryCheck = {
  type: "CATEGORY_FIT",
  status: "FAIL",
  summary: "Olumsuz kategori sinyali; nihai karar değildir.",
  details: {
    checkType: "CATEGORY_FIT",
    assessment: "MISALIGNED",
    reason: "Sentetik uyuşmazlık.",
    evidenceStrength: "HIGH",
    evidence: [],
    alignmentSignals: [],
    mismatchSignals: [],
    sourceCoverage: "FULL",
  },
};

function workflow() {
  return new SubmissionAnalysisWorkflow({} as ExecutionContext, {
    DB: {} as D1Database,
    DOCUMENTS: {} as R2Bucket,
    OPENAI_API_KEY: "synthetic-test-key",
  });
}

function stepRunner(names: string[]) {
  return {
    do: async (name: string, _configuration: unknown, callback: () => Promise<unknown>) => {
      names.push(name);
      return callback();
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getContext.mockResolvedValue({
    modelId: "gpt-5-test",
    promptBundleVersion: "semantic-checks/v1",
  });
  mocks.processRun.mockResolvedValue({
    documentArtifactKey: "derived/document.json",
    pageCount: 2,
    characterCount: 200,
    warnings: [],
  });
  mocks.section.mockResolvedValue(sectionCheck);
  mocks.category.mockResolvedValue(categoryCheck);
});

describe("semantic Workflow durability", () => {
  it("uses separate billable-call and persistence boundaries and succeeds despite negative findings", async () => {
    const names: string[] = [];
    const result = await workflow().run(
      { payload: { analysisRunId: "run-a" } } as never,
      stepRunner(names) as never,
    );
    expect(result).toEqual({ analysisRunId: "run-a", status: "SUCCEEDED" });
    expect(names).toEqual([
      "analysis-run-processing",
      "ingest-and-extract",
      "structural-checks-stage",
      "structural-checks",
      "semantic-checks-stage",
      "semantic-section-content-api",
      "semantic-section-content-persist",
      "semantic-category-fit-api",
      "semantic-category-fit-persist",
      "similarity-checks-stage",
      "similarity-checks",
      "analysis-run-success",
    ]);
    expect(mocks.persist).toHaveBeenNthCalledWith(1, expect.anything(), "run-a", sectionCheck);
    expect(mocks.persist).toHaveBeenNthCalledWith(2, expect.anything(), "run-a", categoryCheck);
    expect(mocks.markSucceeded).toHaveBeenCalledOnce();
    expect(mocks.similarity).toHaveBeenCalledOnce();
    expect(mocks.markFailed).not.toHaveBeenCalled();
  });

  it("fails SEMANTIC_CHECKS when the second provider operation cannot execute", async () => {
    mocks.category.mockRejectedValue(new Error("category unavailable"));
    const result = await workflow().run(
      { payload: { analysisRunId: "run-a" } } as never,
      stepRunner([]) as never,
    );
    expect(result).toMatchObject({ status: "FAILED", errorCode: "AI_NETWORK_ERROR" });
    expect(mocks.persist).toHaveBeenCalledOnce();
    expect(mocks.markSucceeded).not.toHaveBeenCalled();
    expect(mocks.markFailed).toHaveBeenCalledWith(
      expect.anything(),
      "run-a",
      "AI_NETWORK_ERROR",
      "Semantik analiz sağlayıcısı çalışamadı.",
    );
  });
});
