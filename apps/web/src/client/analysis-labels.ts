import type {
  AnalysisCheckStatus,
  AnalysisCheckType,
  AnalysisRunStatus,
  AnalysisStage,
  DecisionTraceClassification,
  ReviewerEvaluationStatus,
  ReviewerQueueState,
  ReviewPriorityLevel,
  SemanticEvidenceStrength,
  SimilarityLevel,
  SimilaritySemanticStatus,
} from "@teknofest-ai/shared";

// Presentation-only label maps shared by the manager analysis summary and the reviewer workspace.
// They carry no business logic; the truthful wording lives here once so the two surfaces cannot
// drift into describing the same server signal differently.

export const CHECK_TYPE_LABELS = {
  LANGUAGE: "Dil",
  TEMPLATE_STRUCTURE: "Rapor Formatı",
  SECTION_PRESENCE: "Zorunlu Bölümler",
  SECTION_CONTENT: "Bölüm İçeriği",
  CATEGORY_FIT: "Kategori Uyumu",
  SIMILARITY: "Benzerlik",
  RUBRIC_EVALUATION: "AI Rubrik",
} as const satisfies Record<AnalysisCheckType, string>;

/**
 * `FAIL` is never presented as a verdict or a rejection: it is the strongest reviewer-attention
 * signal the analysis can raise, and the final decision stays with the human reviewer.
 */
export const CHECK_STATUS_LABELS = {
  PASS: "Uygun",
  WARN: "İncelenmeli",
  FAIL: "Uygun değil",
} as const satisfies Record<AnalysisCheckStatus, string>;

export function checkStatusClass(status: AnalysisCheckStatus): string {
  if (status === "PASS") return "text-emerald-800";
  if (status === "WARN") return "text-amber-800";
  return "text-red-800";
}

/**
 * Status chip variant for a check status. Returns only the semantic variant class defined in
 * `styles.css`; the caller combines it with `status-chip` and always renders the status WORD inside
 * the chip, so the status is never conveyed by colour alone.
 */
export function checkStatusChipClass(status: AnalysisCheckStatus): string {
  if (status === "PASS") return "status-chip-pass";
  if (status === "WARN") return "status-chip-warn";
  return "status-chip-fail";
}

export const ANALYSIS_RUN_STATUS_LABELS = {
  QUEUED: "Sırada",
  PROCESSING: "Sürüyor",
  SUCCEEDED: "Tamamlandı",
  FAILED: "Tamamlanamadı",
} as const satisfies Record<AnalysisRunStatus, string>;

export function analysisRunStatusChipClass(status: AnalysisRunStatus | null): string {
  if (status === null) return "status-chip-neutral";
  if (status === "SUCCEEDED") return "status-chip-pass";
  if (status === "FAILED") return "status-chip-fail";
  return "status-chip-info";
}

/**
 * Review priority is a qualitative attention level, never a probability, a plagiarism score or a
 * decision. The wording stays "İnceleme Önceliği: Yüksek", and the level is always accompanied by
 * the reason list that produced it.
 */
export const REVIEW_PRIORITY_LEVEL_LABELS = {
  HIGH: "Yüksek",
  MEDIUM: "Orta",
  LOW: "Düşük",
} as const satisfies Record<ReviewPriorityLevel, string>;

export function priorityPillClass(level: ReviewPriorityLevel): string {
  if (level === "HIGH") return "priority-pill-high";
  if (level === "MEDIUM") return "priority-pill-medium";
  return "priority-pill-low";
}

export const EVIDENCE_STRENGTH_LABELS = {
  HIGH: "Yüksek",
  MEDIUM: "Orta",
  LOW: "Düşük",
} as const satisfies Record<SemanticEvidenceStrength, string>;

export const SIMILARITY_LEVEL_LABELS = {
  HIGH: "Yüksek",
  MEDIUM: "Orta",
  LOW: "Düşük",
} as const satisfies Record<SimilarityLevel, string>;

export const SIMILARITY_SEMANTIC_STATUS_LABELS = {
  AVAILABLE: "Yarışma içi benzerlik karşılaştırması yapıldı",
  DEGRADED: "Benzerlik karşılaştırması kısmen yapılabildi",
  DISABLED: "Benzerlik karşılaştırması metin üzerinden yapıldı",
} as const satisfies Record<SimilaritySemanticStatus, string>;

/**
 * User-language analysis progress. Internal stage constants never appear in the UI.
 */
export function analysisProgressLabel(
  status: AnalysisRunStatus | null | undefined,
  stage: AnalysisStage | null | undefined,
): string {
  if (status === "FAILED") return "Analiz tamamlanamadı";
  if (status === "SUCCEEDED") return "Hazır";
  if (status === "QUEUED" || !status) return "PDF alındı";
  if (stage === "INGEST_AND_EXTRACT") return "Metin çıkarılıyor";
  if (stage === "STRUCTURAL_CHECKS") return "Ön kontroller";
  if (stage === "SEMANTIC_CHECKS") return "AI içerik analizi";
  if (stage === "SIMILARITY_CHECKS") return "Benzerlik";
  if (stage === "RUBRIC_EVALUATION") return "AI rubrik önerisi";
  return "Analiz sürüyor";
}

export function reviewerQueueCta(state: ReviewerQueueState): string | null {
  if (state === "ASSIGNED") return "İncelemeye başla";
  if (state === "DRAFT") return "Devam et";
  if (state === "SUBMITTED") return "Değerlendirmeyi görüntüle";
  return null;
}

export const DECISION_TRACE_LABELS = {
  SAME_AS_AI: "AI İLE AYNI",
  DIFFERENT_FROM_AI: "AI'DAN FARKLI",
  NO_AI_SUGGESTION: "AI ÖNERİSİ YOK",
} as const satisfies Record<DecisionTraceClassification, string>;

export const REVIEWER_QUEUE_STATE_LABELS = {
  ANALYSIS_PENDING: "Analiz sürüyor",
  ANALYSIS_UNAVAILABLE: "Analiz hazır değil",
  ASSIGNED: "İncelemeye hazır",
  DRAFT: "Taslak değerlendirme",
  SUBMITTED: "Değerlendirme gönderildi",
} as const satisfies Record<ReviewerQueueState, string>;

export function reviewerQueueStateChipClass(state: ReviewerQueueState): string {
  if (state === "SUBMITTED") return "status-chip-pass";
  if (state === "DRAFT") return "status-chip-info";
  if (state === "ASSIGNED") return "status-chip-neutral";
  return "status-chip-warn";
}

export function evaluationStatusChipClass(status: ReviewerEvaluationStatus | null): string {
  if (status === "SUBMITTED") return "status-chip-pass";
  if (status === "DRAFT") return "status-chip-info";
  return "status-chip-neutral";
}

export const REVIEWER_EVALUATION_STATUS_LABELS = {
  DRAFT: "Taslak",
  SUBMITTED: "Gönderildi",
} as const satisfies Record<ReviewerEvaluationStatus, string>;

export function languageName(identifier: string | null): string {
  if (!identifier) return "Belirlenemedi";
  try {
    return new Intl.DisplayNames(["tr"], { type: "language" }).of(identifier) ?? identifier;
  } catch {
    return identifier;
  }
}
