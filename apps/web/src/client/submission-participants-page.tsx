import {
  type EligibleContestant,
  EligibleContestantListResponseSchema,
  type SubmissionParticipant,
  SubmissionParticipantListResponseSchema,
  SubmissionParticipantSchema,
  SubmissionResponseSchema,
  type SubmissionSummary,
} from "@teknofest-ai/shared";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { useParams } from "react-router";

import { apiDelete, apiRequest, errorMessage } from "./api";
import { Breadcrumb } from "./competition-nav";
import { Alert, EmptyState, PageHeader } from "./ui";

/**
 * Minimal manager surface for attaching/removing CONTESTANT participants on one submission. A
 * contestant only gains ownership of a submission through a row here; the CONTESTANT role by
 * itself grants nothing, exactly like a hakem's `ReviewerAssignment`.
 */
export function SubmissionParticipantsPage() {
  const { competitionId, submissionId } = useParams();
  const [submission, setSubmission] = useState<SubmissionSummary | null>(null);
  const [participants, setParticipants] = useState<SubmissionParticipant[] | null>(null);
  const [contestants, setContestants] = useState<EligibleContestant[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const basePath = `/api/v1/competitions/${competitionId}`;
  const participantsPath = `${basePath}/submissions/${submissionId}/participants`;

  const refresh = useCallback(async () => {
    const [submissionResponse, participantResponse, contestantResponse] = await Promise.all([
      apiRequest(`${basePath}/submissions/${submissionId}`, SubmissionResponseSchema),
      apiRequest(participantsPath, SubmissionParticipantListResponseSchema),
      apiRequest(`${basePath}/contestants`, EligibleContestantListResponseSchema),
    ]);
    setSubmission(submissionResponse);
    setParticipants(participantResponse.participants);
    setContestants(contestantResponse.contestants);
  }, [basePath, participantsPath, submissionId]);

  useEffect(() => {
    if (!competitionId || !submissionId) return;
    refresh().catch((caught) => setError(errorMessage(caught)));
  }, [competitionId, submissionId, refresh]);

  async function attach(event: FormEvent) {
    event.preventDefault();
    if (!selectedUserId) return;
    setIsBusy(true);
    setActionError(null);
    try {
      await apiRequest(participantsPath, SubmissionParticipantSchema, {
        method: "POST",
        body: JSON.stringify({ userId: selectedUserId }),
      });
      setSelectedUserId("");
      await refresh();
    } catch (caught) {
      setActionError(errorMessage(caught));
    } finally {
      setIsBusy(false);
    }
  }

  async function remove(participantId: string) {
    setIsBusy(true);
    setActionError(null);
    try {
      await apiDelete(`${participantsPath}/${participantId}`);
      await refresh();
    } catch (caught) {
      setActionError(errorMessage(caught));
    } finally {
      setIsBusy(false);
    }
  }

  if (!competitionId || !submissionId) {
    return <div className="mx-auto max-w-4xl">Başvuru kimliği bulunamadı.</div>;
  }

  const attachedUserIds = new Set(participants?.map((participant) => participant.userId) ?? []);
  const availableContestants = contestants.filter(
    (contestant) => !attachedUserIds.has(contestant.userId),
  );

  return (
    <div className="layout-form">
      <Breadcrumb
        trail={[
          { label: "Genel Bakış", to: "/app" },
          { label: "Başvurular", to: `/app/competitions/${competitionId}/submissions` },
          { label: "Katılımcılar" },
        ]}
      />
      <div className="mt-4">
        <PageHeader
          lead="Eklenen yarışmacılar bu başvurunun sahibidir ve yayımlanan sonucu görür."
          title={submission ? `${submission.applicationCode} · Katılımcılar` : "Katılımcılar"}
        />
      </div>

      {error ? (
        <div className="mt-6">
          <Alert tone="error">{error}</Alert>
        </div>
      ) : null}

      <section aria-labelledby="attach-title" className="setup-panel mt-8">
        <h2 className="section-title" id="attach-title">
          Katılımcı ekle
        </h2>
        <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={attach}>
          <div className="min-w-64">
            <label className="field-label" htmlFor="participant-user">
              Yarışmacı
            </label>
            <select
              className="field-input"
              disabled={availableContestants.length === 0}
              id="participant-user"
              onChange={(event) => setSelectedUserId(event.target.value)}
              required
              value={selectedUserId}
            >
              <option value="">Seçin…</option>
              {availableContestants.map((contestant) => (
                <option key={contestant.userId} value={contestant.userId}>
                  {contestant.name} · {contestant.email}
                </option>
              ))}
            </select>
            {availableContestants.length === 0 ? (
              <p className="field-help">
                Eklenebilecek yarışmacı yok. Önce yarışma üyeliğinde yarışmacı rolü tanımlayın.
              </p>
            ) : null}
          </div>
          <button className="primary-button" disabled={isBusy || !selectedUserId} type="submit">
            {isBusy ? "İşleniyor…" : "Ekle"}
          </button>
        </form>
        {actionError ? (
          <p className="mt-3 text-sm text-critical" role="alert">
            {actionError}
          </p>
        ) : null}
      </section>

      <section aria-labelledby="participants-title" className="surface-panel mt-8 p-5">
        <h2 className="section-title" id="participants-title">
          Mevcut katılımcılar
        </h2>
        {participants === null && !error ? (
          <p className="mt-4 text-sm text-ink-muted" role="status">
            Yükleniyor…
          </p>
        ) : null}
        {participants?.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              description="Eklenene kadar sonuç yayımlansa da kimse göremez."
              title="Bu başvuruya henüz yarışmacı eklenmedi"
            />
          </div>
        ) : null}
        {participants && participants.length > 0 ? (
          <ul className="mt-4 space-y-2">
            {participants.map((participant) => (
              <li
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                key={participant.id}
              >
                <div>
                  <p className="font-semibold text-ink">{participant.name}</p>
                  <p className="text-sm text-ink-muted">{participant.email}</p>
                </div>
                <button
                  className="danger-button"
                  disabled={isBusy}
                  onClick={() => remove(participant.id)}
                  type="button"
                >
                  Kaldır
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
