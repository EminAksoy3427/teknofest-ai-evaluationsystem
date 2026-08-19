import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { analysisRunRepository } from "@teknofest-ai/db";

import { encodeSafeFailure, processAnalysisRun, safeAnalysisFailure } from "./process-analysis-run";

export interface SubmissionAnalysisWorkflowParams {
  analysisRunId: string;
}

interface SubmissionAnalysisWorkflowEnvironment {
  DB: D1Database;
  DOCUMENTS: R2Bucket;
}

const DATABASE_STEP = {
  retries: { limit: 3, delay: "1 second", backoff: "exponential" },
  timeout: "30 seconds",
} as const;

const EXTRACTION_STEP = {
  retries: { limit: 3, delay: "2 seconds", backoff: "exponential" },
  timeout: "5 minutes",
} as const;

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

      await step.do("analysis-run-success", DATABASE_STEP, async () => {
        await analysisRunRepository.markAnalysisRunSucceeded(
          this.env.DB,
          analysisRunId,
          extraction,
        );
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
