import { z } from "zod";

import type { AnalysisCheckStatus, AnalysisCheckType, AnalysisRunStatus } from "./analysis";
import type { SimilarityLevel } from "./similarity";

/**
 * Deterministic review-priority model ("İnceleme Önceliği").
 *
 * This is NOT a fraud score, a plagiarism probability or a risk probability, and it is not
 * calibrated against anything. It is a transparent additive ordering over signals that a completed
 * AnalysisRun already persisted, so a manager can decide which submission a human should look at
 * next. Nothing here produces or influences a competition decision: a HIGH priority means "bir
 * insan buna önce bakmalı", never "bu başvuru reddedilmeli".
 *
 * The model is deliberately boring:
 *
 *   score = Σ weight(reason)         level = HIGH  when score ≥ REVIEW_PRIORITY_HIGH_THRESHOLD
 *                                            MEDIUM when score ≥ REVIEW_PRIORITY_MEDIUM_THRESHOLD
 *                                            LOW    otherwise
 *
 * There is no hidden override, no multiplier and no clamping: every level is fully explained by the
 * reason list that travels with it, and the same signals always yield the same level. The numeric
 * score is an internal sort key only. It is transported so the UI can order rows stably and so the
 * weighting stays inspectable, but it must never be rendered as a percentage, a probability or a
 * confidence value.
 *
 * The weights and the two thresholds are PROVISIONAL PRODUCT POLICY, exactly like the similarity
 * thresholds: they encode "how much attention does this signal deserve", not a measured truth, and
 * they are expected to change once a golden set exists.
 */

export const REVIEW_PRIORITY_LEVEL_VALUES = ["HIGH", "MEDIUM", "LOW"] as const;
export const ReviewPriorityLevelSchema = z.enum(REVIEW_PRIORITY_LEVEL_VALUES);
export type ReviewPriorityLevel = z.infer<typeof ReviewPriorityLevelSchema>;

/**
 * Canonical reason order. It doubles as the deterministic tie-breaker for reasons of equal weight,
 * so two identical signal sets always produce byte-identical reason lists.
 */
export const REVIEW_PRIORITY_REASON_CODE_VALUES = [
  "ANALYSIS_FAILED",
  "ANALYSIS_MISSING",
  "ANALYSIS_IN_PROGRESS",
  "SIMILARITY_HIGH",
  "SIMILARITY_MEDIUM",
  "EXACT_DOCUMENT_MATCH",
  "CATEGORY_FIT_FAIL",
  "CATEGORY_FIT_WARN",
  "SECTION_CONTENT_FAIL",
  "SECTION_CONTENT_WARN",
  "REQUIRED_SECTION_WEAK_EVIDENCE",
  "SECTION_PRESENCE_FAIL",
  "SECTION_PRESENCE_WARN",
  "TEMPLATE_STRUCTURE_FAIL",
  "TEMPLATE_STRUCTURE_WARN",
  "LANGUAGE_FAIL",
  "LANGUAGE_WARN",
  "RUBRIC_WEAK_EVIDENCE",
  "RUBRIC_SUGGESTION_MISSING",
  "AI_HUMAN_DISAGREEMENT",
  "NO_REVIEWER_ASSIGNED",
  "REVIEW_NOT_STARTED",
  "HUMAN_REVIEW_COMPLETED",
] as const;
export const ReviewPriorityReasonCodeSchema = z.enum(REVIEW_PRIORITY_REASON_CODE_VALUES);
export type ReviewPriorityReasonCode = z.infer<typeof ReviewPriorityReasonCodeSchema>;

/**
 * Provisional weights. Kept in one exported table so the rules are inspectable rather than hidden
 * inside the derivation, and so a test can assert the derivation actually uses them.
 *
 * `HUMAN_REVIEW_COMPLETED` weighs 0 on purpose: a finished human review is worth stating in the
 * reason list, but it neither raises nor lowers the priority. Lowering it would be an override that
 * hides a real remaining signal (a high similarity observation stays worth a second look even after
 * one reviewer submitted), and raising it would push completed work back up the queue.
 */
