import { type AnalysisRunRepository, AnalysisRunRepositoryError } from "@teknofest-ai/db";
import {
  AnalysisRunListResponseSchema,
  AnalysisRunResponseSchema,
  ApiErrorResponseSchema,
} from "@teknofest-ai/shared";
import { describe, expect, it, vi } from "vitest";

import type { AnalysisWorkflowStarter } from "./analysis-routes";
import type { AuthRuntimeBindings } from "./auth/auth";
import { createApp } from "./index";

const environment = {
  DB: {} as D1Database,
  DOCUMENTS: {} as R2Bucket,
  SUBMISSION_ANALYSIS: {} as Workflow,
  OPENAI_API_KEY: "test-key-not-a-real-credential",
  OPENAI_MODEL: "gpt-5-test",
} as AuthRuntimeBindings;

const run = {
  id: "run-a",
  submissionId: "submission-a",
  categoryId: "category-a",
  status: "QUEUED" as const,
  stage: "INGEST_AND_EXTRACT" as const,
  templateVersionId: "template-v1",
  rubricVersionId: "rubric-v1",
  sourceSha256: "a".repeat(64),
  ai: { provider: "OPENAI", modelId: "gpt-5-test", promptBundleVersion: "semantic-checks/v1" },
  categorySnapshot: {
    id: "category-a",
    name: "Yapay Zekâ",
    code: "yapay-zeka",
    description: "Sentetik kategori açıklaması.",
    guidance: "Sentetik kapsam notu.",
  },
  createdAt: 10,
  startedAt: null,
  completedAt: null,
  extraction: { pageCount: null, characterCount: null, warnings: [] },
  checks: [],
  error: null,
};

function repositoryStub(overrides: Partial<AnalysisRunRepository> = {}): AnalysisRunRepository {
  return {
    createQueuedAnalysisRun: async () => run,
    getAnalysisRun: async (_binding, competitionId, submissionId, analysisRunId) =>
      competitionId === "competition-a" &&
      submissionId === "submission-a" &&
      analysisRunId === "run-a"
        ? run
        : null,
    getAnalysisRunExecutionContext: async () => null,
    listAnalysisRuns: async (_binding, competitionId, submissionId) =>
      competitionId === "competition-a" && submissionId === "submission-a" ? [run] : [],
    markAnalysisRunFailed: async () => undefined,
    markAnalysisRunProcessing: async () => undefined,
    markAnalysisRunSemanticChecks: async () => undefined,
    markAnalysisRunStructuralChecks: async () => undefined,
    markAnalysisRunSucceeded: async () => undefined,
    ...overrides,
  };
}

const workflowStarter: AnalysisWorkflowStarter = {
  start: async (_environment, instanceId) => ({ id: instanceId }),
};

type Role = "COMPETITION_MANAGER" | "EVALUATION_MANAGER" | "REVIEWER" | "CONTESTANT";

function authenticatedApp(
  role: Role,
  repository: AnalysisRunRepository = repositoryStub(),
  starter: AnalysisWorkflowStarter = workflowStarter,
) {
  return createApp({
    resolveSession: async () => ({
      user: { id: "user-a", name: "Kullanıcı", email: "user-a@example.com", image: null },
    }),
    findMembership: async (_binding, userId, competitionId) =>
      userId === "user-a" && competitionId === "competition-a"
        ? { userId, competitionId, role }
        : null,
    analysisRunRepository: repository,
    analysisWorkflowStarter: starter,
  });
}

function request(
  application: ReturnType<typeof createApp>,
  path = "/api/v1/competitions/competition-a/submissions/submission-a/analysis-runs",
  method = "POST",
) {
  return application.request(`http://localhost${path}`, { method }, environment);
}

describe("analysis run authorization", () => {
  it("returns 401 to unauthenticated users", async () => {
    const response = await request(
      createApp({
        resolveSession: async () => null,
        analysisRunRepository: repositoryStub(),
        analysisWorkflowStarter: workflowStarter,
      }),
    );
    expect(response.status).toBe(401);
  });

  it.each(["REVIEWER", "EVALUATION_MANAGER", "CONTESTANT"] as const)(
    "returns 403 when %s starts an analysis",
    async (role) => {
      expect((await request(authenticatedApp(role))).status).toBe(403);
    },
  );

  it.each(["REVIEWER", "EVALUATION_MANAGER", "CONTESTANT"] as const)(
    "returns 403 when %s reads analysis checks",
    async (role) => {
      expect((await request(authenticatedApp(role), undefined, "GET")).status).toBe(403);
    },
  );

  it("allows a competition manager and passes only server-generated execution identity", async () => {
    const create = vi.fn<AnalysisRunRepository["createQueuedAnalysisRun"]>(async () => run);
    const start = vi.fn<AnalysisWorkflowStarter["start"]>(async (_env, instanceId) => ({
      id: instanceId,
    }));
    const response = await request(
      authenticatedApp("COMPETITION_MANAGER", repositoryStub({ createQueuedAnalysisRun: create }), {
        start,
      }),
    );

    expect(response.status).toBe(201);
    expect(AnalysisRunResponseSchema.parse(await response.json())).toEqual(run);
    expect(create.mock.calls[0]?.[1]).toMatchObject({
      competitionId: "competition-a",
      submissionId: "submission-a",
      aiProvider: "OPENAI",
      modelId: "gpt-5-test",
      promptBundleVersion: "semantic-checks/v1",
    });
    const generated = create.mock.calls[0]?.[1].id;
    expect(generated).toMatch(/^[0-9a-f-]{36}$/);
    expect(create.mock.calls[0]?.[1].workflowInstanceId).toBe(generated);
    expect(start.mock.calls[0]?.[2]).toEqual({ analysisRunId: generated });
  });

  it("does not let Manager A start a run in Competition B", async () => {
    const response = await request(
      authenticatedApp("COMPETITION_MANAGER"),
      "/api/v1/competitions/competition-b/submissions/submission-a/analysis-runs",
    );
    expect(response.status).toBe(403);
  });
});

