import { SEMANTIC_PROMPT_BUNDLE_VERSION } from "@teknofest-ai/ai";
import type {
  AnalysisRunRepository,
  CompetitionMembershipLookup,
  SimilarityPairRepository,
} from "@teknofest-ai/db";
import {
  AnalysisRunListResponseSchema,
  AnalysisRunResponseSchema,
  SubmissionSimilarityResponseSchema,
} from "@teknofest-ai/shared";
import type { Hono } from "hono";
import { readAIConfiguration } from "./ai/env";
import type { SubmissionAnalysisWorkflowParams } from "./analysis/submission-analysis-workflow";
import { ApiApplicationError } from "./api-error";
import type { AuthRuntimeBindings } from "./auth/auth";
import type { SessionResolver } from "./auth/session";
import { requireCompetitionPermission } from "./authorization/membership";
import { requireAuthenticatedUser } from "./authorization/require-auth";

export interface AnalysisWorkflowStarter {
  start(
    environment: AuthRuntimeBindings,
    instanceId: string,
    params: SubmissionAnalysisWorkflowParams,
  ): Promise<{ id: string }>;
}

export const analysisWorkflowStarter: AnalysisWorkflowStarter = {
  async start(environment, instanceId, params) {
    const instance = await environment.SUBMISSION_ANALYSIS.create({ id: instanceId, params });
    return { id: instance.id };
  },
};

export interface AnalysisRouteDependencies {
  resolveSession: SessionResolver;
  findMembership: CompetitionMembershipLookup;
  analysisRunRepository: AnalysisRunRepository;
  analysisWorkflowStarter: AnalysisWorkflowStarter;
  similarityPairRepository: SimilarityPairRepository;
}

function requiredParameter(value: string | undefined, name: string): string {
  if (!value) {
    throw new ApiApplicationError(
      { code: "VALIDATION_ERROR", message: `${name} parametresi gereklidir.` },
      400,
    );
  }
  return value;
}

async function requireAnalysisPermission(
  context: {
    req: { raw: Request; param(name: string): string | undefined };
    env: AuthRuntimeBindings;
  },
  dependencies: AnalysisRouteDependencies,
) {
  const user = await requireAuthenticatedUser(
    context.req.raw,
    context.env,
    dependencies.resolveSession,
  );
  const competitionId = requiredParameter(context.req.param("competitionId"), "competitionId");
  await requireCompetitionPermission(
    context.env,
    user.id,
    competitionId,
    "competition:configure",
    dependencies.findMembership,
  );
  return competitionId;
}

export function registerAnalysisRoutes(
  app: Hono<{ Bindings: AuthRuntimeBindings }>,
  dependencies: AnalysisRouteDependencies,
) {
  // Without `analysisRunId` the response is derived from the submission's current AnalysisRun.
  // With `analysisRunId` it stays pinned to that historical run and never floats forward.
  app.get(
    "/api/v1/competitions/:competitionId/submissions/:submissionId/similarity",
    async (context) => {
      const competitionId = await requireAnalysisPermission(context, dependencies);
      const submissionId = requiredParameter(context.req.param("submissionId"), "submissionId");
      const requestedRunId = context.req.query("analysisRunId");
      if (requestedRunId === undefined) {
        const current = await dependencies.similarityPairRepository.listSubmissionSimilarity(
          context.env.DB,
          competitionId,
          submissionId,
        );
        return context.json(
          SubmissionSimilarityResponseSchema.parse({
            submissionId,
            analysisRunId: current.analysisRunId,
            pairs: current.pairs,
          }),
        );
      }
      const analysisRunId = requiredParameter(requestedRunId, "analysisRunId");
      const run = await dependencies.analysisRunRepository.getAnalysisRun(
        context.env.DB,
        competitionId,
        submissionId,
        analysisRunId,
      );
      if (!run) {
        throw new ApiApplicationError(
          { code: "NOT_FOUND", message: "Analiz kaydı bulunamadı." },
          404,
        );
      }
      const pairs = await dependencies.similarityPairRepository.listAnalysisRunSimilarity(
        context.env.DB,
        competitionId,
        run.id,
      );
      return context.json(
        SubmissionSimilarityResponseSchema.parse({ submissionId, analysisRunId: run.id, pairs }),
      );
    },
  );

  app.post(
    "/api/v1/competitions/:competitionId/submissions/:submissionId/analysis-runs",
    async (context) => {
      const competitionId = await requireAnalysisPermission(context, dependencies);
      const submissionId = requiredParameter(context.req.param("submissionId"), "submissionId");
      const analysisRunId = crypto.randomUUID();
      let aiConfiguration: ReturnType<typeof readAIConfiguration>;
      try {
        aiConfiguration = readAIConfiguration(context.env);
      } catch {
        throw new ApiApplicationError(
          { code: "INTERNAL_ERROR", message: "Yapay zekâ sağlayıcı yapılandırması geçersiz." },
          500,
        );
      }
      const created = await dependencies.analysisRunRepository.createQueuedAnalysisRun(
        context.env.DB,
        {
          id: analysisRunId,
          workflowInstanceId: analysisRunId,
          competitionId,
          submissionId,
          aiProvider: aiConfiguration.provider,
          modelId: aiConfiguration.modelId,
          promptBundleVersion: SEMANTIC_PROMPT_BUNDLE_VERSION,
        },
      );

      try {
        await dependencies.analysisWorkflowStarter.start(context.env, analysisRunId, {
          analysisRunId,
        });
      } catch {
        await dependencies.analysisRunRepository.markAnalysisRunFailed(
          context.env.DB,
          analysisRunId,
          "WORKFLOW_START_FAILED",
          "Belge işleme iş akışı başlatılamadı.",
        );
        throw new ApiApplicationError(
          { code: "INTERNAL_ERROR", message: "Belge işleme iş akışı başlatılamadı." },
          500,
        );
      }

      const current = await dependencies.analysisRunRepository.getAnalysisRun(
        context.env.DB,
        competitionId,
        submissionId,
        analysisRunId,
      );
      return context.json(AnalysisRunResponseSchema.parse(current ?? created), 201);
    },
  );

  app.get(
    "/api/v1/competitions/:competitionId/submissions/:submissionId/analysis-runs",
    async (context) => {
      const competitionId = await requireAnalysisPermission(context, dependencies);
      const submissionId = requiredParameter(context.req.param("submissionId"), "submissionId");
      const runHistory = await dependencies.analysisRunRepository.listAnalysisRuns(
        context.env.DB,
        competitionId,
        submissionId,
      );
      return context.json(AnalysisRunListResponseSchema.parse({ runHistory }));
    },
  );

  app.get(
    "/api/v1/competitions/:competitionId/submissions/:submissionId/analysis-runs/:analysisRunId",
    async (context) => {
      const competitionId = await requireAnalysisPermission(context, dependencies);
      const submissionId = requiredParameter(context.req.param("submissionId"), "submissionId");
      const analysisRunId = requiredParameter(context.req.param("analysisRunId"), "analysisRunId");
      const run = await dependencies.analysisRunRepository.getAnalysisRun(
        context.env.DB,
        competitionId,
        submissionId,
        analysisRunId,
      );
      if (!run) {
        throw new ApiApplicationError(
          { code: "NOT_FOUND", message: "Analiz kaydı bulunamadı." },
          404,
        );
      }
      return context.json(AnalysisRunResponseSchema.parse(run));
    },
  );
}
