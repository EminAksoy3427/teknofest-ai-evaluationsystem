import type { ReviewOperationsItem, ReviewPriorityLevel } from "@teknofest-ai/shared";

/**
 * Pure filtering and ordering for the evaluation-operations queue.
 *
 * The server returns a bounded, already-authorized competition-scoped list; narrowing and ordering
 * it is presentation, so it lives here as plain functions rather than as query parameters. Nothing
 * in this module can widen what the server returned: a filter can only ever remove rows the caller
 * was already allowed to see.
 *
 * Every comparator falls back to the application code, so the order is total and stable — the same
 * response always renders in the same sequence.
 */

export const PRIORITY_FILTER_VALUES = ["ALL", "HIGH", "MEDIUM", "LOW"] as const;
export type PriorityFilter = (typeof PRIORITY_FILTER_VALUES)[number];

export const ANALYSIS_FILTER_VALUES = [
  "ALL",
  "SUCCEEDED",
  "IN_PROGRESS",
  "FAILED",
  "MISSING",
] as const;
export type AnalysisFilter = (typeof ANALYSIS_FILTER_VALUES)[number];
export type AnalysisState = Exclude<AnalysisFilter, "ALL">;

export const REVIEWER_FILTER_VALUES = [
  "ALL",
  "UNASSIGNED",
  "NOT_STARTED",
  "IN_REVIEW",
  "SUBMITTED",
] as const;
export type ReviewerFilter = (typeof REVIEWER_FILTER_VALUES)[number];
export type ReviewerState = Exclude<ReviewerFilter, "ALL">;

export const OPERATIONS_SORT_VALUES = [
  "PRIORITY",
  "APPLICATION_CODE",
  "CATEGORY",
  "AI_TOTAL",
  "HUMAN_TOTAL",
  "DISAGREEMENT",
] as const;
export type OperationsSort = (typeof OPERATIONS_SORT_VALUES)[number];

export const ANALYSIS_STATE_LABELS = {
  SUCCEEDED: "Analiz tamamlandı",
  IN_PROGRESS: "Analiz sürüyor",
  FAILED: "Analiz tamamlanamadı",
  MISSING: "Analiz başlatılmadı",
} as const satisfies Record<AnalysisState, string>;

export const REVIEWER_STATE_LABELS = {
  UNASSIGNED: "Hakem atanmamış",
  NOT_STARTED: "Değerlendirme başlamadı",
  IN_REVIEW: "Değerlendirme sürüyor",
  SUBMITTED: "Değerlendirme gönderildi",
} as const satisfies Record<ReviewerState, string>;

export const PRIORITY_FILTER_LABELS = {
  ALL: "Tüm öncelikler",
  HIGH: "Yüksek öncelik",
  MEDIUM: "Orta öncelik",
  LOW: "Düşük öncelik",
} as const satisfies Record<PriorityFilter, string>;

export const OPERATIONS_SORT_LABELS = {
  PRIORITY: "İnceleme önceliği",
  APPLICATION_CODE: "Başvuru kodu",
  CATEGORY: "Kategori",
  AI_TOTAL: "AI önerisi toplamı",
  HUMAN_TOTAL: "Hakem puanı toplamı",
  DISAGREEMENT: "Farklı kriter sayısı",
} as const satisfies Record<OperationsSort, string>;

/** Reports the newest run's state; a submission with no run at all is reported as not started. */
export function analysisStateOf(item: ReviewOperationsItem): AnalysisState {
  const status = item.analysis.latestRunStatus;
  if (status === null) return "MISSING";
  if (status === "FAILED") return "FAILED";
  if (status === "SUCCEEDED") return "SUCCEEDED";
  return "IN_PROGRESS";
}

/**
 * Collapses this submission's reviewers into one operational state. `SUBMITTED` requires EVERY
 * assigned reviewer to have submitted: with two reviewers assigned, one finished evaluation does not
 * mean the submission is done.
 */
