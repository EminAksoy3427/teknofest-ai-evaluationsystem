import type {
  CompetitionConfigurationRepository,
  CompetitionMembershipLookup,
} from "@teknofest-ai/db";
import {
  CategoryCreateRequestSchema,
  CategoryListResponseSchema,
  CategoryResponseSchema,
  CategoryUpdateRequestSchema,
  CompetitionConfigurationResponseSchema,
  CompetitionCreateRequestSchema,
  CompetitionResponseSchema,
  CompetitionUpdateRequestSchema,
  CriteriaReplaceRequestSchema,
  RubricVersionCreateRequestSchema,
  RubricVersionListResponseSchema,
  RubricVersionResponseSchema,
  RubricVersionUpdateRequestSchema,
  TemplateVersionCreateRequestSchema,
  TemplateVersionListResponseSchema,
  TemplateVersionResponseSchema,
  TemplateVersionUpdateRequestSchema,
} from "@teknofest-ai/shared";
import type { Context, Hono } from "hono";

import { ApiApplicationError, parseJsonBody } from "./api-error";
import type { AuthRuntimeBindings } from "./auth/auth";
import type { SessionResolver } from "./auth/session";
import { requireCompetitionPermission } from "./authorization/membership";
import { requireAuthenticatedUser } from "./authorization/require-auth";

export interface CompetitionConfigurationRouteDependencies {
  resolveSession: SessionResolver;
  findMembership: CompetitionMembershipLookup;
  repository: CompetitionConfigurationRepository;
}

type Application = Hono<{ Bindings: AuthRuntimeBindings }>;
type ApplicationContext = Context<{ Bindings: AuthRuntimeBindings }>;

function requiredParameter(context: ApplicationContext, name: string): string {
  const value = context.req.param(name);
  if (!value) {
    throw new ApiApplicationError(
      { code: "NOT_FOUND", message: "İstenen kaynak bulunamadı." },
      404,
    );
  }
  return value;
}

async function requireConfigurationPermission(
  context: ApplicationContext,
  dependencies: CompetitionConfigurationRouteDependencies,
) {
  const user = await requireAuthenticatedUser(
    context.req.raw,
    context.env,
    dependencies.resolveSession,
  );
  const competitionId = requiredParameter(context, "competitionId");
  await requireCompetitionPermission(
    context.env,
    user.id,
    competitionId,
    "competition:configure",
    dependencies.findMembership,
  );

  return { competitionId, user };
}

