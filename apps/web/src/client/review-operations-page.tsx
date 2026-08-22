import {
  type ReviewOperationsItem,
  ReviewOperationsResponseSchema,
  type ReviewOperationsSummary,
} from "@teknofest-ai/shared";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";

import {
  ANALYSIS_RUN_STATUS_LABELS,
  analysisRunStatusChipClass,
  CHECK_STATUS_LABELS,
  CHECK_TYPE_LABELS,
  checkStatusChipClass,
  evaluationStatusChipClass,
  priorityPillClass,
  REVIEW_PRIORITY_LEVEL_LABELS,
  REVIEWER_EVALUATION_STATUS_LABELS,
  SIMILARITY_LEVEL_LABELS,
} from "./analysis-labels";
import { apiRequest, errorMessage } from "./api";
import { Breadcrumb } from "./competition-nav";
import {
  ANALYSIS_FILTER_VALUES,
  ANALYSIS_STATE_LABELS,
  type AnalysisFilter,
  analysisStateOf,
  categoryOptions,
  EMPTY_OPERATIONS_FILTERS,
  filterOperations,
  OPERATIONS_SORT_LABELS,
  OPERATIONS_SORT_VALUES,
  type OperationsFilters,
  type OperationsSort,
  PRIORITY_FILTER_LABELS,
  PRIORITY_FILTER_VALUES,
  type PriorityFilter,
  primaryHumanTotal,
  REVIEWER_FILTER_VALUES,
  REVIEWER_STATE_LABELS,
  type ReviewerFilter,
  reviewerStateOf,
  sortOperations,
} from "./review-operations-view";
import { Alert, EmptyState, MetricCard, PageHeader } from "./ui";

function totalCell(score: number | null, maximum: number | null): string {
  if (score === null || maximum === null) return "—";
  return `${score} / ${maximum}`;
}

/**
 * The review-priority cell: the qualitative level plus every reason that produced it.
 *
 * The level is always accompanied by its reasons, and the internal ordering score is never shown as
 * a percentage, a gauge or a probability. A HIGH level means "bir insan buna önce bakmalı", never a
 * rejection, a disqualification or a plagiarism finding.
 */
