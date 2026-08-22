import {
  type EligibleReviewer,
  EligibleReviewerListResponseSchema,
  type ReviewerAssignmentOperation,
  ReviewerAssignmentOperationListResponseSchema,
  ReviewerAssignmentResponseSchema,
  SubmissionListResponseSchema,
  type SubmissionSummary,
} from "@teknofest-ai/shared";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router";

import { REVIEWER_EVALUATION_STATUS_LABELS } from "./analysis-labels";
import { apiDelete, apiRequest, errorMessage } from "./api";
import { Breadcrumb, ManagerStepNav } from "./competition-nav";

function totalCell(score: number | null, maximum: number | null): string {
  if (score === null || maximum === null) return "—";
  return `${score} / ${maximum}`;
}

function AssignmentRow({
  competitionId,
  assignment,
  onUnassign,
  isBusy,
}: {
  competitionId: string;
  assignment: ReviewerAssignmentOperation;
  onUnassign(assignmentId: string): void;
  isBusy: boolean;
}) {
  return (
    <tr className="border-t border-slate-200 align-top">
      <td className="px-3 py-2.5 text-sm">
        <span className="font-semibold text-slate-950">
          {assignment.submission.applicationCode}
        </span>
        <span className="mt-0.5 block text-slate-600">{assignment.submission.projectTitle}</span>
      </td>
      <td className="px-3 py-2.5 text-sm">
        <span className="font-medium text-slate-900">{assignment.reviewer.name}</span>
        <span className="mt-0.5 block text-slate-500">{assignment.reviewer.email}</span>
      </td>
      <td className="px-3 py-2.5 text-sm text-slate-800">
        {assignment.evaluationStatus === null
          ? "Başlamadı"
          : REVIEWER_EVALUATION_STATUS_LABELS[assignment.evaluationStatus]}
      </td>
      <td className="px-3 py-2.5 text-sm font-semibold text-blue-900">
        {totalCell(assignment.aiSuggestedTotal, assignment.aiMaxTotal)}
      </td>
      <td className="px-3 py-2.5 text-sm font-semibold text-slate-950">
        {assignment.evaluationStatus === "SUBMITTED"
          ? totalCell(assignment.humanTotal, assignment.humanMaxTotal)
          : "—"}
      </td>
      <td className="px-3 py-2.5 text-sm text-slate-800">
        {assignment.disagreementCount === null ? "—" : assignment.disagreementCount}
      </td>
      <td className="px-3 py-2.5">
        <div className="flex flex-wrap gap-2">
          {assignment.evaluationStatus === "SUBMITTED" ? (
            <Link
              className="secondary-button whitespace-nowrap"
              to={`/app/competitions/${competitionId}/submissions/${assignment.submission.id}/feedback`}
            >
              Geri Bildirim
            </Link>
          ) : null}
          <button
            className="danger-button"
            disabled={isBusy || assignment.evaluationStatus === "SUBMITTED"}
            onClick={() => onUnassign(assignment.assignmentId)}
            title={
              assignment.evaluationStatus === "SUBMITTED"
                ? "Gönderilmiş değerlendirme kaydı korunur; atama kaldırılamaz."
                : undefined
            }
            type="button"
          >
            Atamayı kaldır
          </button>
        </div>
      </td>
    </tr>
  );
}

/**
 * Minimal assignment and evaluation-operations view for COMPETITION_MANAGER and
 * EVALUATION_MANAGER. Both totals are shown as separate columns exactly as the server computed them;
 * the AI suggested total is never presented as the reviewer's score. The Smart Risk Queue is
 * deliberately out of scope here.
 */
