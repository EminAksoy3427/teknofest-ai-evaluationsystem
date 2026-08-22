import {
  type ContestantOwnedSubmission,
  ContestantOwnedSubmissionListResponseSchema,
  type PublishedContestantFeedbackResponse,
  PublishedContestantFeedbackResponseSchema,
} from "@teknofest-ai/shared";
import { useEffect, useState } from "react";

import { apiRequest, errorMessage } from "./api";
import { Alert, EmptyState, PageHeader } from "./ui";

/**
 * The contestant's own results. Only submissions this session user participates in are ever
 * listed, and only PUBLISHED feedback is ever shown. There is deliberately no numeric final score.
 */
function FeedbackPoints({ points, title }: { points: readonly string[]; title: string }) {
  return (
    <div className="mt-4">
      <h4 className="text-[15px] font-semibold text-ink">{title}</h4>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-ink-muted">
        {points.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
    </div>
  );
}

function PublishedResult({ feedback }: { feedback: PublishedContestantFeedbackResponse }) {
  return (
    <div className="mt-5">
      <p className="text-[13px] font-medium text-ink-subtle">Değerlendirme sonucu</p>
      <p className="mt-1 text-xs text-ink-subtle">
        Yayım tarihi:{" "}
        {new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium" }).format(feedback.publishedAt)}
      </p>
      <p className="mt-4 text-[15px] leading-7 text-ink">{feedback.summary}</p>
      <FeedbackPoints points={feedback.strengths} title="Güçlü Yönler" />
      <FeedbackPoints points={feedback.improvements} title="Gelişime Açık Alanlar" />
      <FeedbackPoints points={feedback.recommendations} title="Öneriler" />
    </div>
  );
}

function SubmissionResultCard({ submission }: { submission: ContestantOwnedSubmission }) {
  const [feedback, setFeedback] = useState<PublishedContestantFeedbackResponse | null>(null);
  const [notPublished, setNotPublished] = useState(!submission.feedbackPublished);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!submission.feedbackPublished) {
      setNotPublished(true);
      return;
    }
    let active = true;
    apiRequest(
      `/api/v1/me/submissions/${submission.submissionId}/feedback`,
      PublishedContestantFeedbackResponseSchema,
    )
      .then((response) => {
        if (active) setFeedback(response);
      })
      .catch((caught) => {
        if (!active) return;
        setNotPublished(true);
        setError(errorMessage(caught));
      });
    return () => {
      active = false;
    };
  }, [submission.feedbackPublished, submission.submissionId]);

  return (
    <article className="px-4 py-4">
      <p className="text-xs font-semibold text-ink-subtle">
        {submission.applicationCode} · {submission.categoryName}
      </p>
      <h3 className="mt-0.5 text-base font-bold text-ink">{submission.projectTitle}</h3>
      {feedback ? (
        <PublishedResult feedback={feedback} />
      ) : notPublished ? (
        <p className="mt-3 text-sm leading-6 text-ink-muted">
          Değerlendirme sonucu henüz yayımlanmadı.
        </p>
      ) : (
        <p className="mt-3 text-sm text-ink-muted" role="status">
          Yükleniyor…
        </p>
      )}
      {error ? <p className="sr-only">{error}</p> : null}
    </article>
  );
}

export function MyResultsPage() {
  const [submissions, setSubmissions] = useState<ContestantOwnedSubmission[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiRequest("/api/v1/me/submissions", ContestantOwnedSubmissionListResponseSchema)
      .then((response) => {
        if (active) setSubmissions(response.submissions);
      })
      .catch((caught) => {
        if (active) setError(errorMessage(caught));
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="layout-report">
      <PageHeader
        lead="Katıldığınız başvuruların yayımlanmış değerlendirme sonuçları."
        title="Sonuçlarım"
      />

      {error ? (
        <div className="mt-6">
          <Alert tone="error">{error}</Alert>
        </div>
      ) : null}

      {submissions === null && !error ? (
        <p className="mt-6 text-sm text-ink-muted" role="status">
          Başvurularınız yükleniyor…
        </p>
      ) : null}

      {submissions?.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            description="Yarışma yöneticisi sizi bir başvuruya eklediğinde burada görünecek."
            title="Henüz katıldığınız bir başvuru yok"
          />
        </div>
      ) : null}

      {submissions && submissions.length > 0 ? (
        <ul className="surface-panel mt-6 divide-y divide-line">
          {submissions.map((submission) => (
            <li key={submission.submissionId}>
              <SubmissionResultCard submission={submission} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
