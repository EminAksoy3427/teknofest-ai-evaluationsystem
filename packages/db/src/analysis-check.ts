import {
  type AnalysisCheckDetails,
  AnalysisCheckDetailsSchema,
  type AnalysisCheckResponse,
  AnalysisCheckResponseSchema,
  type AnalysisCheckStatus,
  AnalysisCheckStatusSchema,
  type AnalysisCheckType,
  AnalysisCheckTypeSchema,
} from "@teknofest-ai/shared";
import { asc, eq } from "drizzle-orm";

import { createDb } from "./client";
import { analysisChecks } from "./schema";

export interface AnalysisCheckWriteInput {
  type: AnalysisCheckType;
  status: AnalysisCheckStatus;
  summary: string;
  details: AnalysisCheckDetails;
}

function timestamp(value: Date | number): number {
  return value instanceof Date ? value.getTime() : value;
}

function mapAnalysisCheck(row: typeof analysisChecks.$inferSelect): AnalysisCheckResponse {
  return AnalysisCheckResponseSchema.parse({
    id: row.id,
    analysisRunId: row.analysisRunId,
    type: row.type,
    status: row.status,
    summary: row.summary,
    details: AnalysisCheckDetailsSchema.parse(JSON.parse(row.detailsJson)),
    createdAt: timestamp(row.createdAt),
    updatedAt: timestamp(row.updatedAt),
  });
}

function validateInput(input: AnalysisCheckWriteInput): AnalysisCheckWriteInput {
  const details = AnalysisCheckDetailsSchema.parse(input.details);
  const type = AnalysisCheckTypeSchema.parse(input.type);
  const status = AnalysisCheckStatusSchema.parse(input.status);
  const summary = input.summary.trim();
  if (summary.length < 1 || summary.length > 500) {
    throw new Error("AnalysisCheck özeti 1-500 karakter olmalıdır.");
  }
  if (details.checkType !== type) {
    throw new Error("AnalysisCheck türü ile detay türü eşleşmelidir.");
  }
  return { type, status, summary, details };
}

export async function upsertAnalysisChecks(
  binding: D1Database,
  analysisRunId: string,
  inputs: readonly AnalysisCheckWriteInput[],
): Promise<void> {
  const validated = inputs.map(validateInput);
  if (new Set(validated.map((input) => input.type)).size !== validated.length) {
    throw new Error("Aynı kontrol türü bir batch içinde tekrarlanamaz.");
  }

  const now = Date.now();
  const results = await binding.batch(
    validated.map((input) =>
      binding
        .prepare(
          `INSERT INTO analysis_check (
             id, analysis_run_id, type, status, summary, details_json, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (analysis_run_id, type) DO UPDATE SET
             status = excluded.status,
             summary = excluded.summary,
             details_json = excluded.details_json,
             updated_at = excluded.updated_at`,
        )
        .bind(
          crypto.randomUUID(),
          analysisRunId,
          input.type,
          input.status,
          input.summary,
          JSON.stringify(input.details),
          now,
          now,
        ),
    ),
  );

  if (results.some((result) => !result.success)) {
    throw new Error("AnalysisCheck batch yazımı tamamlanamadı.");
  }
}

export async function listAnalysisChecks(
  binding: D1Database,
  analysisRunId: string,
): Promise<AnalysisCheckResponse[]> {
  const rows = await createDb(binding)
    .select()
    .from(analysisChecks)
    .where(eq(analysisChecks.analysisRunId, analysisRunId))
    .orderBy(asc(analysisChecks.type));
  return rows.map(mapAnalysisCheck);
}

export const analysisCheckRepository = { listAnalysisChecks, upsertAnalysisChecks };
export type AnalysisCheckRepository = typeof analysisCheckRepository;