export function PriorityCell({ item }: { item: ReviewOperationsItem }) {
  return (
    <div className="min-w-56">
      <span className={`priority-pill ${priorityPillClass(item.priority.level)}`}>
        İnceleme Önceliği: {REVIEW_PRIORITY_LEVEL_LABELS[item.priority.level]}
      </span>
      {item.priority.reasons.length === 0 ? (
        <p className="mt-1.5 text-xs leading-5 text-ink-subtle">
          Dikkat gerektiren bir sinyal kaydedilmedi.
        </p>
      ) : (
        <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-xs leading-5 text-ink-muted">
          {item.priority.reasons.map((reason) => (
            <li key={reason.code}>{reason.label}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AnalysisCell({ item }: { item: ReviewOperationsItem }) {
  const state = analysisStateOf(item);
  const status = item.analysis.latestRunStatus;
  const warnOrFail = item.analysis.checks.filter((check) => check.status !== "PASS");

  return (
    <div className="min-w-48">
      <span className={`status-chip ${analysisRunStatusChipClass(status)}`}>
        {status === null ? "Analiz başlatılmadı" : ANALYSIS_RUN_STATUS_LABELS[status]}
      </span>
      <p className="mt-1.5 text-xs leading-5 text-ink-subtle">{ANALYSIS_STATE_LABELS[state]}</p>
      {state === "FAILED" ? (
        <p className="mt-1 text-xs leading-5 text-critical">
          Sinyaller son başarılı koşudan okunur; yeni koşu tamamlanamadı.
        </p>
      ) : null}
      {warnOrFail.length > 0 ? (
        <ul className="mt-1.5 flex flex-wrap gap-1">
          {warnOrFail.map((check) => (
            <li key={check.type}>
              <span className={`status-chip ${checkStatusChipClass(check.status)}`}>
                {CHECK_TYPE_LABELS[check.type]}: {CHECK_STATUS_LABELS[check.status]}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {item.analysis.similarityLevel !== null && item.analysis.similarityLevel !== "LOW" ? (
        <p className="mt-1.5 text-xs leading-5 text-warning-ink">
          {SIMILARITY_LEVEL_LABELS[item.analysis.similarityLevel]} benzerlik sinyali ·{" "}
          {item.analysis.similarityObservationCount} gözlem · uzman incelemesi önerilir
        </p>
      ) : null}
      {item.analysis.exactDocumentMatch ? (
        <p className="mt-1 text-xs leading-5 text-warning-ink">
          Birebir belge eşleşmesi · inceleme sinyalidir
        </p>
      ) : null}
    </div>
  );
}

function ReviewerCell({ item }: { item: ReviewOperationsItem }) {
  if (item.reviewers.length === 0) {
    return (
      <div className="min-w-48">
        <span className="status-chip status-chip-warn">Hakem atanmamış</span>
        <p className="mt-1.5 text-xs leading-5 text-ink-subtle">
          Hakem ataması yapılana kadar bu başvuru değerlendirilemez.
        </p>
      </div>
    );
  }
  return (
    <div className="min-w-52">
      <p className="pane-note">{REVIEWER_STATE_LABELS[reviewerStateOf(item)]}</p>
      <ul className="mt-1.5 space-y-2">
        {item.reviewers.map((reviewer) => (
          <li key={reviewer.assignmentId}>
            <p className="text-sm font-medium text-ink">{reviewer.name}</p>
            <span
              className={`status-chip mt-1 ${evaluationStatusChipClass(reviewer.evaluationStatus)}`}
            >
              {reviewer.evaluationStatus === null
                ? "Başlamadı"
                : REVIEWER_EVALUATION_STATUS_LABELS[reviewer.evaluationStatus]}
            </span>
            {reviewer.evaluationStatus === "SUBMITTED" ? (
              <p className="mt-1 text-xs text-ink-muted">
                Hakem puanı: {totalCell(reviewer.humanTotal, reviewer.humanMaxTotal)}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function OperationsRow({ item }: { item: ReviewOperationsItem }) {
  return (
    <tr>
      <td>
        <p className="font-mono text-xs font-semibold text-brand">{item.applicationCode}</p>
        <p className="mt-1 min-w-40 font-semibold text-ink">{item.projectTitle}</p>
      </td>
      <td>
        <p className="font-medium text-ink">{item.category.name}</p>
      </td>
      <td>
        <PriorityCell item={item} />
      </td>
      <td>
        <AnalysisCell item={item} />
      </td>
      <td>
        <ReviewerCell item={item} />
      </td>
      <td className="font-semibold whitespace-nowrap text-brand-deep">
        {totalCell(item.aiSuggestedTotal, item.aiMaxTotal)}
        <span className="mt-1 block text-xs font-normal text-ink-subtle">AI önerisi</span>
      </td>
      <td className="font-semibold whitespace-nowrap text-ink">
        {totalCell(primaryHumanTotal(item), item.reviewers[0]?.humanMaxTotal ?? null)}
        <span className="mt-1 block text-xs font-normal text-ink-subtle">Hakem kararı</span>
      </td>
    </tr>
  );
}

export function OperationsTable({ items }: { items: readonly ReviewOperationsItem[] }) {
  return (
    <div className="table-scroll">
      <table className="data-table min-w-[76rem]">
        <caption className="sr-only">
          Yarışma başvurularının analiz durumu, inceleme önceliği ve hakem değerlendirme durumu
        </caption>
        <thead>
          <tr>
            <th scope="col">Proje</th>
            <th scope="col">Kategori</th>
            <th scope="col">İnceleme Önceliği</th>
            <th scope="col">Analiz</th>
            <th scope="col">Hakem</th>
            <th scope="col">AI önerisi</th>
            <th scope="col">Hakem kararı</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <OperationsRow item={item} key={item.submissionId} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OperationsMetrics({
  items,
  summary,
}: {
  items: readonly ReviewOperationsItem[];
  summary: ReviewOperationsSummary;
}) {
  const unassigned = items.filter((item) => item.reviewers.length === 0).length;
  const submitted = items.filter((item) =>
    item.reviewers.some((reviewer) => reviewer.evaluationStatus === "SUBMITTED"),
  ).length;
  return (
    <div className="metrics-strip mt-6 sm:grid-cols-4">
      <MetricCard label="Başvurular" value={String(items.length)} />
      <MetricCard
        label="Yüksek öncelik"
        tone={summary.high > 0 ? "warn" : "neutral"}
        value={String(summary.high)}
      />
      <MetricCard
        label="Hakem atanmamış"
        tone={unassigned > 0 ? "warn" : "neutral"}
        value={String(unassigned)}
      />
      <MetricCard
        hint={`${items.length} başvurunun ${submitted} tanesi`}
        label="Değerlendirmesi gönderilen"
        value={String(submitted)}
      />
    </div>
  );
}

/**
 * Evaluation operations for COMPETITION_MANAGER and EVALUATION_MANAGER.
 *
 * The whole page is a read of already persisted records: opening it, filtering it and sorting it
 * never triggers a model call, an embedding request or a vector query. The review priority shown per
 * row is derived server-side from those same records and arrives with the reasons that produced it.
 */
export function ReviewOperationsPage() {
  const { competitionId } = useParams();
  const [items, setItems] = useState<ReviewOperationsItem[] | null>(null);
  const [summary, setSummary] = useState<ReviewOperationsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<OperationsFilters>(EMPTY_OPERATIONS_FILTERS);
  const [sort, setSort] = useState<OperationsSort>("PRIORITY");

  useEffect(() => {
    if (!competitionId) return;
    let active = true;
    setItems(null);
    setError(null);
    apiRequest(
      `/api/v1/competitions/${competitionId}/review-operations`,
      ReviewOperationsResponseSchema,
    )
      .then((response) => {
        if (!active) return;
        setItems(response.items);
        setSummary(response.summary);
      })
      .catch((caught) => {
        if (active) setError(errorMessage(caught));
      });
    return () => {
      active = false;
    };
  }, [competitionId]);

  const categories = useMemo(() => categoryOptions(items ?? []), [items]);
  const visible = useMemo(
    () => sortOperations(filterOperations(items ?? [], filters), sort),
    [items, filters, sort],
  );
  const isFiltered = JSON.stringify(filters) !== JSON.stringify(EMPTY_OPERATIONS_FILTERS);

  if (!competitionId) {
    return <div className="mx-auto max-w-4xl">Yarışma kimliği bulunamadı.</div>;
  }

  return (
    <div className="layout-wide">
      <Breadcrumb trail={[{ label: "Genel Bakış", to: "/app" }, { label: "Değerlendirme" }]} />
      <div className="mt-4">
        <PageHeader
          lead="Hangi başvuruya önce bakılacağını görünür gerekçelerle sıralar. Öncelik bir karar veya olasılık değildir."
          title="Değerlendirme"
        />
      </div>

      {error ? (
        <div className="mt-6">
          <Alert tone="error">{error}</Alert>
        </div>
      ) : null}

      {items === null && error === null ? (
        <p className="mt-6 text-sm text-ink-muted" role="status">
          Değerlendirme kuyruğu yükleniyor…
        </p>
      ) : null}

      {summary && items && items.length > 0 ? (
        <OperationsMetrics items={items} summary={summary} />
      ) : null}

      {items !== null && items.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            description="Başvuru yüklendiğinde inceleme önceliği burada oluşur."
            title="Henüz başvuru yok"
          />
        </div>
      ) : null}

      {items !== null && items.length > 0 ? (
        <section aria-labelledby="operations-queue-title" className="mt-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="section-title" id="operations-queue-title">
              Başvuru kuyruğu
            </h2>
            <p className="text-sm text-ink-muted" role="status">
              {visible.length} / {items.length} başvuru
            </p>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <div>
              <label className="field-label" htmlFor="operations-filter-priority">
                İnceleme önceliği
              </label>
              <select
                className="field-input"
                id="operations-filter-priority"
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    priority: event.target.value as PriorityFilter,
                  }))
                }
                value={filters.priority}
              >
                {PRIORITY_FILTER_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {PRIORITY_FILTER_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="operations-filter-analysis">
                Analiz durumu
              </label>
              <select
                className="field-input"
                id="operations-filter-analysis"
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    analysis: event.target.value as AnalysisFilter,
                  }))
                }
                value={filters.analysis}
              >
                {ANALYSIS_FILTER_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {value === "ALL" ? "Tüm analiz durumları" : ANALYSIS_STATE_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="operations-filter-reviewer">
                Hakem durumu
              </label>
              <select
                className="field-input"
                id="operations-filter-reviewer"
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    reviewer: event.target.value as ReviewerFilter,
                  }))
                }
                value={filters.reviewer}
              >
                {REVIEWER_FILTER_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {value === "ALL" ? "Tüm hakem durumları" : REVIEWER_STATE_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="operations-filter-category">
                Kategori
              </label>
              <select
                className="field-input"
                id="operations-filter-category"
                onChange={(event) =>
                  setFilters((current) => ({ ...current, category: event.target.value }))
                }
                value={filters.category}
              >
                <option value="ALL">Tüm kategoriler</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="operations-sort">
                Sıralama
              </label>
              <select
                className="field-input"
                id="operations-sort"
                onChange={(event) => setSort(event.target.value as OperationsSort)}
                value={sort}
              >
                {OPERATIONS_SORT_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {OPERATIONS_SORT_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2 xl:col-span-3">
              <label className="field-label" htmlFor="operations-search">
                Başvuru kodu veya proje başlığı
              </label>
              <input
                className="field-input"
                id="operations-search"
                onChange={(event) =>
                  setFilters((current) => ({ ...current, search: event.target.value }))
                }
                type="search"
                value={filters.search}
              />
            </div>
            {isFiltered ? (
              <div className="flex items-end">
                <button
                  className="secondary-button"
                  onClick={() => setFilters(EMPTY_OPERATIONS_FILTERS)}
                  type="button"
                >
                  Filtreleri temizle
                </button>
              </div>
            ) : null}
          </div>

          {visible.length === 0 ? (
            <div className="empty-state mt-5">
              Seçtiğiniz filtrelere uyan başvuru yok. Filtreleri temizleyerek tüm kuyruğa
              dönebilirsiniz.
            </div>
          ) : (
            <div className="mt-5">
              <OperationsTable items={visible} />
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
