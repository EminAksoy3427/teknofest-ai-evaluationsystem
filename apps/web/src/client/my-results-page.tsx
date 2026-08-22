import {
  type ContestantOwnedSubmission,
  ContestantOwnedSubmissionListResponseSchema,
  type PublishedContestantFeedbackResponse,
  PublishedContestantFeedbackResponseSchema,
} from "@teknofest-ai/shared";
import { useEffect, useState } from "react";

import { apiRequest, errorMessage } from "./api";

/**
 * The contestant's own results. Only submissions this session user participates in are ever
 * listed, and only PUBLISHED feedback is ever shown — a draft's existence is not revealed. There is
 * deliberately no numeric final score here: the product policy is qualitative feedback, not a
 * published score.
 */
function FeedbackPoints({ points, title }: { points: readonly string[]; title: string }) {
  return (
    <div className="mt-4">
      <h4 className="text-sm font-semibold text-slate-950">{title}</h4>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-slate-700">
        {points.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
    </div>
  );
}

function PublishedResult({ feedback }: { feedback: PublishedContestantFeedbackResponse }) {
  return (
    <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/40 p-5">
      <p className="text-xs font-bold tracking-[0.16em] text-emerald-800 uppercase">
        Değerlendirme Sonucu
      </p>
      <p className="mt-2 text-sm text-slate-600">
        Yayım tarihi:{" "}
        {new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium" }).format(feedback.publishedAt)}
      </p>
      <p className="mt-3 leading-6 text-slate-800">{feedback.summary}</p>
      <FeedbackPoints points={feedback.strengths} title="Güçlü yönler" />
      <FeedbackPoints points={feedback.improvements} title="Gelişim alanları" />
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
        // A 404 here (result withdrawn between list and detail load) is reported the same way as
        // "not published yet" — never a different message that would reveal internal state.
        setNotPublished(true);
        setError(errorMessage(caught));
      });
    return () => {
      active = false;
    };
  }, [submission.feedbackPublished, submission.submissionId]);

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold tracking-[0.16em] text-slate-500 uppercase">
        {submission.applicationCode} · {submission.categoryName}
      </p>
      <h3 className="mt-1 text-lg font-semibold text-slate-950">{submission.projectTitle}</h3>
      {feedback ? (
        <PublishedResult feedback={feedback} />
      ) : notPublished ? (
        <p className="mt-4 empty-state">Değerlendirme sonucu henüz yayımlanmadı.</p>
      ) : (
        <p className="mt-4 text-sm text-slate-600" role="status">
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
    <main className="mx-auto w-full max-w-4xl px-5 py-8 sm:px-8 sm:py-12">
      <div className="max-w-3xl">
        <p className="eyebrow">Yarışmacı</p>
        <h1 className="page-title">Sonuçlarım</h1>
        <p className="page-lead">
          Yalnız katıldığınız başvurular ve yöneticinin yayımladığı değerlendirme sonuçları burada
          gösterilir. Yapay zekâ önerileri ve hakem iç notları bu sayfada paylaşılmaz.
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

      {submissions === null && !error ? (
        <p className="mt-8 text-sm text-slate-600" role="status">
          Başvurularınız yükleniyor…
        </p>
      ) : null}

      {submissions?.length === 0 ? (
        <div className="mt-8 empty-state">
          Hiçbir başvuruya katılımcı olarak eklenmediniz. Eklendiğinizde başvurunuz burada
          görünecektir.
        </div>
      ) : null}

      {submissions && submissions.length > 0 ? (
        <div className="mt-8 grid gap-4">
          {submissions.map((submission) => (
            <SubmissionResultCard key={submission.submissionId} submission={submission} />
          ))}
        </div>
      ) : null}
    </main>
  );
}
