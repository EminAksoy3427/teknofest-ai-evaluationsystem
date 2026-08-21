import {
  type CompetitionConfigurationRepository,
  ConfigurationRepositoryError,
} from "@teknofest-ai/db";
import {
  ApiErrorResponseSchema,
  CategoryResponseSchema,
  CompetitionConfigurationResponseSchema,
  CompetitionResponseSchema,
  RubricVersionResponseSchema,
  TemplateVersionResponseSchema,
  UnauthorizedResponseSchema,
} from "@teknofest-ai/shared";
import { describe, expect, it, vi } from "vitest";

import type { AuthRuntimeBindings } from "./auth/auth";
import { createApp } from "./index";

const testEnvironment = { DB: {} as D1Database } as AuthRuntimeBindings;
const now = 1_787_000_000_000;

const competition = {
  id: "competition-a",
  name: "Yarışma A",
  slug: "yarisma-a",
  description: "Açıklama",
  createdAt: now,
  updatedAt: now,
};

const category = {
  id: "category-a",
  competitionId: "competition-a",
  name: "Yapay Zekâ",
  code: "yapay-zeka",
  description: "Yapay zekâ projeleri",
  guidance: "Model kullanımı kapsam içidir.",
  order: 1,
  createdAt: now,
  updatedAt: now,
};

const templateDraft = {
  id: "template-a",
  competitionId: "competition-a",
  versionNumber: 1,
  label: "v1",
  status: "DRAFT" as const,
  structuralProfile: {
    expectedLanguage: "tr",
    sections: [
      {
        key: "proje-ozeti",
        title: "Proje Özeti",
        description: "",
        required: true,
        order: 1,
      },
    ],
  },
  createdAt: now,
  updatedAt: now,
};

const criterion = {
  id: "criterion-a",
  rubricVersionId: "rubric-a",
  code: "innovation",
  name: "Yenilik",
  description: "Çözümün yenilik düzeyi",
  maxScore: 10,
  weight: 35,
  evidenceExpectation: "Somut farklılaşma kanıtı",
  order: 1,
  createdAt: now,
  updatedAt: now,
};

const rubricDraft = {
  id: "rubric-a",
  competitionId: "competition-a",
  versionNumber: 1,
  label: "v1",
  status: "DRAFT" as const,
  criteria: [criterion],
  createdAt: now,
  updatedAt: now,
};

function repositoryStub(
  overrides: Partial<CompetitionConfigurationRepository> = {},
): CompetitionConfigurationRepository {
  return {
    activateRubricVersion: async () => ({ ...rubricDraft, status: "ACTIVE" }),
    activateTemplateVersion: async () => ({ ...templateDraft, status: "ACTIVE" }),
    createCategory: async () => category,
    createCompetitionWithManager: async () => competition,
    createRubricVersion: async () => rubricDraft,
    createTemplateVersion: async () => templateDraft,
    deleteCategory: async () => undefined,
    findCompetition: async () => competition,
    getCompetitionConfiguration: async () => ({
      competition,
      categories: [category],
      templates: [{ ...templateDraft, status: "ACTIVE" }],
      rubrics: [{ ...rubricDraft, status: "ACTIVE" }],
      readiness: {
        competition: true,
        categories: true,
        activeTemplate: true,
        activeRubric: true,
        rubricHasCriteria: true,
        ready: true,
      },
    }),
    listCategories: async () => [category],
    listCriteriaForRubric: async () => [criterion],
    listRubricVersions: async () => [rubricDraft],
    listTemplateVersions: async () => [templateDraft],
    replaceDraftCriteria: async () => rubricDraft,
    updateCategory: async () => category,
    updateCompetition: async () => competition,
    updateDraftRubricVersion: async () => rubricDraft,
    updateDraftTemplateVersion: async () => templateDraft,
    ...overrides,
  };
}

type Role = "COMPETITION_MANAGER" | "EVALUATION_MANAGER" | "REVIEWER" | "CONTESTANT";

function authenticatedApp(
  role: Role,
  repository: CompetitionConfigurationRepository = repositoryStub(),
  userId = "user-a",
) {
  return createApp({
    resolveSession: async () => ({
      user: { id: userId, name: "Kullanıcı", email: `${userId}@example.com`, image: null },
    }),
    findMembership: async (_binding, requestedUserId, competitionId) =>
      requestedUserId === userId && competitionId === "competition-a"
        ? { userId, competitionId, role }
        : null,
    repository,
  });
}