export function registerCompetitionConfigurationRoutes(
  app: Application,
  dependencies: CompetitionConfigurationRouteDependencies,
) {
  app.post("/api/v1/competitions", async (context) => {
    const user = await requireAuthenticatedUser(
      context.req.raw,
      context.env,
      dependencies.resolveSession,
    );
    const input = await parseJsonBody(context, CompetitionCreateRequestSchema);
    const competition = await dependencies.repository.createCompetitionWithManager(
      context.env.DB,
      user.id,
      input,
    );

    return context.json(CompetitionResponseSchema.parse(competition), 201);
  });

  app.get("/api/v1/competitions/:competitionId", async (context) => {
    const { competitionId } = await requireConfigurationPermission(context, dependencies);
    const competition = await dependencies.repository.findCompetition(
      context.env.DB,
      competitionId,
    );

    if (!competition) {
      return context.json({ code: "NOT_FOUND" as const, message: "Yarışma bulunamadı." }, 404);
    }
    return context.json(CompetitionResponseSchema.parse(competition));
  });

  app.patch("/api/v1/competitions/:competitionId", async (context) => {
    const { competitionId } = await requireConfigurationPermission(context, dependencies);
    const input = await parseJsonBody(context, CompetitionUpdateRequestSchema);
    const competition = await dependencies.repository.updateCompetition(
      context.env.DB,
      competitionId,
      input,
    );

    return context.json(CompetitionResponseSchema.parse(competition));
  });

  app.get("/api/v1/competitions/:competitionId/configuration", async (context) => {
    const { competitionId } = await requireConfigurationPermission(context, dependencies);
    const configuration = await dependencies.repository.getCompetitionConfiguration(
      context.env.DB,
      competitionId,
    );

    return context.json(CompetitionConfigurationResponseSchema.parse(configuration));
  });

  app.get("/api/v1/competitions/:competitionId/categories", async (context) => {
    const { competitionId } = await requireConfigurationPermission(context, dependencies);
    const categoryList = await dependencies.repository.listCategories(
      context.env.DB,
      competitionId,
    );

    return context.json(CategoryListResponseSchema.parse({ categories: categoryList }));
  });

  app.post("/api/v1/competitions/:competitionId/categories", async (context) => {
    const { competitionId } = await requireConfigurationPermission(context, dependencies);
    const input = await parseJsonBody(context, CategoryCreateRequestSchema);
    const category = await dependencies.repository.createCategory(
      context.env.DB,
      competitionId,
      input,
    );

    return context.json(CategoryResponseSchema.parse(category), 201);
  });

  app.patch("/api/v1/competitions/:competitionId/categories/:categoryId", async (context) => {
    const { competitionId } = await requireConfigurationPermission(context, dependencies);
    const input = await parseJsonBody(context, CategoryUpdateRequestSchema);
    const category = await dependencies.repository.updateCategory(
      context.env.DB,
      competitionId,
      requiredParameter(context, "categoryId"),
      input,
    );

    return context.json(CategoryResponseSchema.parse(category));
  });

  app.delete("/api/v1/competitions/:competitionId/categories/:categoryId", async (context) => {
    const { competitionId } = await requireConfigurationPermission(context, dependencies);
    await dependencies.repository.deleteCategory(
      context.env.DB,
      competitionId,
      requiredParameter(context, "categoryId"),
    );

    return context.body(null, 204);
  });

  app.get("/api/v1/competitions/:competitionId/templates", async (context) => {
    const { competitionId } = await requireConfigurationPermission(context, dependencies);
    const templates = await dependencies.repository.listTemplateVersions(
      context.env.DB,
      competitionId,
    );

    return context.json(TemplateVersionListResponseSchema.parse({ templates }));
  });

  app.post("/api/v1/competitions/:competitionId/templates", async (context) => {
    const { competitionId } = await requireConfigurationPermission(context, dependencies);
    const input = await parseJsonBody(context, TemplateVersionCreateRequestSchema);
    const template = await dependencies.repository.createTemplateVersion(
      context.env.DB,
      competitionId,
      input,
    );

    return context.json(TemplateVersionResponseSchema.parse(template), 201);
  });

  app.patch("/api/v1/competitions/:competitionId/templates/:templateVersionId", async (context) => {
    const { competitionId } = await requireConfigurationPermission(context, dependencies);
    const input = await parseJsonBody(context, TemplateVersionUpdateRequestSchema);
    const template = await dependencies.repository.updateDraftTemplateVersion(
      context.env.DB,
      competitionId,
      requiredParameter(context, "templateVersionId"),
      input,
    );

    return context.json(TemplateVersionResponseSchema.parse(template));
  });

  app.post(
    "/api/v1/competitions/:competitionId/templates/:templateVersionId/activate",
    async (context) => {
      const { competitionId } = await requireConfigurationPermission(context, dependencies);
      const template = await dependencies.repository.activateTemplateVersion(
        context.env.DB,
        competitionId,
        requiredParameter(context, "templateVersionId"),
      );

      return context.json(TemplateVersionResponseSchema.parse(template));
    },
  );

  app.get("/api/v1/competitions/:competitionId/rubrics", async (context) => {
    const { competitionId } = await requireConfigurationPermission(context, dependencies);
    const rubrics = await dependencies.repository.listRubricVersions(context.env.DB, competitionId);

    return context.json(RubricVersionListResponseSchema.parse({ rubrics }));
  });

  app.post("/api/v1/competitions/:competitionId/rubrics", async (context) => {
    const { competitionId } = await requireConfigurationPermission(context, dependencies);
    const input = await parseJsonBody(context, RubricVersionCreateRequestSchema);
    const rubric = await dependencies.repository.createRubricVersion(
      context.env.DB,
      competitionId,
      input,
    );

    return context.json(RubricVersionResponseSchema.parse(rubric), 201);
  });

  app.patch("/api/v1/competitions/:competitionId/rubrics/:rubricVersionId", async (context) => {
    const { competitionId } = await requireConfigurationPermission(context, dependencies);
    const input = await parseJsonBody(context, RubricVersionUpdateRequestSchema);
    const rubric = await dependencies.repository.updateDraftRubricVersion(
      context.env.DB,
      competitionId,
      requiredParameter(context, "rubricVersionId"),
      input,
    );

    return context.json(RubricVersionResponseSchema.parse(rubric));
  });

  app.put(
    "/api/v1/competitions/:competitionId/rubrics/:rubricVersionId/criteria",
    async (context) => {
      const { competitionId } = await requireConfigurationPermission(context, dependencies);
      const input = await parseJsonBody(context, CriteriaReplaceRequestSchema);
      const rubric = await dependencies.repository.replaceDraftCriteria(
        context.env.DB,
        competitionId,
        requiredParameter(context, "rubricVersionId"),
        input,
      );

      return context.json(RubricVersionResponseSchema.parse(rubric));
    },
  );

  app.post(
    "/api/v1/competitions/:competitionId/rubrics/:rubricVersionId/activate",
    async (context) => {
      const { competitionId } = await requireConfigurationPermission(context, dependencies);
      const rubric = await dependencies.repository.activateRubricVersion(
        context.env.DB,
        competitionId,
        requiredParameter(context, "rubricVersionId"),
      );

      return context.json(RubricVersionResponseSchema.parse(rubric));
    },
  );
}