export function reviewerStateOf(item: ReviewOperationsItem): ReviewerState {
  if (item.reviewers.length === 0) return "UNASSIGNED";
  if (item.reviewers.every((reviewer) => reviewer.evaluationStatus === "SUBMITTED")) {
    return "SUBMITTED";
  }
  if (item.reviewers.some((reviewer) => reviewer.evaluationStatus !== null)) return "IN_REVIEW";
  return "NOT_STARTED";
}

/**
 * The human total this row sorts by: the first submitted evaluation's total. A draft total is
 * deliberately excluded — an in-progress rubric is not a comparable score.
 */
export function primaryHumanTotal(item: ReviewOperationsItem): number | null {
  const submitted = item.reviewers.find(
    (reviewer) => reviewer.evaluationStatus === "SUBMITTED" && reviewer.humanTotal !== null,
  );
  return submitted?.humanTotal ?? null;
}

export interface OperationsFilters {
  priority: PriorityFilter;
  analysis: AnalysisFilter;
  reviewer: ReviewerFilter;
  /** Category id, or "ALL". */
  category: string;
  /** Free-text match over application code and project title. */
  search: string;
}

export const EMPTY_OPERATIONS_FILTERS: OperationsFilters = {
  priority: "ALL",
  analysis: "ALL",
  reviewer: "ALL",
  category: "ALL",
  search: "",
};

export function filterOperations(
  items: readonly ReviewOperationsItem[],
  filters: OperationsFilters,
): ReviewOperationsItem[] {
  const needle = filters.search.trim().toLocaleLowerCase("tr-TR");
  return items.filter((item) => {
    if (filters.priority !== "ALL" && item.priority.level !== filters.priority) return false;
    if (filters.analysis !== "ALL" && analysisStateOf(item) !== filters.analysis) return false;
    if (filters.reviewer !== "ALL" && reviewerStateOf(item) !== filters.reviewer) return false;
    if (filters.category !== "ALL" && item.category.id !== filters.category) return false;
    if (needle !== "") {
      const haystack = `${item.applicationCode} ${item.projectTitle}`.toLocaleLowerCase("tr-TR");
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });
}

/** Nulls always sort last regardless of direction, so "no value yet" never looks like a low value. */
function compareNullable(left: number | null, right: number | null): number {
  if (left === right) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return right - left;
}

const PRIORITY_ORDER: Record<ReviewPriorityLevel, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

export function sortOperations(
  items: readonly ReviewOperationsItem[],
  sort: OperationsSort,
): ReviewOperationsItem[] {
  const byCode = (left: ReviewOperationsItem, right: ReviewOperationsItem) =>
    left.applicationCode.localeCompare(right.applicationCode, "tr");

  return [...items].sort((left, right) => {
    switch (sort) {
      case "PRIORITY":
        return (
          PRIORITY_ORDER[left.priority.level] - PRIORITY_ORDER[right.priority.level] ||
          // The internal score breaks ties inside a level. It is an ordering key only and is never
          // rendered as a percentage or a probability.
          right.priority.score - left.priority.score ||
          byCode(left, right)
        );
      case "CATEGORY":
        return left.category.name.localeCompare(right.category.name, "tr") || byCode(left, right);
      case "AI_TOTAL":
        return (
          compareNullable(left.aiSuggestedTotal, right.aiSuggestedTotal) || byCode(left, right)
        );
      case "HUMAN_TOTAL":
        return (
          compareNullable(primaryHumanTotal(left), primaryHumanTotal(right)) || byCode(left, right)
        );
      case "DISAGREEMENT":
        return right.disagreementCount - left.disagreementCount || byCode(left, right);
      default:
        return byCode(left, right);
    }
  });
}

/** Distinct categories present in the response, for the category filter. */
export function categoryOptions(
  items: readonly ReviewOperationsItem[],
): { id: string; name: string }[] {
  const options = new Map<string, string>();
  for (const item of items) options.set(item.category.id, item.category.name);
  return [...options.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((left, right) => left.name.localeCompare(right.name, "tr"));
}
