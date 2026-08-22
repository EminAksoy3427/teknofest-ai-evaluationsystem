import {
  MembershipListResponseSchema,
  type MembershipSummary,
  type ReviewerQueueItem,
  ReviewerQueueResponseSchema,
} from "@teknofest-ai/shared";
import { useEffect, useState } from "react";
import { Link } from "react-router";

import {
  REVIEWER_QUEUE_STATE_LABELS,
  reviewerQueueCta,
  reviewerQueueStateChipClass,
} from "./analysis-labels";
import { apiRequest, errorMessage } from "./api";
import { Alert, EmptyState, PageHeader } from "./ui";

interface QueueEntry extends ReviewerQueueItem {
  competitionName: string;
}

export function QueueCard({ entry }: { entry: QueueEntry }) {
  const cta = reviewerQueueCta(entry.state);

  return (
    <article className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-ink-subtle">
          {entry.competitionName} · {entry.submission.applicationCode}
        </p>
        <h3 className="mt-0.5 truncate text-sm font-bold text-ink">
          {entry.submission.projectTitle}
        </h3>
        <p className="mt-0.5 text-xs text-ink-muted">{entry.submission.category.name}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`status-chip ${reviewerQueueStateChipClass(entry.state)}`}>
          {REVIEWER_QUEUE_STATE_LABELS[entry.state]}
        </span>
        {cta ? (
          <Link
            className="primary-button"
            to={`/app/review/${entry.competitionId}/${entry.assignmentId}`}
          >
            {cta}
          </Link>
        ) : (
          <p className="max-w-72 text-xs leading-5 text-ink-muted">
            {entry.state === "ANALYSIS_PENDING"
              ? "Analiz sürüyor. Tamamlandığında incelemeye başlayabilirsiniz."
              : "Bu başvuru için tamamlanmış bir analiz yok. Yarışma yöneticisiyle iletişime geçin."}
          </p>
        )}
      </div>
    </article>
  );
}

/**
 * The reviewer's own queue, aggregated across every competition in which they hold the REVIEWER
 * role. Each competition is queried through its own competition-scoped endpoint, and that endpoint
 * returns only the assignments explicitly granted to the session user.
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
    <div className="layout-dashboard">
      <PageHeader
        lead={
          entries && entries.length > 0
            ? `${entries.filter((entry) => entry.state === "ASSIGNED").length} bekleyen · ${entries.filter((entry) => entry.state === "DRAFT").length} taslak · ${entries.filter((entry) => entry.state === "SUBMITTED").length} tamamlanan`
            : "Yalnız size atanan başvurular burada görünür."
        }
        title="Atamalarım"
      />

      {error ? (
        <div className="mt-6">
          <Alert tone="error">{error}</Alert>
        </div>
      ) : null}

      {entries === null && error === null ? (
        <p className="mt-6 text-sm text-ink-muted" role="status">
          Atamalarınız yükleniyor…
        </p>
      ) : null}

      {reviewerMemberships?.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            description="Hakem rolü ve başvuru ataması yarışma yöneticisi veya değerlendirme yöneticisi tarafından verilir. Atama yapıldığında bu liste dolacak."
            title="Hiçbir yarışmada hakem rolünüz yok"
          />
        </div>
      ) : null}

      {entries !== null && entries.length === 0 && reviewerMemberships?.length !== 0 ? (
        <div className="mt-6">
          <EmptyState
            description="Yarışma yöneticisi veya değerlendirme yöneticisi size bir başvuru atadığında burada görünecek."
            title="Size henüz bir başvuru atanmadı"
          />
        </div>
      ) : null}

      {entries !== null && entries.length > 0 ? (
        <ul className="surface-panel mt-6 divide-y divide-line">
          {entries.map((entry) => (
            <li key={entry.assignmentId}>
              <QueueCard entry={entry} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