describe("analysis run start boundaries", () => {
  it("rejects incomplete configuration with a controlled 409", async () => {
    const response = await request(
      authenticatedApp(
        "COMPETITION_MANAGER",
        repositoryStub({
          createQueuedAnalysisRun: async () => {
            throw new AnalysisRunRepositoryError("CONFLICT", "CONFIGURATION_NOT_READY");
          },
        }),
      ),
    );
    expect(response.status).toBe(409);
    expect(ApiErrorResponseSchema.parse(await response.json()).message).toContain("yapılandırması");
  });

  it("blocks a second queued or processing run with 409", async () => {
    const response = await request(
      authenticatedApp(
        "COMPETITION_MANAGER",
        repositoryStub({
          createQueuedAnalysisRun: async () => {
            throw new AnalysisRunRepositoryError("CONFLICT", "CONCURRENT_RUN");
          },
        }),
      ),
    );
    expect(response.status).toBe(409);
  });

  it("marks the row FAILED when Workflow creation fails", async () => {
    const fail = vi.fn<AnalysisRunRepository["markAnalysisRunFailed"]>(async () => undefined);
    const response = await request(
      authenticatedApp("COMPETITION_MANAGER", repositoryStub({ markAnalysisRunFailed: fail }), {
        start: async () => {
          throw new Error("workflow implementation detail");
        },
      }),
    );
    expect(response.status).toBe(500);
    expect(fail).toHaveBeenCalledWith(
      environment.DB,
      expect.any(String),
      "WORKFLOW_START_FAILED",
      "Belge işleme iş akışı başlatılamadı.",
    );
    expect(JSON.stringify(await response.json())).not.toContain("implementation detail");
  });
});

describe("analysis run safe reads", () => {
  it("returns deterministic history without artifact keys or extracted text", async () => {
    const response = await request(authenticatedApp("COMPETITION_MANAGER"), undefined, "GET");
    const payload = AnalysisRunListResponseSchema.parse(await response.json());
    expect(response.status).toBe(200);
    expect(payload.runHistory).toEqual([run]);
    expect(JSON.stringify(payload)).not.toContain("documentArtifactKey");
    expect(JSON.stringify(payload)).not.toContain("pages");
  });

  it("returns validated compact checks without artifact keys or report text", async () => {
    const completed = {
      ...run,
      status: "SUCCEEDED" as const,
      stage: "STRUCTURAL_CHECKS" as const,
      completedAt: 20,
      extraction: { pageCount: 1, characterCount: 250, warnings: [] },
      checks: [
        {
          id: "check-language",
          analysisRunId: "run-a",
          type: "LANGUAGE" as const,
          status: "PASS" as const,
          summary: "Dil uyumlu.",
          details: {
            checkType: "LANGUAGE" as const,
            expectedLanguage: "tr",
            detectedLanguage: "tr",
            sampledCharacterCount: 250,
            sampledPageCount: 1,
            mixedLanguageSignal: false,
            undeterminedPageCount: 0,
            reason: "MATCH" as const,
          },
          createdAt: 15,
          updatedAt: 15,
        },
      ],
    };
    const response = await request(
      authenticatedApp(
        "COMPETITION_MANAGER",
        repositoryStub({ getAnalysisRun: async () => completed }),
      ),
      "/api/v1/competitions/competition-a/submissions/submission-a/analysis-runs/run-a",
      "GET",
    );
    const payload = AnalysisRunResponseSchema.parse(await response.json());
    expect(payload.checks[0]).toMatchObject({ type: "LANGUAGE", status: "PASS" });
    expect(JSON.stringify(payload)).not.toContain("documentArtifactKey");
    expect(JSON.stringify(payload)).not.toContain("full extracted report text");
  });

  it("uses a non-leaking 404 for a run outside the nested submission scope", async () => {
    const response = await request(
      authenticatedApp("COMPETITION_MANAGER"),
      "/api/v1/competitions/competition-a/submissions/submission-a/analysis-runs/run-b",
      "GET",
    );
    expect(response.status).toBe(404);
  });
});
