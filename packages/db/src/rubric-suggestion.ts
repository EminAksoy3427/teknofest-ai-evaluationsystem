import {
  MAX_RUBRIC_MISSING_POINT_CHARACTERS,
  MAX_RUBRIC_MISSING_POINTS,
  MAX_RUBRIC_REASON_CHARACTERS,
  MAX_SEMANTIC_EVIDENCE_ITEMS,
  type RubricCriterionSuggestion,
  RubricCriterionSuggestionSchema,
  type SemanticEvidence,
  SemanticEvidenceSchema,
  type SemanticEvidenceStrength,
  SemanticEvidenceStrengthSchema,
} from "@teknofest-ai/shared";
import { asc, eq } from "drizzle-orm";

import { createDb } from "./client";
import { criteria, rubricSuggestions } from "./schema";

export interface RubricSuggestionWriteInput {
  criterionId: string;
  suggestedScore: number;
  reason: string;
  evidenceStrength: SemanticEvidenceStrength;
  evidence: SemanticEvidence[];
  missingPoints: string[];
}

function validateInput(input: RubricSuggestionWriteInput): RubricSuggestionWriteInput {
  const suggestedScore = input.suggestedScore;
  if (!Number.isInteger(suggestedScore) || suggestedScore < 0) {
    throw new Error("Önerilen puan negatif olmayan bir tam sayı olmalıdır.");
  }
  const reason = input.reason.trim();
  if (reason.length < 1 || reason.length > MAX_RUBRIC_REASON_CHARACTERS) {
    throw new Error("Rubrik önerisi gerekçesi uzunluk sınırının dışında.");
  }
  const evidenceStrength = SemanticEvidenceStrengthSchema.parse(input.evidenceStrength);
  const evidence = SemanticEvidenceSchema.array()
    .max(MAX_SEMANTIC_EVIDENCE_ITEMS)
    .parse(input.evidence);
  if (input.missingPoints.length > MAX_RUBRIC_MISSING_POINTS) {
    throw new Error("Eksik nokta listesi sınırın üzerinde.");
  }
  const missingPoints = input.missingPoints.map((point) => {
    const trimmed = point.trim();
    if (trimmed.length < 1 || trimmed.length > MAX_RUBRIC_MISSING_POINT_CHARACTERS) {
      throw new Error("Eksik nokta metni uzunluk sınırının dışında.");
    }
    return trimmed;
  });
  return {
    criterionId: input.criterionId,
    suggestedScore,
    reason,
    evidenceStrength,
    evidence,
    missingPoints,
  };
}

/**
 * Writes this AnalysisRun's per-criterion rubric suggestions. Every row is pinned to the run's own
 * RubricVersion via a composite foreign key checked at the database boundary, so a suggestion can
 * never attach to a criterion outside the run's pinned rubric. A retry upserts the same logical
 * `(analysis_run_id, criterion_id)` row instead of appending a duplicate; a later AnalysisRun for
 * the same submission always writes its own new rows and never mutates an older run's suggestions.
 */
export async function upsertRubricSuggestions(
  binding: D1Database,
  analysisRunId: string,
  rubricVersionId: string,
  inputs: readonly RubricSuggestionWriteInput[],
): Promise<void> {
  const validated = inputs.map(validateInput);
  if (new Set(validated.map((input) => input.criterionId)).size !== validated.length) {
    throw new Error("Aynı kriter bir batch içinde tekrarlanamaz.");
  }
  if (validated.length === 0) return;

  const now = Date.now();
  const results = await binding.batch(
    validated.map((input) =>
      binding
        .prepare(
          `INSERT INTO rubric_suggestion (
             id, analysis_run_id, rubric_version_id, criterion_id, suggested_score, reason,
             evidence_strength, evidence_json, missing_points_json, created_at, updated_at
           )
           SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
           WHERE EXISTS (SELECT 1 FROM analysis_run WHERE id = ? AND rubric_version_id = ?)
             AND EXISTS (SELECT 1 FROM criterion WHERE rubric_version_id = ? AND id = ?)
           ON CONFLICT (analysis_run_id, criterion_id) DO UPDATE SET
             suggested_score = excluded.suggested_score,
             reason = excluded.reason,
             evidence_strength = excluded.evidence_strength,
             evidence_json = excluded.evidence_json,
             missing_points_json = excluded.missing_points_json,
             updated_at = excluded.updated_at`,
        )
        .bind(
          crypto.randomUUID(),
          analysisRunId,
          rubricVersionId,
          input.criterionId,
          input.suggestedScore,
          input.reason,
          input.evidenceStrength,
          JSON.stringify(input.evidence),
          JSON.stringify(input.missingPoints),
          now,
          now,
          analysisRunId,
          rubricVersionId,
          rubricVersionId,
          input.criterionId,
        ),
    ),
  );

  if (results.some((result) => !result.success || result.meta.changes !== 1)) {
    throw new Error("Rubrik önerisi pinlenmiş kapsamla doğrulanamadı.");
  }
}

/**
 * Reads back this AnalysisRun's rubric suggestions, ordered by the pinned Criterion's stable
 * sort order. Criterion identity, title and `maxScore` are joined live from the (immutable, once
 * activated) `criterion` row rather than duplicated onto the suggestion row.
 */
export async function listRubricSuggestionsForRun(
  binding: D1Database,
  analysisRunId: string,
): Promise<RubricCriterionSuggestion[]> {
  const rows = await createDb(binding)
    .select({ suggestion: rubricSuggestions, criterion: criteria })
    .from(rubricSuggestions)
    .innerJoin(criteria, eq(criteria.id, rubricSuggestions.criterionId))
    .where(eq(rubricSuggestions.analysisRunId, analysisRunId))
    .orderBy(asc(criteria.sortOrder), asc(criteria.id));

  return rows.map(({ suggestion, criterion }) =>
    RubricCriterionSuggestionSchema.parse({
      criterionId: criterion.id,
      code: criterion.code,
      title: criterion.title,
      order: criterion.sortOrder,
      suggestedScore: suggestion.suggestedScore,
      maxScore: criterion.maxScore,
      reason: suggestion.reason,
      evidenceStrength: suggestion.evidenceStrength,
      evidence: JSON.parse(suggestion.evidenceJson),
      missingPoints: JSON.parse(suggestion.missingPointsJson),
    }),
  );
}

export const rubricSuggestionRepository = {
  listRubricSuggestionsForRun,
  upsertRubricSuggestions,
};
export type RubricSuggestionRepository = typeof rubricSuggestionRepository;