export function ReviewerAssignmentsPage() {
  const { competitionId } = useParams();
  const [assignments, setAssignments] = useState<ReviewerAssignmentOperation[] | null>(null);
  const [reviewers, setReviewers] = useState<EligibleReviewer[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState("");
  const [selectedReviewerId, setSelectedReviewerId] = useState("");

  const basePath = `/api/v1/competitions/${competitionId}`;

  const refresh = useCallback(async () => {
    const [operations, eligible] = await Promise.all([
      apiRequest(`${basePath}/reviewer-assignments`, ReviewerAssignmentOperationListResponseSchema),
      apiRequest(`${basePath}/reviewers`, EligibleReviewerListResponseSchema),
    ]);
    setAssignments(operations.assignments);
    setReviewers(eligible.reviewers);
  }, [basePath]);

  useEffect(() => {
    let active = true;
    Promise.all([
      refresh(),
      // Submissions are only listable by a COMPETITION_MANAGER; an EVALUATION_MANAGER still gets
      // the operations table and can assign by typing the application code they were given.
      apiRequest(`${basePath}/submissions`, SubmissionListResponseSchema)
        .then((response) => {
          if (active) setSubmissions(response.submissions);
        })
        .catch(() => {
          if (active) setSubmissions([]);
        }),
    ]).catch((caught) => {
      if (active) setError(errorMessage(caught));
    });
    return () => {
      active = false;
    };
  }, [basePath, refresh]);

  async function assign(event: FormEvent) {
    event.preventDefault();
    setIsBusy(true);
    setActionError(null);
    try {
      await apiRequest(`${basePath}/reviewer-assignments`, ReviewerAssignmentResponseSchema, {
        method: "POST",
        body: JSON.stringify({
          submissionId: selectedSubmissionId,
          reviewerUserId: selectedReviewerId,
        }),
      });
      setSelectedSubmissionId("");
      setSelectedReviewerId("");
      await refresh();
    } catch (caught) {
      setActionError(errorMessage(caught));
    } finally {
      setIsBusy(false);
    }
  }

  async function unassign(assignmentId: string) {
    setIsBusy(true);
    setActionError(null);
    try {
      await apiDelete(`${basePath}/reviewer-assignments/${assignmentId}`);
      await refresh();
    } catch (caught) {
      setActionError(errorMessage(caught));
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
      <Breadcrumb
        trail={[
          { label: "Yarışmalar", to: "/app" },
          { label: "Başvurular", to: `/app/competitions/${competitionId}/submissions` },
          { label: "Hakem Atamaları" },
        ]}
      />
      <div className="mt-4 max-w-3xl">
        <p className="eyebrow">Değerlendirme operasyonu</p>
        <h1 className="page-title">Hakem atamaları</h1>
        <p className="page-lead">
          Hakem rolü tek başına başvuru erişimi vermez. Bir hakem yalnız burada açıkça atadığınız
          başvuruları açabilir.
        </p>
      </div>
      {competitionId ? <ManagerStepNav competitionId={competitionId} current="reviewers" /> : null}

      {error ? (
        <div
          className="mt-8 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      <section aria-labelledby="assign-title" className="setup-panel mt-8">
        <h2 className="section-title" id="assign-title">
          Hakem ata
        </h2>
        <form
          className="mt-4 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          onSubmit={assign}
        >
          <div>
            <label className="field-label" htmlFor="assign-submission">
              Başvuru
            </label>
            {submissions.length > 0 ? (
              <select
                className="field-input"
                id="assign-submission"
                onChange={(event) => setSelectedSubmissionId(event.target.value)}
                required
                value={selectedSubmissionId}
              >
                <option value="">Seçin…</option>
                {submissions.map((submission) => (
                  <option key={submission.id} value={submission.id}>
                    {submission.applicationCode} · {submission.projectTitle}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className="field-input font-mono"
                id="assign-submission"
                onChange={(event) => setSelectedSubmissionId(event.target.value)}
                placeholder="Başvuru kimliği"
                required
                value={selectedSubmissionId}
              />
            )}
          </div>
          <div>
            <label className="field-label" htmlFor="assign-reviewer">
              Hakem
            </label>
            <select
              className="field-input"
              id="assign-reviewer"
              onChange={(event) => setSelectedReviewerId(event.target.value)}
              required
              value={selectedReviewerId}
            >
              <option value="">Seçin…</option>
              {reviewers.map((reviewer) => (
                <option key={reviewer.userId} value={reviewer.userId}>
                  {reviewer.name} · {reviewer.email} ({reviewer.assignedSubmissionCount} atama)
                </option>
              ))}
            </select>
            <p className="field-help">Yalnız bu yarışmada hakem rolü olan üyeler listelenir.</p>
          </div>
          <button className="primary-button" disabled={isBusy} type="submit">
            {isBusy ? "İşleniyor…" : "Ata"}
          </button>
        </form>
        {actionError ? (
          <p className="mt-3 text-sm text-red-700" role="alert">
            {actionError}
          </p>
        ) : null}
      </section>

      <section aria-labelledby="operations-title" className="setup-panel mt-8">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Yarışma kapsamı</p>
            <h2 className="section-title" id="operations-title">
              Atama ve değerlendirme durumu
            </h2>
          </div>
        </div>

        {assignments === null && error === null ? (
          <p className="mt-4 text-sm text-slate-600" role="status">
            Atamalar yükleniyor…
          </p>
        ) : null}

        {assignments?.length === 0 ? (
          <p className="mt-4 empty-state">Bu yarışmada henüz hakem ataması yok.</p>
        ) : null}

        {assignments && assignments.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[52rem] text-left">
              <thead>
                <tr className="text-xs font-bold tracking-wide text-slate-500 uppercase">
                  <th className="px-3 py-2" scope="col">
                    Başvuru
                  </th>
                  <th className="px-3 py-2" scope="col">
                    Hakem
                  </th>
                  <th className="px-3 py-2" scope="col">
                    Değerlendirme
                  </th>
                  <th className="px-3 py-2" scope="col">
                    AI önerisi
                  </th>
                  <th className="px-3 py-2" scope="col">
                    Hakem puanı
                  </th>
                  <th className="px-3 py-2" scope="col">
                    Farklı kriter
                  </th>
                  <th className="px-3 py-2" scope="col">
                    İşlem
                  </th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((assignment) => (
                  <AssignmentRow
                    assignment={assignment}
                    competitionId={competitionId ?? ""}
                    isBusy={isBusy}
                    key={assignment.assignmentId}
                    onUnassign={(id) => void unassign(id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        <p className="mt-4 text-sm leading-6 text-slate-600">
          Bu tablo atama durumunu gösterir. Hangi başvuruya önce bakılması gerektiğini görmek için{" "}
          <Link
            className="font-semibold text-blue-800 underline decoration-dotted underline-offset-2"
            to={`/app/competitions/${competitionId}/operations`}
          >
            inceleme önceliği kuyruğuna
          </Link>{" "}
          geçin.
        </p>
        <p className="mt-3 text-xs leading-5 text-slate-500">
          AI önerisi ve hakem puanı ayrı sütunlardır ve tek bir puana birleştirilmez. Gönderilmiş
          bir değerlendirme kaydı korunur; bu nedenle atama kaldırılamaz. Bir hakemin
          değerlendirmeyi göndermesi yarışma genelinde nihai bir karar üretmez.
        </p>
      </section>
    </main>
  );
}