export const REVIEW_PRIORITY_REASON_WEIGHTS = {
  ANALYSIS_FAILED: 6,
  ANALYSIS_MISSING: 4,
  ANALYSIS_IN_PROGRESS: 1,
  SIMILARITY_HIGH: 6,
  SIMILARITY_MEDIUM: 2,
  EXACT_DOCUMENT_MATCH: 4,
  CATEGORY_FIT_FAIL: 4,
  CATEGORY_FIT_WARN: 2,
  SECTION_CONTENT_FAIL: 3,
  SECTION_CONTENT_WARN: 2,
  REQUIRED_SECTION_WEAK_EVIDENCE: 2,
  SECTION_PRESENCE_FAIL: 3,
  SECTION_PRESENCE_WARN: 1,
  TEMPLATE_STRUCTURE_FAIL: 2,
  TEMPLATE_STRUCTURE_WARN: 1,
  LANGUAGE_FAIL: 3,
  LANGUAGE_WARN: 1,
  RUBRIC_WEAK_EVIDENCE: 2,
  RUBRIC_SUGGESTION_MISSING: 1,
  AI_HUMAN_DISAGREEMENT: 2,
  NO_REVIEWER_ASSIGNED: 2,
  REVIEW_NOT_STARTED: 1,
  HUMAN_REVIEW_COMPLETED: 0,
} as const satisfies Record<ReviewPriorityReasonCode, number>;

/** Provisional product policy, not a calibrated boundary. */
export const REVIEW_PRIORITY_MEDIUM_THRESHOLD = 3;
export const REVIEW_PRIORITY_HIGH_THRESHOLD = 6;

export const MAX_REVIEW_PRIORITY_REASONS = REVIEW_PRIORITY_REASON_CODE_VALUES.length;

export const ReviewPriorityReasonSchema = z
  .object({
    code: ReviewPriorityReasonCodeSchema,
    /** Reviewer-facing Turkish wording. Never a verdict, never a probability. */
    label: z.string().min(1).max(160),
    /** Internal weight this reason contributed to the sort key. */
    weight: z.number().int(),
  })
  .strict();
export type ReviewPriorityReason = z.infer<typeof ReviewPriorityReasonSchema>;

export const ReviewPriorityAssessmentSchema = z
  .object({
    level: ReviewPriorityLevelSchema,
    /**
     * Internal deterministic sort key. Not a probability, not a percentage and not a score out of
     * anything; it exists so rows order stably and so the weighting stays visible.
     */
    score: z.number().int().nonnegative(),
    reasons: z.array(ReviewPriorityReasonSchema).max(MAX_REVIEW_PRIORITY_REASONS),
  })
  .strict()
  .refine((value) => value.score === value.reasons.reduce((total, r) => total + r.weight, 0), {
    message: "İnceleme önceliği puanı gerekçelerin toplamına eşit olmalıdır.",
    path: ["score"],
  });
export type ReviewPriorityAssessment = z.infer<typeof ReviewPriorityAssessmentSchema>;

/**
 * The already persisted facts the priority is derived from. Every field is read from D1 — an
 * AnalysisRun, its AnalysisChecks, its RubricSuggestions, the ReviewerAssignments and the
 * ReviewerEvaluations — so deriving a priority never performs AI inference of any kind.
 */
