import {
  type ReviewOperationsItem,
  ReviewOperationsResponseSchema,
  type ReviewOperationsSummary,
} from "@teknofest-ai/shared";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";

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
import { Breadcrumb, ManagerStepNav } from "./competition-nav";
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
        <p className="mt-1.5 text-xs leading-5 text-slate-500">
          Dikkat gerektiren bir sinyal kaydedilmedi.
        </p>
      ) : (
        <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-xs leading-5 text-slate-600">
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
      <p className="mt-1.5 text-xs leading-5 text-slate-500">{ANALYSIS_STATE_LABELS[state]}</p>
      {state === "FAILED" ? (
        <p className="mt-1 text-xs leading-5 text-red-800">
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
        <p className="mt-1.5 text-xs leading-5 text-amber-900">
          {SIMILARITY_LEVEL_LABELS[item.analysis.similarityLevel]} benzerlik sinyali ·{" "}
          {item.analysis.similarityObservationCount} gözlem · uzman incelemesi önerilir
        </p>
      ) : null}
      {item.analysis.exactDocumentMatch ? (
        <p className="mt-1 text-xs leading-5 text-amber-900">
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
        <p className="mt-1.5 text-xs leading-5 text-slate-500">
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
            <p className="text-sm font-medium text-slate-900">{reviewer.name}</p>
            <p className="text-xs text-slate-500">{reviewer.email}</p>
            <span
              className={`status-chip mt-1 ${evaluationStatusChipClass(reviewer.evaluationStatus)}`}
            >
              {reviewer.evaluationStatus === null
                ? "Başlamadı"
                : REVIEWER_EVALUATION_STATUS_LABELS[reviewer.evaluationStatus]}
            </span>
            {reviewer.evaluationStatus === "SUBMITTED" ? (
              <p className="mt-1 text-xs text-slate-600">
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
        <p className="font-mono text-xs font-semibold text-blue-800">{item.applicationCode}</p>
        <p className="mt-1 min-w-40 font-semibold text-slate-950">{item.projectTitle}</p>
      </td>
      <td>
        <p className="font-medium text-slate-800">{item.category.name}</p>
        <p className="mt-1 font-mono text-xs text-slate-500">{item.category.code}</p>
      </td>
      <td>
        <AnalysisCell item={item} />
      </td>
      <td>
        <PriorityCell item={item} />
      </td>
      <td>
        <ReviewerCell item={item} />
      </td>
      <td className="font-semibold whitespace-nowrap text-blue-900">
        {totalCell(item.aiSuggestedTotal, item.aiMaxTotal)}
        <span className="mt-1 block text-xs font-normal text-slate-500">AI önerisi</span>
      </td>
      <td className="font-semibold whitespace-nowrap text-slate-950">
        {totalCell(primaryHumanTotal(item), item.reviewers[0]?.humanMaxTotal ?? null)}
        <span className="mt-1 block text-xs font-normal text-slate-500">Hakem kararı</span>
      </td>
      <td className="whitespace-nowrap text-slate-800">{item.disagreementCount}</td>
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
            <th scope="col">Başvuru</th>
            <th scope="col">Kategori</th>
            <th scope="col">Analiz</th>
            <th scope="col">İnceleme Önceliği</th>
            <th scope="col">Hakem(ler)</th>
            <th scope="col">AI önerisi</th>
            <th scope="col">Hakem puanı</th>
            <th scope="col">Farklı kriter</th>
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

function SummaryChips({ summary }: { summary: ReviewOperationsSummary }) {
  return (
    <dl className="mt-5 flex flex-wrap gap-2">
      {(
        [
          ["HIGH", summary.high],
          ["MEDIUM", summary.medium],
          ["LOW", summary.low],
        ] as const
      ).map(([level, count]) => (
        <div className={`priority-pill ${priorityPillClass(level)}`} key={level}>
          <dt>{REVIEW_PRIORITY_LEVEL_LABELS[level]} öncelik</dt>
          <dd className="font-black">{count}</dd>
        </div>
      ))}
    </dl>
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
    return <main className="mx-auto max-w-4xl p-8">Yarışma kimliği bulunamadı.</main>;
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-8 sm:py-10">
      <Breadcrumb
        trail={[
          { label: "Yarışmalar", to: "/app" },
          { label: "Başvurular", to: `/app/competitions/${competitionId}/submissions` },
          { label: "Değerlendirme Operasyonu" },
        ]}
      />
      <div className="mt-4 max-w-3xl">
        <p className="eyebrow">Değerlendirme operasyonu</p>
        <h1 className="page-title">İnceleme önceliği kuyruğu</h1>
        <p className="page-lead">
          Sıralama, daha önce kaydedilmiş analiz ve hakem kayıtlarından türetilir; bu sayfa yeni bir
          yapay zekâ çağrısı yapmaz. İnceleme önceliği bir olasılık, puan veya nihai karar değildir:
          yalnız bir insanın hangi başvuruya önce bakması gerektiğini söyler ve her düzey görünür
          gerekçelerle açıklanır.
        </p>
      </div>
      <ManagerStepNav competitionId={competitionId} current="operations" />

      {error ? (
        <div
          className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      {items === null && error === null ? (
        <p className="mt-6 text-sm text-slate-600" role="status">
          Değerlendirme operasyonu yükleniyor…
        </p>
      ) : null}

      {summary && items && items.length > 0 ? <SummaryChips summary={summary} /> : null}

      {items !== null && items.length === 0 ? (
        <div className="empty-state mt-6">
          Bu yarışmada henüz başvuru yok. Başvuru yükleyip analiz başlattığınızda inceleme önceliği
          kuyruğu burada oluşur.
        </div>
      ) : null}

      {items !== null && items.length > 0 ? (
        <section aria-labelledby="operations-queue-title" className="surface-panel mt-6 p-5 sm:p-7">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Yarışma kapsamı</p>
              <h2 className="section-title" id="operations-queue-title">
                Başvuru kuyruğu
              </h2>
            </div>
            <p className="text-sm text-slate-600" role="status">
              {visible.length} / {items.length} başvuru gösteriliyor
            </p>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
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

          <p className="mt-4 text-xs leading-5 text-slate-500">
            AI önerisi ile hakem kararı ayrı sütunlardır ve tek bir puana birleştirilmez. Kriter
            farkı hakem hatası değildir; hakemin kendi okumasına dayanan meşru bir yargıdır.
            Benzerlik ve birebir eşleşme birer inceleme sinyalidir; intihal tespiti, diskalifiye
            veya nihai yarışma kararı değildir. Nihai karar daima insana aittir.
          </p>
        </section>
      ) : null}

      <div className="mt-8 flex flex-wrap gap-2">
        <Link className="secondary-button" to={`/app/competitions/${competitionId}/reviewers`}>
          Hakem atamalarına git
        </Link>
        <Link className="secondary-button" to={`/app/competitions/${competitionId}/submissions`}>
          Başvurulara git
        </Link>
      </div>
    </main>
  );
}
