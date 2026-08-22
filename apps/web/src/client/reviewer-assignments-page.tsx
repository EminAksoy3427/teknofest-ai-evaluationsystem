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
import { Breadcrumb } from "./competition-nav";
import { Alert, EmptyState, InitialsAvatar, Modal, PageHeader } from "./ui";

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
    <tr>
      <td>
        <span className="font-mono text-xs font-bold text-brand">
          {assignment.submission.applicationCode}
        </span>
        <span className="mt-0.5 block text-sm font-semibold text-ink">
          {assignment.submission.projectTitle}
        </span>
      </td>
      <td>
        <span className="flex items-center gap-2 font-medium text-ink">
          <InitialsAvatar name={assignment.reviewer.name} />
          {assignment.reviewer.name}
        </span>
      </td>
      <td>
        {assignment.evaluationStatus === null
          ? "Başlamadı"
          : REVIEWER_EVALUATION_STATUS_LABELS[assignment.evaluationStatus]}
      </td>
      <td className="font-semibold text-brand-deep">
        {totalCell(assignment.aiSuggestedTotal, assignment.aiMaxTotal)}
      </td>
      <td className="font-semibold text-ink">
        {assignment.evaluationStatus === "SUBMITTED"
          ? totalCell(assignment.humanTotal, assignment.humanMaxTotal)
          : "—"}
      </td>
      <td>{assignment.disagreementCount === null ? "—" : assignment.disagreementCount}</td>
      <td>
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
  const [hasSubmissionList, setHasSubmissionList] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState("");
  const [selectedReviewerId, setSelectedReviewerId] = useState("");
  const [isAssignOpen, setIsAssignOpen] = useState(false);

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
          if (active) {
            setSubmissions(response.submissions);
            setHasSubmissionList(true);
          }
        })
        .catch(() => {
          if (active) {
            setSubmissions([]);
            setHasSubmissionList(false);
          }
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
      setIsAssignOpen(false);
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
    <div className="layout-wide">
      <Breadcrumb trail={[{ label: "Genel Bakış", to: "/app" }, { label: "Hakemler" }]} />
      <div className="mt-4">
        <PageHeader
          actions={
            <button className="primary-button" onClick={() => setIsAssignOpen(true)} type="button">
              Hakem ata
            </button>
          }
          lead="Hangi başvuruya kimin baktığını ve değerlendirme durumunu buradan yönetin."
          title="Hakemler"
        />
      </div>

      {error ? (
        <div className="mt-6">
          <Alert tone="error">{error}</Alert>
        </div>
      ) : null}

      {actionError ? (
        <p className="mt-4 text-sm text-critical" role="alert">
          {actionError}
        </p>
      ) : null}

      {assignments === null && error === null ? (
        <p className="mt-6 text-sm text-ink-muted" role="status">
          Atamalar yükleniyor…
        </p>
      ) : null}

      {assignments?.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            action={
              <button
                className="primary-button"
                onClick={() => setIsAssignOpen(true)}
                type="button"
              >
                Hakem ata
              </button>
            }
            description="Bir başvuruya hakem atadığınızda değerlendirme başlayabilir."
            title="Henüz hakem ataması yok"
          />
        </div>
      ) : null}

      {assignments && assignments.length > 0 ? (
        <div className="table-scroll mt-6">
          <table className="data-table min-w-[52rem]">
            <caption className="sr-only">Hakem atamaları ve değerlendirme durumları</caption>
            <thead>
              <tr>
                <th scope="col">Başvuru</th>
                <th scope="col">Hakem</th>
                <th scope="col">Değerlendirme</th>
                <th scope="col">AI önerisi</th>
                <th scope="col">Hakem puanı</th>
                <th scope="col">Farklı kriter</th>
                <th scope="col">İşlem</th>
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

      <p className="mt-4 text-sm leading-6 text-ink-muted">
        Öncelik sırası için{" "}
        <Link className="evidence-link" to={`/app/competitions/${competitionId}/operations`}>
          Değerlendirme
        </Link>{" "}
        kuyruğunu açın.
      </p>

      {isAssignOpen ? (
        <Modal labelledBy="assign-title" onClose={() => setIsAssignOpen(false)}>
          <h2 className="section-title" id="assign-title">
            Hakem ata
          </h2>
          <form className="mt-5 grid gap-4" onSubmit={assign}>
            <div>
              <label className="field-label" htmlFor="assign-submission">
                Başvuru
              </label>
              {hasSubmissionList ? (
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
                <>
                  <input
                    className="field-input"
                    id="assign-submission"
                    onChange={(event) => setSelectedSubmissionId(event.target.value)}
                    placeholder="Başvuru kodunu veya kimliğini girin"
                    required
                    value={selectedSubmissionId}
                  />
                  <p className="field-help">
                    Değerlendirme yöneticisi başvuru listesini göremez. Atama için başvuru kimliğini
                    yarışma yöneticisinden alın.
                  </p>
                </>
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
                    {reviewer.name} ({reviewer.assignedSubmissionCount} atama)
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap gap-3">
              <button className="primary-button" disabled={isBusy} type="submit">
                {isBusy ? "İşleniyor…" : "Ata"}
              </button>
              <button
                className="secondary-button"
                onClick={() => setIsAssignOpen(false)}
                type="button"
              >
                Vazgeç
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