export interface ReviewPrioritySignals {
  /** Status of the submission's most recent AnalysisRun; null when the submission has none. */
  analysisStatus: AnalysisRunStatus | null;
  /** True when a SUCCEEDED run exists whose persisted checks are the source of the check signals. */
  referenceRunAvailable: boolean;
  /** Check statuses of that reference run. A missing key means the check was never persisted. */
  checkStatuses: Partial<Record<AnalysisCheckType, AnalysisCheckStatus>>;
  /**
   * Level recorded by the reference run's SIMILARITY check. The SIMILARITY check's own PASS/WARN
   * status is deliberately not counted as well: it is derived from this same level, and counting
   * both would weigh one observation twice.
   */
  similarityLevel: SimilarityLevel | null;
  /** Byte-identical report already present in this competition. A signal, never a verdict. */
  exactDocumentMatch: boolean;
  /** Required sections whose SECTION_CONTENT evidence did not support the expectation. */
  weakEvidenceSectionCount: number;
  /** Rubric criteria whose AI suggestion carries LOW evidence strength. */
  weakEvidenceCriterionCount: number;
  assignedReviewerCount: number;
  /** Assignments that already carry a ReviewerEvaluation, draft or submitted. */
  startedEvaluationCount: number;
  submittedEvaluationCount: number;
  /** Criteria where a reviewer's own score differs from the AI suggestion. Never an error. */
  disagreementCount: number;
}

const CHECK_REASONS = {
  LANGUAGE: { WARN: "LANGUAGE_WARN", FAIL: "LANGUAGE_FAIL" },
  TEMPLATE_STRUCTURE: { WARN: "TEMPLATE_STRUCTURE_WARN", FAIL: "TEMPLATE_STRUCTURE_FAIL" },
  SECTION_PRESENCE: { WARN: "SECTION_PRESENCE_WARN", FAIL: "SECTION_PRESENCE_FAIL" },
  SECTION_CONTENT: { WARN: "SECTION_CONTENT_WARN", FAIL: "SECTION_CONTENT_FAIL" },
  CATEGORY_FIT: { WARN: "CATEGORY_FIT_WARN", FAIL: "CATEGORY_FIT_FAIL" },
} as const satisfies Partial<
  Record<AnalysisCheckType, Record<"WARN" | "FAIL", ReviewPriorityReasonCode>>
>;

const STATIC_REASON_LABELS = {
  ANALYSIS_FAILED: "Analiz çalışması tamamlanamadı",
  ANALYSIS_MISSING: "Tamamlanmış analiz çalışması yok",
  ANALYSIS_IN_PROGRESS: "Analiz sürüyor",
  SIMILARITY_HIGH: "Yüksek benzerlik sinyali",
  SIMILARITY_MEDIUM: "Orta düzey benzerlik sinyali",
  EXACT_DOCUMENT_MATCH: "Birebir belge eşleşmesi",
  CATEGORY_FIT_FAIL: "Kategori uyumu uygun değil",
  CATEGORY_FIT_WARN: "Kategori uyumu incelenmeli",
  SECTION_CONTENT_FAIL: "Bölüm içeriği beklentiyi karşılamıyor",
  SECTION_CONTENT_WARN: "Bölüm içeriği incelenmeli",
  SECTION_PRESENCE_FAIL: "Zorunlu başlıklar eksik",
  SECTION_PRESENCE_WARN: "Başlık yapısı incelenmeli",
  TEMPLATE_STRUCTURE_FAIL: "Şablon yapısı uygun değil",
  TEMPLATE_STRUCTURE_WARN: "Şablon yapısı incelenmeli",
  LANGUAGE_FAIL: "Rapor dili beklenen dille uyumlu değil",
  LANGUAGE_WARN: "Rapor dili incelenmeli",
  RUBRIC_SUGGESTION_MISSING: "Bu koşuda AI rubrik önerisi yok",
  NO_REVIEWER_ASSIGNED: "Hakem atanmamış",
  REVIEW_NOT_STARTED: "Hakem değerlendirmesi başlamamış",
  HUMAN_REVIEW_COMPLETED: "Hakem değerlendirmesi gönderildi",
} as const;

type StaticReasonCode = keyof typeof STATIC_REASON_LABELS;
type CountedReasonCode = Exclude<ReviewPriorityReasonCode, StaticReasonCode>;

function countedLabel(code: CountedReasonCode, count: number): string {
  if (code === "REQUIRED_SECTION_WEAK_EVIDENCE") return `${count} zorunlu bölümde zayıf kanıt`;
  if (code === "RUBRIC_WEAK_EVIDENCE") return `${count} kriterde AI kanıtı zayıf`;
  return `${count} kriterde hakem puanı AI önerisinden farklı`;
}

