import {
  type DecisionTrace,
  deriveDecisionTrace,
  MAX_REVIEWER_CRITERION_NOTE_CHARACTERS,
  MAX_REVIEWER_OVERALL_NOTE_CHARACTERS,
  type ReviewerWorkspaceCriterion,
  type ReviewerWorkspaceResponse,
} from "@teknofest-ai/shared";

import { DECISION_TRACE_LABELS, EVIDENCE_STRENGTH_LABELS } from "../analysis-labels";
import { EvidenceQuote } from "./evidence-link";

export interface CriterionDraft {
  score: string;
  note: string;
}

interface RubricPanelProps {
  workspace: ReviewerWorkspaceResponse;
  drafts: Record<string, CriterionDraft>;
  overallNote: string;
  isDirty: boolean;
  isSaving: boolean;
  saveError: string | null;
  saveMessage: string | null;
  onDraftChange(criterionId: string, next: CriterionDraft): void;
  onOverallNoteChange(value: string): void;
  onNavigateToPage(page: number): void;
  onSaveDraft(): void;
  onSubmit(): void;
}

function traceClass(trace: DecisionTrace): string {
  if (trace.classification === "SAME_AS_AI")
    return "border-emerald-300 bg-emerald-50 text-emerald-900";
  if (trace.classification === "NO_AI_SUGGESTION")
    return "border-slate-300 bg-slate-50 text-slate-700";
  return "border-blue-300 bg-blue-50 text-blue-900";
}

function formatDifference(difference: number): string {
  return difference > 0 ? `+${difference}` : String(difference);
}

/**
 * Human–AI decision trace for one criterion. A difference is stated as a plain observation with no
 * warning styling: a reviewer scoring below or above the AI suggestion is the expected, correct
 * behaviour of a human-controlled evaluation, not an error to be flagged.
 */
function DecisionTraceRow({ trace }: { trace: DecisionTrace }) {
  return (
    <div
      className={`mt-2 rounded-lg border px-2.5 py-2 text-xs font-semibold ${traceClass(trace)}`}
    >
      <span className="block">{DECISION_TRACE_LABELS[trace.classification]}</span>
      <span className="mt-1 block font-medium">
        AI önerisi: {trace.aiScore === null ? "yok" : trace.aiScore} · Hakem puanı:{" "}
        {trace.humanScore === null ? "girilmedi" : trace.humanScore}
        {trace.difference === null ? "" : ` · Fark: ${formatDifference(trace.difference)}`}
      </span>
    </div>
  );
}