async function request(
  application: ReturnType<typeof createApp>,
  path: string,
  method = "GET",
  body?: unknown,
) {
  return application.request(
    `http://localhost${path}`,
    {
      method,
      ...(body === undefined
        ? {}
        : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    },
    testEnvironment,
  );
}

describe("competition bootstrap API", () => {
  it("rejects unauthenticated competition creation", async () => {
    const response = await request(createApp(), "/api/v1/competitions", "POST", {
      name: "Yarışma A",
      slug: "yarisma-a",
    });

    expect(response.status).toBe(401);
    expect(UnauthorizedResponseSchema.parse(await response.json()).code).toBe("UNAUTHORIZED");
  });

  it("creates a competition for an authenticated user and passes only the session user id", async () => {
    const createCompetitionWithManager = vi.fn(async () => competition);
    const response = await request(
      authenticatedApp(
        "REVIEWER",
        repositoryStub({ createCompetitionWithManager }),
        "authenticated-user",
      ),
      "/api/v1/competitions",
      "POST",
      { name: "Yarışma A", slug: "yarisma-a", description: "Açıklama" },
    );

    expect(response.status).toBe(201);
    expect(CompetitionResponseSchema.parse(await response.json())).toEqual(competition);
    expect(createCompetitionWithManager).toHaveBeenCalledWith(
      testEnvironment.DB,
      "authenticated-user",
      { name: "Yarışma A", slug: "yarisma-a", description: "Açıklama" },
    );
  });

  it("maps a duplicate competition slug to a safe conflict", async () => {
    const response = await request(
      authenticatedApp(
        "COMPETITION_MANAGER",
        repositoryStub({
          createCompetitionWithManager: async () => {
            throw new ConfigurationRepositoryError("CONFLICT", "COMPETITION_SLUG");
          },
        }),
      ),
      "/api/v1/competitions",
      "POST",
      { name: "Yarışma A", slug: "yarisma-a" },
    );

    expect(response.status).toBe(409);
    expect(ApiErrorResponseSchema.parse(await response.json())).toEqual({
      code: "CONFLICT",
      message: "Bu yarışma slug değeri zaten kullanılıyor.",
    });
  });
});

describe("competition configuration authorization", () => {
  it("allows a competition manager to configure their competition", async () => {
    const response = await request(
      authenticatedApp("COMPETITION_MANAGER"),
      "/api/v1/competitions/competition-a",
      "PATCH",
      { name: "Yeni ad" },
    );

    expect(response.status).toBe(200);
  });

  it.each(["REVIEWER", "EVALUATION_MANAGER", "CONTESTANT"] as const)(
    "denies %s configuration mutations",
    async (role) => {
      const response = await request(
        authenticatedApp(role),
        "/api/v1/competitions/competition-a",
        "PATCH",
        { name: "Yetkisiz" },
      );

      expect(response.status).toBe(403);
    },
  );

  it("does not let a manager of competition A configure competition B", async () => {
    const response = await request(
      authenticatedApp("COMPETITION_MANAGER"),
      "/api/v1/competitions/competition-b/configuration",
    );

    expect(response.status).toBe(403);
  });
});

describe("nested configuration resources", () => {
  it("creates and validates a category inside the route competition", async () => {
    const createCategory = vi.fn(async () => category);
    const response = await request(
      authenticatedApp("COMPETITION_MANAGER", repositoryStub({ createCategory })),
      "/api/v1/competitions/competition-a/categories",
      "POST",
      {
        name: "Yapay Zekâ",
        code: "yapay-zeka",
        description: "Yapay zekâ projeleri",
        guidance: "Model kullanımı kapsam içidir.",
        order: 1,
      },
    );

    expect(response.status).toBe(201);
    expect(CategoryResponseSchema.parse(await response.json())).toEqual(category);
    expect(createCategory).toHaveBeenCalledWith(testEnvironment.DB, "competition-a", {
      name: "Yapay Zekâ",
      code: "yapay-zeka",
      description: "Yapay zekâ projeleri",
      guidance: "Model kullanımı kapsam içidir.",
      order: 1,
    });
  });

  it("returns non-leaking 404 for a category id owned by another competition", async () => {
    const response = await request(
      authenticatedApp(
        "COMPETITION_MANAGER",
        repositoryStub({
          updateCategory: async () => {
            throw new ConfigurationRepositoryError("NOT_FOUND", "RESOURCE");
          },
        }),
      ),
      "/api/v1/competitions/competition-a/categories/category-from-b",
      "PATCH",
      { name: "Saldırı" },
    );

    expect(response.status).toBe(404);
    expect(ApiErrorResponseSchema.parse(await response.json()).code).toBe("NOT_FOUND");
  });

  it("maps category deletion with dependent submissions to a safe conflict", async () => {
    const response = await request(
      authenticatedApp(
        "COMPETITION_MANAGER",
        repositoryStub({
          deleteCategory: async () => {
            throw new ConfigurationRepositoryError("CONFLICT", "CATEGORY_IN_USE");
          },
        }),
      ),
      "/api/v1/competitions/competition-a/categories/category-a",
      "DELETE",
    );

    expect(response.status).toBe(409);
    expect(ApiErrorResponseSchema.parse(await response.json())).toEqual({
      code: "CONFLICT",
      message: "Bu kategoriye bağlı başvurular bulunduğu için silinemez.",
    });
  });

  it("returns non-leaking 404 for a template id owned by another competition", async () => {
    const response = await request(
      authenticatedApp(
        "COMPETITION_MANAGER",
        repositoryStub({
          updateDraftTemplateVersion: async () => {
            throw new ConfigurationRepositoryError("NOT_FOUND", "RESOURCE");
          },
        }),
      ),
      "/api/v1/competitions/competition-a/templates/template-from-b",
      "PATCH",
      { label: "Saldırı" },
    );

    expect(response.status).toBe(404);
    expect(ApiErrorResponseSchema.parse(await response.json()).code).toBe("NOT_FOUND");
  });

  it("returns non-leaking 404 for a rubric id owned by another competition", async () => {
    const response = await request(
      authenticatedApp(
        "COMPETITION_MANAGER",
        repositoryStub({
          updateDraftRubricVersion: async () => {
            throw new ConfigurationRepositoryError("NOT_FOUND", "RESOURCE");
          },
        }),
      ),
      "/api/v1/competitions/competition-a/rubrics/rubric-from-b",
      "PATCH",
      { label: "Saldırı" },
    );

    expect(response.status).toBe(404);
    expect(ApiErrorResponseSchema.parse(await response.json()).code).toBe("NOT_FOUND");
  });

  it("returns non-leaking 404 for criteria nested under another competition rubric", async () => {
    const response = await request(
      authenticatedApp(
        "COMPETITION_MANAGER",
        repositoryStub({
          replaceDraftCriteria: async () => {
            throw new ConfigurationRepositoryError("NOT_FOUND", "RESOURCE");
          },
        }),
      ),
      "/api/v1/competitions/competition-a/rubrics/rubric-from-b/criteria",
      "PUT",
      { criteria: [] },
    );

    expect(response.status).toBe(404);
    expect(ApiErrorResponseSchema.parse(await response.json()).code).toBe("NOT_FOUND");
  });

  it.each([
    ["templates", "template-a"],
    ["rubrics", "rubric-a"],
  ])("rejects client lifecycle changes through generic %s updates", async (resource, id) => {
    const response = await request(
      authenticatedApp("COMPETITION_MANAGER"),
      `/api/v1/competitions/competition-a/${resource}/${id}`,
      "PATCH",
      { status: "ACTIVE" },
    );

    expect(response.status).toBe(400);
    expect(ApiErrorResponseSchema.parse(await response.json()).code).toBe("VALIDATION_ERROR");
  });

  it("keeps active templates immutable", async () => {
    const response = await request(
      authenticatedApp(
        "COMPETITION_MANAGER",
        repositoryStub({
          updateDraftTemplateVersion: async () => {
            throw new ConfigurationRepositoryError("CONFLICT", "IMMUTABLE_VERSION");
          },
        }),
      ),
      "/api/v1/competitions/competition-a/templates/active-template",
      "PATCH",
      { label: "Değiştir" },
    );

    expect(response.status).toBe(409);
  });

  it("rejects template activation without a meaningful structure", async () => {
    const response = await request(
      authenticatedApp(
        "COMPETITION_MANAGER",
        repositoryStub({
          activateTemplateVersion: async () => {
            throw new ConfigurationRepositoryError("CONFLICT", "TEMPLATE_NOT_READY");
          },
        }),
      ),
      "/api/v1/competitions/competition-a/templates/template-empty/activate",
      "POST",
    );

    expect(response.status).toBe(409);
    expect(ApiErrorResponseSchema.parse(await response.json()).message).toContain("zorunlu bölüm");
  });

  it("passes template ids with the trusted route competition scope", async () => {
    const activateTemplateVersion = vi.fn(async () => ({
      ...templateDraft,
      status: "ACTIVE" as const,
    }));
    const response = await request(
      authenticatedApp("COMPETITION_MANAGER", repositoryStub({ activateTemplateVersion })),
      "/api/v1/competitions/competition-a/templates/template-a/activate",
      "POST",
    );

    expect(response.status).toBe(200);
    expect(TemplateVersionResponseSchema.parse(await response.json()).status).toBe("ACTIVE");
    expect(activateTemplateVersion).toHaveBeenCalledWith(
      testEnvironment.DB,
      "competition-a",
      "template-a",
    );
  });

  it("rejects duplicate criterion keys before persistence", async () => {
    const replaceDraftCriteria = vi.fn(async () => rubricDraft);
    const repeated = {
      code: "innovation",
      name: "Yenilik",
      description: "Açıklama",
      maxScore: 10,
      weight: 50,
      evidenceExpectation: "Kanıt",
    };
    const response = await request(
      authenticatedApp("COMPETITION_MANAGER", repositoryStub({ replaceDraftCriteria })),
      "/api/v1/competitions/competition-a/rubrics/rubric-a/criteria",
      "PUT",
      {
        criteria: [
          { ...repeated, order: 1 },
          { ...repeated, order: 2 },
        ],
      },
    );

    expect(response.status).toBe(400);
    expect(replaceDraftCriteria).not.toHaveBeenCalled();
  });

  it("keeps active rubrics immutable and rejects an empty activation", async () => {
    const updateResponse = await request(
      authenticatedApp(
        "COMPETITION_MANAGER",
        repositoryStub({
          updateDraftRubricVersion: async () => {
            throw new ConfigurationRepositoryError("CONFLICT", "IMMUTABLE_VERSION");
          },
        }),
      ),
      "/api/v1/competitions/competition-a/rubrics/active-rubric",
      "PATCH",
      { label: "Değiştir" },
    );
    const activateResponse = await request(
      authenticatedApp(
        "COMPETITION_MANAGER",
        repositoryStub({
          activateRubricVersion: async () => {
            throw new ConfigurationRepositoryError("CONFLICT", "RUBRIC_NOT_READY");
          },
        }),
      ),
      "/api/v1/competitions/competition-a/rubrics/empty-rubric/activate",
      "POST",
    );

    expect(updateResponse.status).toBe(409);
    expect(activateResponse.status).toBe(409);
  });

  it("passes rubric ids with the trusted route competition scope", async () => {
    const activateRubricVersion = vi.fn(async () => ({
      ...rubricDraft,
      status: "ACTIVE" as const,
    }));
    const response = await request(
      authenticatedApp("COMPETITION_MANAGER", repositoryStub({ activateRubricVersion })),
      "/api/v1/competitions/competition-a/rubrics/rubric-a/activate",
      "POST",
    );

    expect(response.status).toBe(200);
    expect(RubricVersionResponseSchema.parse(await response.json()).status).toBe("ACTIVE");
    expect(activateRubricVersion).toHaveBeenCalledWith(
      testEnvironment.DB,
      "competition-a",
      "rubric-a",
    );
  });
});

describe("configuration readiness", () => {
  it("returns the explicit ready contract", async () => {
    const response = await request(
      authenticatedApp("COMPETITION_MANAGER"),
      "/api/v1/competitions/competition-a/configuration",
    );

    expect(response.status).toBe(200);
    expect(CompetitionConfigurationResponseSchema.parse(await response.json()).readiness).toEqual({
      competition: true,
      categories: true,
      activeTemplate: true,
      activeRubric: true,
      rubricHasCriteria: true,
      ready: true,
    });
  });
});