function reasonOf(code: ReviewPriorityReasonCode, label: string): ReviewPriorityReason {
  return { code, label, weight: REVIEW_PRIORITY_REASON_WEIGHTS[code] };
}

const CANONICAL_ORDER = new Map(
  REVIEW_PRIORITY_REASON_CODE_VALUES.map((code, index) => [code, index]),
);

function levelForScore(score: number): ReviewPriorityLevel {
  if (score >= REVIEW_PRIORITY_HIGH_THRESHOLD) return "HIGH";
  if (score >= REVIEW_PRIORITY_MEDIUM_THRESHOLD) return "MEDIUM";
  return "LOW";
}

/**
 * Derives the review priority. Pure and deterministic: the same signals always produce the same
 * level, the same score and the same ordered reason list, and no reason is ever hidden — the level
 * is exactly what the returned reasons add up to.
 */
export function deriveReviewPriority(signals: ReviewPrioritySignals): ReviewPriorityAssessment {
  const reasons: ReviewPriorityReason[] = [];
  const add = (code: StaticReasonCode) => {
    reasons.push(reasonOf(code, STATIC_REASON_LABELS[code]));
  };
  const addCounted = (code: CountedReasonCode, count: number) => {
    reasons.push(reasonOf(code, countedLabel(code, count)));
  };

  // A submission whose newest run FAILED but which still has an older SUCCEEDED run keeps both the
  // failure reason and that older run's check reasons: the failure is real operational news, and the
  // older run's persisted checks are still the best evidence a reviewer has.
  if (signals.analysisStatus === null) {
    add("ANALYSIS_MISSING");
  } else if (signals.analysisStatus === "FAILED") {
    add("ANALYSIS_FAILED");
  } else if (signals.analysisStatus === "QUEUED" || signals.analysisStatus === "PROCESSING") {
    add("ANALYSIS_IN_PROGRESS");
  }

  for (const [checkType, mapping] of Object.entries(CHECK_REASONS)) {
    const status = signals.checkStatuses[checkType as AnalysisCheckType];
    if (status === "WARN" || status === "FAIL") add(mapping[status]);
  }

  if (signals.similarityLevel === "HIGH") add("SIMILARITY_HIGH");
  else if (signals.similarityLevel === "MEDIUM") add("SIMILARITY_MEDIUM");
  if (signals.exactDocumentMatch) add("EXACT_DOCUMENT_MATCH");

  if (signals.weakEvidenceSectionCount > 0) {
    addCounted("REQUIRED_SECTION_WEAK_EVIDENCE", signals.weakEvidenceSectionCount);
  }
  if (signals.weakEvidenceCriterionCount > 0) {
    addCounted("RUBRIC_WEAK_EVIDENCE", signals.weakEvidenceCriterionCount);
  }
  if (signals.referenceRunAvailable && signals.checkStatuses.RUBRIC_EVALUATION === undefined) {
    add("RUBRIC_SUGGESTION_MISSING");
  }

  if (signals.disagreementCount > 0) {
    addCounted("AI_HUMAN_DISAGREEMENT", signals.disagreementCount);
  }

  if (signals.assignedReviewerCount === 0) {
    add("NO_REVIEWER_ASSIGNED");
  } else if (signals.startedEvaluationCount === 0) {
    add("REVIEW_NOT_STARTED");
  } else if (signals.submittedEvaluationCount >= signals.assignedReviewerCount) {
    add("HUMAN_REVIEW_COMPLETED");
  }

  reasons.sort(
    (left, right) =>
      right.weight - left.weight ||
      (CANONICAL_ORDER.get(left.code) ?? 0) - (CANONICAL_ORDER.get(right.code) ?? 0),
  );

  const score = reasons.reduce((total, reason) => total + reason.weight, 0);
  return { level: levelForScore(score), score, reasons };
}