function CriterionCard({
  criterion,
  draft,
  pageCount,
  editable,
  onDraftChange,
  onNavigateToPage,
}: {
  criterion: ReviewerWorkspaceCriterion;
  draft: CriterionDraft;
  pageCount: number | null;
  editable: boolean;
  onDraftChange(next: CriterionDraft): void;
  onNavigateToPage(page: number): void;
}) {
  const scoreInputId = `criterion-score-${criterion.criterionId}`;
  const noteInputId = `criterion-note-${criterion.criterionId}`;
  const parsedScore = draft.score.trim() === "" ? null : Number(draft.score);
  const liveScore =
    parsedScore !== null && Number.isInteger(parsedScore) && parsedScore >= 0 ? parsedScore : null;
  const aiScore = criterion.aiSuggestion?.suggestedScore ?? null;
  const trace = deriveDecisionTrace(aiScore, liveScore);
  const outOfRange = liveScore !== null && liveScore > criterion.maxScore;

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-sm font-bold text-slate-950">{criterion.title}</h4>
        <span className="metric-chip">Azami {criterion.maxScore} puan</span>
      </div>
      <p className="mt-1 text-sm leading-6 text-slate-600">{criterion.description}</p>
      {criterion.evidenceExpectation ? (
        <p className="mt-1 text-xs leading-5 text-slate-500">
          Kanıt beklentisi: {criterion.evidenceExpectation}
        </p>
      ) : null}

      {criterion.aiSuggestion ? (
        <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50 p-2.5">
          <p className="text-sm font-bold text-blue-900">
            AI önerisi: {criterion.aiSuggestion.suggestedScore} / {criterion.maxScore}
          </p>
          <p className="mt-1 text-xs font-medium text-blue-900">
            Kanıt gücü: {EVIDENCE_STRENGTH_LABELS[criterion.aiSuggestion.evidenceStrength]}
          </p>
          <p className="mt-1 text-sm leading-6 text-slate-700">{criterion.aiSuggestion.reason}</p>
          {criterion.aiSuggestion.evidence.map((evidence) => (
            <EvidenceQuote
              evidence={evidence}
              key={`${evidence.page}-${evidence.excerpt}`}
              onNavigate={onNavigateToPage}
              pageCount={pageCount}
            />
          ))}
          {criterion.aiSuggestion.missingPoints.length > 0 ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">
              {criterion.aiSuggestion.missingPoints.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : (
        <p className="mt-2 text-xs font-medium text-slate-500">
          Bu kriter için AI önerisi yok. Puanı doğrudan siz belirleyeceksiniz.
        </p>
      )}

      <div className="mt-3 grid gap-2 sm:grid-cols-[auto_1fr] sm:items-end">
        <div>
          <label className="field-label" htmlFor={scoreInputId}>
            Hakem puanı (0–{criterion.maxScore})
          </label>
          <input
            aria-describedby={outOfRange ? `${scoreInputId}-error` : undefined}
            aria-invalid={outOfRange}
            className="field-input w-28"
            disabled={!editable}
            id={scoreInputId}
            inputMode="numeric"
            max={criterion.maxScore}
            min={0}
            onChange={(event) => onDraftChange({ ...draft, score: event.target.value })}
            step={1}
            type="number"
            value={draft.score}
          />
        </div>
        {editable && aiScore !== null ? (
          <button
            className="secondary-button justify-self-start"
            onClick={() => onDraftChange({ ...draft, score: String(aiScore) })}
            type="button"
          >
            AI önerisini puan olarak kullan ({aiScore})
          </button>
        ) : null}
      </div>
      {outOfRange ? (
        <p className="mt-1 text-sm text-red-700" id={`${scoreInputId}-error`} role="alert">
          Puan en fazla {criterion.maxScore} olabilir.
        </p>
      ) : null}

      <div className="mt-2">
        <label className="field-label" htmlFor={noteInputId}>
          Hakem gerekçesi (isteğe bağlı)
        </label>
        <textarea
          className="field-input min-h-16"
          disabled={!editable}
          id={noteInputId}
          maxLength={MAX_REVIEWER_CRITERION_NOTE_CHARACTERS}
          onChange={(event) => onDraftChange({ ...draft, note: event.target.value })}
          value={draft.note}
        />
        {trace.classification === "DIFFERENT_FROM_AI" && liveScore !== null ? (
          <p className="field-help">
            AI önerisinden farklı puan verdiniz. Gerekçe zorunlu değildir; yazarsanız karar izinde
            saklanır.
          </p>
        ) : null}
      </div>

      <DecisionTraceRow trace={trace} />
    </article>
  );
}

/**
 * Right pane: the human rubric, built from the RubricVersion pinned on the workspace's AnalysisRun.
 *
 * Nothing here ever writes a score on the reviewer's behalf. The AI suggestion is displayed as a
 * clearly labelled suggestion, and applying it is an explicit button press that fills the human
 * input; the reviewer may accept, lower or raise it. The persisted totals shown at the bottom are
 * always the ones the server computed.
 */
export function RubricPanel({
  workspace,
  drafts,
  overallNote,
  isDirty,
  isSaving,
  saveError,
  saveMessage,
  onDraftChange,
  onOverallNoteChange,
  onNavigateToPage,
  onSaveDraft,
  onSubmit,
}: RubricPanelProps) {
  const pageCount = workspace.analysisRun.extraction.pageCount;
  const editable = workspace.editable;
  const totals = workspace.totals;
  const unscored = workspace.criteria.filter(
    (criterion) => (drafts[criterion.criterionId]?.score ?? "").trim() === "",
  );
  const outOfRange = workspace.criteria.some((criterion) => {
    const raw = (drafts[criterion.criterionId]?.score ?? "").trim();
    if (raw === "") return false;
    const value = Number(raw);
    return !Number.isInteger(value) || value < 0 || value > criterion.maxScore;
  });
  const canSubmit = editable && unscored.length === 0 && !outOfRange && !isSaving;

  return (
    <div className="flex min-h-0 min-w-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {editable ? null : (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-sm text-emerald-900">
            Bu değerlendirmeyi gönderdiniz ve kaydı değiştirilemez. Gönderim yalnız sizin
            değerlendirmenizi tamamlar; projeyi elemez, kazanan seçmez ve yarışma genelinde nihai
            bir karar üretmez.
          </p>
        )}

        <div className="mt-2 space-y-2">
          {workspace.criteria.map((criterion) => (
            <CriterionCard
              criterion={criterion}
              draft={drafts[criterion.criterionId] ?? { score: "", note: "" }}
              editable={editable}
              key={criterion.criterionId}
              onDraftChange={(next) => onDraftChange(criterion.criterionId, next)}
              onNavigateToPage={onNavigateToPage}
              pageCount={pageCount}
            />
          ))}
        </div>

        <div className="mt-3">
          <label className="field-label" htmlFor="reviewer-overall-note">
            Genel değerlendirme notu (isteğe bağlı)
          </label>
          <textarea
            className="field-input min-h-20"
            disabled={!editable}
            id="reviewer-overall-note"
            maxLength={MAX_REVIEWER_OVERALL_NOTE_CHARACTERS}
            onChange={(event) => onOverallNoteChange(event.target.value)}
            value={overallNote}
          />
        </div>
      </div>

      <div className="border-t border-slate-200 bg-white p-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-2.5">
            <p className="text-xs font-bold tracking-wide text-blue-900 uppercase">AI önerisi</p>
            <p className="mt-0.5 text-lg font-bold text-blue-900">
              {totals.aiSuggestedTotal === null ? "Yok" : totals.aiSuggestedTotal} /{" "}
              {totals.aiMaxTotal}
            </p>
          </div>
          <div className="rounded-lg border border-slate-300 bg-slate-50 p-2.5">
            <p className="text-xs font-bold tracking-wide text-slate-700 uppercase">Hakem puanı</p>
            <p className="mt-0.5 text-lg font-bold text-slate-950">
              {totals.humanTotal === null ? "Girilmedi" : totals.humanTotal} /{" "}
              {totals.humanMaxTotal}
            </p>
          </div>
        </div>
        <p className="mt-2 text-xs leading-5 text-slate-500">
          Toplamları sunucu hesaplar. AI önerisi ile hakem puanı ayrı kayıtlardır ve tek bir puana
          birleştirilmez. Puanlanan kriter: {totals.scoredCriterionCount} / {totals.criterionCount}{" "}
          · AI önerisinden farklı: {totals.disagreementCount}
        </p>

        {isDirty && editable ? (
          <p className="mt-2 text-sm text-amber-800" role="status">
            Kaydedilmemiş değişiklikler var. Toplam, kaydettiğinizde sunucuda yeniden hesaplanır.
          </p>
        ) : null}
        {saveError ? (
          <p className="mt-2 text-sm text-red-700" role="alert">
            {saveError}
          </p>
        ) : null}
        {saveMessage ? (
          <p className="mt-2 text-sm text-emerald-800" role="status">
            {saveMessage}
          </p>
        ) : null}
        {editable && unscored.length > 0 ? (
          <p className="mt-2 text-sm text-slate-600">
            Göndermek için puanlanması gereken kriter sayısı: {unscored.length}
          </p>
        ) : null}

        {editable ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="secondary-button"
              disabled={isSaving}
              onClick={onSaveDraft}
              type="button"
            >
              {isSaving ? "Kaydediliyor…" : "Taslağı kaydet"}
            </button>
            <button
              className="primary-button"
              disabled={!canSubmit}
              onClick={onSubmit}
              type="button"
            >
              Değerlendirmemi gönder
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
