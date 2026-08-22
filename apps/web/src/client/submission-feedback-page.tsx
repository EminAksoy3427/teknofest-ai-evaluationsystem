import {
  type ContestantFeedbackOperation,
  ContestantFeedbackOperationSchema,
  type ContestantFeedbackSuggestion,
  ContestantFeedbackSuggestionSchema,
  type EligibleFeedbackSource,
  EligibleFeedbackSourceListResponseSchema,
  SubmissionResponseSchema,
  type SubmissionSummary,
} from "@teknofest-ai/shared";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router";

import { apiRequest, errorMessage } from "./api";
import { Breadcrumb } from "./competition-nav";

function linesToList(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function listToLines(value: readonly string[]): string {
  return value.join("\n");
}

/**
 * Manager/evaluation-manager surface for the contestant feedback publication boundary.
 *
 * The deterministic suggestion below is INTERNAL SOURCE DATA, assembled from already persisted and
 * validated human scores and AI rubric evidence — it performs no model call. It is never applied
 * automatically: the manager must explicitly copy it into the editable fields, review it and save
 * before anything can be published, and only PUBLISHED content is ever visible to the contestant.
 */
export function SubmissionFeedbackPage() {
  const { competitionId, submissionId } = useParams();
  const [submission, setSubmission] = useState<SubmissionSummary | null>(null);
  const [sources, setSources] = useState<EligibleFeedbackSource[]>([]);
  const [feedback, setFeedback] = useState<ContestantFeedbackOperation | null>(null);
  const [notFoundYet, setNotFoundYet] = useState(false);
  const [sourceId, setSourceId] = useState("");
  const [summary, setSummary] = useState("");
  const [strengths, setStrengths] = useState("");
  const [improvements, setImprovements] = useState("");
  const [recommendations, setRecommendations] = useState("");
  const [suggestion, setSuggestion] = useState<ContestantFeedbackSuggestion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const basePath = `/api/v1/competitions/${competitionId}/submissions/${submissionId}`;

  const adopt = useCallback((record: ContestantFeedbackOperation) => {
    setFeedback(record);
    setNotFoundYet(false);
    setSourceId(record.sourceReviewerEvaluationId);
    setSummary(record.content.summary ?? "");
    setStrengths(listToLines(record.content.strengths));
    setImprovements(listToLines(record.content.improvements));
    setRecommendations(listToLines(record.content.recommendations));
  }, []);

  const refresh = useCallback(async () => {
    const [submissionResponse, sourceResponse] = await Promise.all([
      apiRequest(basePath, SubmissionResponseSchema),
      apiRequest(`${basePath}/feedback/sources`, EligibleFeedbackSourceListResponseSchema),
    ]);
    setSubmission(submissionResponse);
    setSources(sourceResponse.sources);
    try {
      const current = await apiRequest(`${basePath}/feedback`, ContestantFeedbackOperationSchema);
      adopt(current);
    } catch {
      setFeedback(null);
      setNotFoundYet(true);
    }
  }, [basePath, adopt]);

  useEffect(() => {
    if (!competitionId || !submissionId) return;
    refresh().catch((caught) => setError(errorMessage(caught)));
  }, [competitionId, submissionId, refresh]);

  // Seeds a sensible default source once there is no draft yet and nothing has been picked; kept
  // out of `refresh` itself so that callback's identity does not change on every selection.
  useEffect(() => {
    if (feedback === null && notFoundYet && !sourceId && sources[0]) {
      setSourceId(sources[0].reviewerEvaluationId);
    }
  }, [feedback, notFoundYet, sourceId, sources]);

  const editable = feedback === null || feedback.status === "DRAFT";
  // Mirrors the server's publication rule so the manager sees why the action is unavailable. The
  // server enforces it regardless; this is guidance, not the security boundary.
  const publishable =
    feedback !== null &&
    summary.trim() !== "" &&
    linesToList(strengths).length > 0 &&
    linesToList(improvements).length > 0 &&
    linesToList(recommendations).length > 0;

  async function loadSuggestion() {
    if (!sourceId) return;
    setActionError(null);
    try {
      const result = await apiRequest(
        `${basePath}/feedback/suggestion?sourceReviewerEvaluationId=${sourceId}`,
        ContestantFeedbackSuggestionSchema,
      );
      setSuggestion(result);
    } catch (caught) {
      setActionError(errorMessage(caught));
    }
  }

  function applySuggestion() {
    if (!suggestion) return;
    setSummary(suggestion.summary);
    setStrengths(listToLines(suggestion.strengths));
    setImprovements(listToLines(suggestion.improvements));
  }

  async function saveDraft() {
    if (!sourceId) {
      setActionError("Önce bir kaynak hakem değerlendirmesi seçin.");
      return;
    }
    setIsBusy(true);
    setActionError(null);
    setActionMessage(null);
    try {
      const saved = await apiRequest(`${basePath}/feedback`, ContestantFeedbackOperationSchema, {
        method: "PUT",
        body: JSON.stringify({
          sourceReviewerEvaluationId: sourceId,
          summary: summary.trim() === "" ? null : summary,
          strengths: linesToList(strengths),
          improvements: linesToList(improvements),
          recommendations: linesToList(recommendations),
        }),
      });
      adopt(saved);
      setActionMessage("Taslak kaydedildi.");
    } catch (caught) {
      setActionError(errorMessage(caught));
    } finally {
      setIsBusy(false);
    }
  }

  async function publish() {
    setIsBusy(true);
    setActionError(null);
    setActionMessage(null);
    try {
      const published = await apiRequest(
        `${basePath}/feedback/publish`,
        ContestantFeedbackOperationSchema,
        { method: "POST" },
      );
      adopt(published);
      setActionMessage("Değerlendirme sonucu yayımlandı. Yarışmacı artık görebilir.");
    } catch (caught) {
      setActionError(errorMessage(caught));
    } finally {
      setIsBusy(false);
    }
  }

  if (!competitionId || !submissionId) {
    return <main className="mx-auto max-w-4xl p-8">Başvuru kimliği bulunamadı.</main>;
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-5 py-8 sm:px-8 sm:py-12">
      <Breadcrumb
        trail={[
          { label: "Yarışmalar", to: "/app" },
          { label: "Başvurular", to: `/app/competitions/${competitionId}/submissions` },
          { label: "Yarışmacı Geri Bildirimi" },
        ]}
      />
      <div className="mt-4 max-w-3xl">
        <p className="eyebrow">Yarışmacı geri bildirimi</p>
        <h1 className="page-title">
          {submission ? `${submission.applicationCode} · Geri Bildirim` : "Geri Bildirim"}
        </h1>
        <p className="page-lead">
          Bu içerik yalnız yayımlandıktan sonra yarışmacıya görünür. Taslak hiçbir zaman yarışmacıya
          gösterilmez ve yayımlanmış bir kayıt değiştirilemez.
        </p>
      </div>

      {error ? (
        <div
          className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      {!feedback && !notFoundYet && !error ? (
        <p className="mt-6 text-sm text-slate-600" role="status">
          Yükleniyor…
        </p>
      ) : null}

      {feedback ? (
        <div className="mt-6">
          <span
            className={`status-chip ${feedback.status === "PUBLISHED" ? "status-chip-pass" : "status-chip-info"}`}
          >
            {feedback.status === "PUBLISHED" ? "Yayımlandı" : "Taslak"}
          </span>
        </div>
      ) : null}

      <section aria-labelledby="feedback-source-title" className="setup-panel mt-6">
        <h2 className="section-title" id="feedback-source-title">
          Kaynak hakem değerlendirmesi
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Yalnız gönderilmiş (taslak olmayan) hakem değerlendirmeleri seçilebilir.
        </p>
        {sources.length === 0 ? (
          <p className="mt-4 empty-state">
            Bu başvuru için henüz gönderilmiş bir hakem değerlendirmesi yok.
          </p>
        ) : (
          <select
            className="field-input mt-4"
            disabled={!editable}
            onChange={(event) => setSourceId(event.target.value)}
            value={sourceId}
          >
            <option value="">Seçin…</option>
            {sources.map((source) => (
              <option key={source.reviewerEvaluationId} value={source.reviewerEvaluationId}>
                {source.reviewerName} · {source.humanTotal}/{source.humanMaxTotal}
              </option>
            ))}
          </select>
        )}
        {editable && sourceId ? (
          <button
            className="secondary-button mt-3"
            onClick={() => void loadSuggestion()}
            type="button"
          >
            Öneri getir
          </button>
        ) : null}
        {suggestion ? (
          <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
            <p className="text-xs font-bold tracking-[0.14em] text-blue-800 uppercase">
              Türetilmiş öneri · yapay zekâ çağrısı içermez
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-700">{suggestion.summary}</p>
            <button
              className="secondary-button mt-3"
              disabled={!editable}
              onClick={applySuggestion}
              type="button"
            >
              Öneriyi içeriğe uygula
            </button>
          </div>
        ) : null}
      </section>

      <section aria-labelledby="feedback-content-title" className="setup-panel mt-6">
        <h2 className="section-title" id="feedback-content-title">
          Yayım içeriği
        </h2>
        <div className="mt-4">
          <label className="field-label" htmlFor="feedback-summary">
            Özet
          </label>
          <textarea
            className="field-input min-h-24"
            disabled={!editable}
            id="feedback-summary"
            onChange={(event) => setSummary(event.target.value)}
            value={summary}
          />
        </div>
        <div className="mt-4">
          <label className="field-label" htmlFor="feedback-strengths">
            Güçlü yönler (her satıra bir madde)
          </label>
          <textarea
            className="field-input min-h-20"
            disabled={!editable}
            id="feedback-strengths"
            onChange={(event) => setStrengths(event.target.value)}
            value={strengths}
          />
        </div>
        <div className="mt-4">
          <label className="field-label" htmlFor="feedback-improvements">
            Gelişim alanları (her satıra bir madde)
          </label>
          <textarea
            className="field-input min-h-20"
            disabled={!editable}
            id="feedback-improvements"
            onChange={(event) => setImprovements(event.target.value)}
            value={improvements}
          />
        </div>
        <div className="mt-4">
          <label className="field-label" htmlFor="feedback-recommendations">
            Öneriler (her satıra bir madde)
          </label>
          <textarea
            className="field-input min-h-20"
            disabled={!editable}
            id="feedback-recommendations"
            onChange={(event) => setRecommendations(event.target.value)}
            value={recommendations}
          />
        </div>

        {editable ? (
          <>
            <p className="mt-4 text-sm text-slate-600">
              Taslak eksik kalabilir. Yayımlamak içinse özet, güçlü yönler, gelişim alanları ve
              öneriler bölümlerinin her biri en az bir madde içermelidir. Belirgin bir zayıf yön
              yoksa buraya gerçeğe uygun bir geliştirme veya devam önerisi yazın; sistem sizin
              yerinize içerik üretmez.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                className="secondary-button"
                disabled={isBusy}
                onClick={() => void saveDraft()}
                type="button"
              >
                {isBusy ? "Kaydediliyor…" : "Taslağı kaydet"}
              </button>
              <button
                className="primary-button"
                disabled={isBusy || !publishable}
                onClick={() => void publish()}
                type="button"
              >
                Yayımla
              </button>
            </div>
          </>
        ) : (
          <p className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
            Bu geri bildirim yayımlandı ve değiştirilemez.
          </p>
        )}
        {actionError ? (
          <p className="mt-3 text-sm text-red-700" role="alert">
            {actionError}
          </p>
        ) : null}
        {actionMessage ? (
          <p className="mt-3 text-sm text-emerald-700" role="status">
            {actionMessage}
          </p>
        ) : null}
      </section>
    </main>
  );
}
