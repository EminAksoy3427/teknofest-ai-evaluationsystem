import {
  MembershipListResponseSchema,
  type MembershipSummary,
  type ReviewerQueueItem,
  ReviewerQueueResponseSchema,
} from "@teknofest-ai/shared";
import { useEffect, useState } from "react";
import { Link } from "react-router";

import { REVIEWER_QUEUE_STATE_LABELS } from "./analysis-labels";
import { apiRequest, errorMessage } from "./api";

interface QueueEntry extends ReviewerQueueItem {
  competitionName: string;
}

function stateBadgeClass(state: ReviewerQueueItem["state"]): string {
  if (state === "SUBMITTED") return "border-emerald-300 bg-emerald-50 text-emerald-900";
  if (state === "DRAFT") return "border-blue-300 bg-blue-50 text-blue-900";
  if (state === "ASSIGNED") return "border-slate-300 bg-slate-50 text-slate-800";
  return "border-amber-300 bg-amber-50 text-amber-900";
}

function QueueCard({ entry }: { entry: QueueEntry }) {
  const openable = entry.state !== "ANALYSIS_PENDING" && entry.state !== "ANALYSIS_UNAVAILABLE";

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-[0.16em] text-slate-500 uppercase">
            {entry.competitionName} · {entry.submission.applicationCode}
          </p>
          <h3 className="mt-1 text-lg font-semibold text-slate-950">
            {entry.submission.projectTitle}
          </h3>
          <p className="mt-0.5 text-sm text-slate-600">{entry.submission.category.name}</p>
        </div>
        {/* The state is spelled out in text, not conveyed by colour alone. */}
        <span
          className={`rounded-full border px-3 py-1 text-xs font-bold ${stateBadgeClass(entry.state)}`}
        >
          {REVIEWER_QUEUE_STATE_LABELS[entry.state]}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {openable ? (
          <Link
            className="primary-button"
            to={`/app/review/${entry.competitionId}/${entry.assignmentId}`}
          >
            {entry.state === "SUBMITTED" ? "Değerlendirmemi görüntüle" : "Çalışma alanını aç"}
          </Link>
        ) : (
          <p className="text-sm leading-6 text-slate-600">
            {entry.state === "ANALYSIS_PENDING"
              ? "Belge analizi sürüyor. Analiz tamamlandığında çalışma alanı açılabilir."
              : "Bu başvuru için tamamlanmış bir analiz çalışması yok. Yarışma yöneticisiyle iletişime geçin."}
          </p>
        )}
      </div>
    </article>
  );
}

/**
 * The reviewer's own queue, aggregated across every competition in which they hold the REVIEWER
 * role. Each competition is queried through its own competition-scoped endpoint, and that endpoint
 * returns only the assignments explicitly granted to the session user — another reviewer's work is
 * never part of the response.
 */
export function ReviewQueuePage() {
  const [entries, setEntries] = useState<QueueEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewerMemberships, setReviewerMemberships] = useState<MembershipSummary[] | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      const memberships = await apiRequest("/api/v1/me/memberships", MembershipListResponseSchema);
      const reviewerIn = memberships.memberships.filter(
        (membership) => membership.role === "REVIEWER",
      );
      if (active) setReviewerMemberships(reviewerIn);

      const queues = await Promise.all(
        reviewerIn.map(async (membership) => {
          const queue = await apiRequest(
            `/api/v1/competitions/${membership.competitionId}/review/assignments`,
            ReviewerQueueResponseSchema,
          );
          return queue.assignments.map((assignment) => ({
            ...assignment,
            competitionName: membership.competitionName,
          }));
        }),
      );
      if (active) setEntries(queues.flat());
    }

    load().catch((caught) => {
      if (active) setError(errorMessage(caught));
    });

    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8 sm:py-12">
      <div className="max-w-3xl">
        <p className="eyebrow">Hakem kuyruğu</p>
        <h1 className="page-title">Değerlendirmeleriniz</h1>
        <p className="page-lead">
          Yalnız size açıkça atanmış başvurular listelenir. Hakem rolü tek başına başvuru erişimi
          vermez; erişim atama üzerinden sunucuda doğrulanır.
        </p>
      </div>

      {error ? (
        <div
          className="mt-8 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      {entries === null && error === null ? (
        <p className="mt-8 text-sm text-slate-600" role="status">
          Atamalarınız yükleniyor…
        </p>
      ) : null}

      {reviewerMemberships?.length === 0 ? (
        <div className="mt-8 empty-state">
          Hiçbir yarışmada hakem rolünüz yok. Hakem rolü ve başvuru ataması yarışma yöneticisi veya
          değerlendirme yöneticisi tarafından verilir.
        </div>
      ) : null}

      {entries !== null && entries.length === 0 && reviewerMemberships?.length !== 0 ? (
        <div className="mt-8 empty-state">
          Size henüz bir başvuru atanmadı. Atama yapıldığında bu liste dolacak.
        </div>
      ) : null}

      {entries !== null && entries.length > 0 ? (
        <div className="mt-8 grid gap-4">
          {entries.map((entry) => (
            <QueueCard entry={entry} key={entry.assignmentId} />
          ))}
        </div>
      ) : null}
    </main>
  );
}
