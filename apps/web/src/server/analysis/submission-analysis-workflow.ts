import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { OpenAIProvider } from "@teknofest-ai/ai";
import { analysisRunRepository } from "@teknofest-ai/db";
import { DocumentProcessingError } from "./document-extraction";
import { encodeSafeFailure, processAnalysisRun, safeAnalysisFailure } from "./process-analysis-run";
import { analyzeCategoryFit, analyzeSectionContent, persistSemanticCheck } from "./semantic-checks";
import { processStructuralChecks } from "./structural-checks";

export interface SubmissionAnalysisWorkflowParams {
  analysisRunId: string;
}

interface SubmissionAnalysisWorkflowEnvironment {
  DB: D1Database;
  DOCUMENTS: R2Bucket;
  OPENAI_API_KEY: string;
}

const DATABASE_STEP = {
  retries: { limit: 3, delay: "1 second", backoff: "exponential" },
  timeout: "30 seconds",
} as const;

const EXTRACTION_STEP = {
  retries: { limit: 3, delay: "2 seconds", backoff: "exponential" },
  timeout: "5 minutes",
} as const;

const STRUCTURAL_CHECK_STEP = {
  retries: { limit: 3, delay: "2 seconds", backoff: "exponential" },
  timeout: "1 minute",
} as const;

const SEMANTIC_API_STEP = {
  retries: { limit: 3, delay: "5 seconds", backoff: "exponential" },
  timeout: "2 minutes",
} as const;

async function providerForRun(
  environment: SubmissionAnalysisWorkflowEnvironment,
  analysisRunId: string,
) {
  const run = await analysisRunRepository.getAnalysisRunExecutionContext(
    environment.DB,
    analysisRunId,
  );
  if (!run?.modelId || !run.promptBundleVersion || !environment.OPENAI_API_KEY?.trim()) {
    throw encodeSafeFailure(
      new DocumentProcessingError(
        "AI_CONFIGURATION_INVALID",
        "Analiz koşusunun yapay zekâ yapılandırması eksik.",
      ),
    );
  }
  return new OpenAIProvider({
    apiKey: environment.OPENAI_API_KEY,
    modelId: run.modelId,
    promptBundleVersion: run.promptBundleVersion,
  });
}

export class SubmissionAnalysisWorkflow extends WorkflowEntrypoint<
  SubmissionAnalysisWorkflowEnvironment,
  SubmissionAnalysisWorkflowParams
> {
  async run(event: WorkflowEvent<SubmissionAnalysisWorkflowParams>, step: WorkflowStep) {
    const analysisRunId = event.payload.analysisRunId;
    try {
      await step.do("analysis-run-processing", DATABASE_STEP, async () => {
        await analysisRunRepository.markAnalysisRunProcessing(this.env.DB, analysisRunId);
        return { analysisRunId };
      });

      const extraction = await step.do("ingest-and-extract", EXTRACTION_STEP, async () => {
        try {
          return await processAnalysisRun(this.env.DB, this.env.DOCUMENTS, analysisRunId);
        } catch (error) {
          throw encodeSafeFailure(error);
        }
      });

      await step.do("structural-checks-stage", DATABASE_STEP, async () => {
        await analysisRunRepository.markAnalysisRunStructuralChecks(
          this.env.DB,
          analysisRunId,
          extraction,
        );
        return { analysisRunId, stage: "STRUCTURAL_CHECKS" as const };
      });

      await step.do("structural-checks", STRUCTURAL_CHECK_STEP, async () => {
        try {
          await processStructuralChecks(this.env.DB, this.env.DOCUMENTS, analysisRunId);
          return { analysisRunId, checked: true };
        } catch (error) {
          throw encodeSafeFailure(error);
        }
      });

      await step.do("semantic-checks-stage", DATABASE_STEP, async () => {
        await analysisRunRepository.markAnalysisRunSemanticChecks(this.env.DB, analysisRunId);
        return { analysisRunId, stage: "SEMANTIC_CHECKS" as const };
      });

      const sectionContent = await step.do(
        "semantic-section-content-api",
        SEMANTIC_API_STEP,
        async () => {
          try {
            return await analyzeSectionContent(
              this.env.DB,
              this.env.DOCUMENTS,
              analysisRunId,
              await providerForRun(this.env, analysisRunId),
            );
          } catch (error) {
            throw encodeSafeFailure(error);
          }
        },
      );

      await step.do("semantic-section-content-persist", DATABASE_STEP, async () => {
        await persistSemanticCheck(this.env.DB, analysisRunId, sectionContent);
        return { analysisRunId, type: "SECTION_CONTENT" as const };
      });

      const categoryFit = await step.do(
        "semantic-category-fit-api",
        SEMANTIC_API_STEP,
        async () => {
          try {
            return await analyzeCategoryFit(
              this.env.DB,
              this.env.DOCUMENTS,
              analysisRunId,
              await providerForRun(this.env, analysisRunId),
            );
          } catch (error) {
            throw encodeSafeFailure(error);
          }
        },
      );

      await step.do("semantic-category-fit-persist", DATABASE_STEP, async () => {
        await persistSemanticCheck(this.env.DB, analysisRunId, categoryFit);
        return { analysisRunId, type: "CATEGORY_FIT" as const };
      });

      await step.do("analysis-run-success", DATABASE_STEP, async () => {
        await analysisRunRepository.markAnalysisRunSucceeded(this.env.DB, analysisRunId);
        return { analysisRunId, status: "SUCCEEDED" as const };
      });

      return { analysisRunId, status: "SUCCEEDED" as const };
    } catch (error) {
      const failure = safeAnalysisFailure(error);
      await step.do("analysis-run-failure", DATABASE_STEP, async () => {
        await analysisRunRepository.markAnalysisRunFailed(
          this.env.DB,
          analysisRunId,
          failure.code,
          failure.message,
        );
        return { analysisRunId, status: "FAILED" as const, errorCode: failure.code };
      });
      return { analysisRunId, status: "FAILED" as const, errorCode: failure.code };
    }
  }
}
