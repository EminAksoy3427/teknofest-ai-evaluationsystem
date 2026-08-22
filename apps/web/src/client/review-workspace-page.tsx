import {
  type ReviewerWorkspaceResponse,
  ReviewerWorkspaceResponseSchema,
} from "@teknofest-ai/shared";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";

import {
  ANALYSIS_RUN_STATUS_LABELS,
  analysisRunStatusChipClass,
  evaluationStatusChipClass,
  REVIEWER_EVALUATION_STATUS_LABELS,
} from "./analysis-labels";
import { apiRequest, errorMessage } from "./api";
import { Breadcrumb } from "./competition-nav";
import { AiPanel } from "./review/ai-panel";
import { clampPage } from "./review/evidence-navigation";
import { ReportPanel } from "./review/report-panel";
import { type CriterionDraft, RubricPanel } from "./review/rubric-panel";
import {
  PANEL_KEYS,
  PANEL_LABELS,
  PANEL_NOTES,
  type PanelKey,
  panelClassName,
} from "./review/workspace-panes";

function draftsFromWorkspace(workspace: ReviewerWorkspaceResponse): Record<string, CriterionDraft> {
  return Object.fromEntries(
    workspace.criteria.map((criterion) => [
      criterion.criterionId,
      {
        score: criterion.humanScore === null ? "" : String(criterion.humanScore),
        note: criterion.humanNote ?? "",
      },
    ]),
  );
}

function scoresPayload(
  workspace: ReviewerWorkspaceResponse,
  drafts: Record<string, CriterionDraft>,
) {
  return workspace.criteria
    .map((criterion) => {
      const draft = drafts[criterion.criterionId];
      const raw = (draft?.score ?? "").trim();
      if (raw === "") return null;
      return {
        criterionId: criterion.criterionId,
        score: Number(raw),
        note: draft?.note ?? "",
      };
    })
    .filter(
      (entry): entry is { criterionId: string; score: number; note: string } => entry !== null,
    );
}

/**
 * The primary reviewer experience: report on the left, the persisted AI analysis in the centre and
 * the human rubric on the right.
 *
 * On desktop all three panes are operational at once. Below the `xl` breakpoint the panes collapse
 * into one visible pane at a time selected by the buttons above; every pane stays mounted, so
 * switching never reloads the report and never loses an unsaved score.
 *
 * No model call happens anywhere in this screen. Opening it, clicking an evidence page, changing a
 * score, saving a draft and submitting all read or write already persisted records.
 */
export function ReviewWorkspacePage() {
  const { competitionId, assignmentId } = useParams();
  const [workspace, setWorkspace] = useState<ReviewerWorkspaceResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, CriterionDraft>>({});
  const [overallNote, setOverallNote] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [activePanel, setActivePanel] = useState<PanelKey>("report");

  const basePath = `/api/v1/competitions/${competitionId}/review/assignments/${assignmentId}`;

  const adopt = useCallback((next: ReviewerWorkspaceResponse) => {
    setWorkspace(next);
    setDrafts(draftsFromWorkspace(next));
    setOverallNote(next.evaluation?.overallNote ?? "");
    setIsDirty(false);
  }, []);

  useEffect(() => {
    let active = true;
    setWorkspace(null);
    setLoadError(null);
    apiRequest(`${basePath}/workspace`, ReviewerWorkspaceResponseSchema)
      .then((response) => {
        if (active) adopt(response);
      })
      .catch((caught) => {
        if (active) setLoadError(errorMessage(caught));
      });
    return () => {
      active = false;
    };
  }, [basePath, adopt]);

  const pageCount = workspace?.analysisRun.extraction.pageCount ?? null;

  const navigateToPage = useCallback(
    (target: number) => {
      setPage(clampPage(target, pageCount));
      setActivePanel("report");
    },
    [pageCount],
  );

  async function persist(mode: "draft" | "submit") {
    if (!workspace) return;
    setIsSaving(true);
    setSaveError(null);
    setSaveMessage(null);
    try {
      const path = mode === "draft" ? `${basePath}/evaluation` : `${basePath}/evaluation/submit`;
      const saved = await apiRequest(path, ReviewerWorkspaceResponseSchema, {
        method: mode === "draft" ? "PUT" : "POST",
        body: JSON.stringify({
          analysisRunId: workspace.analysisRun.id,
          overallNote,
          scores: scoresPayload(workspace, drafts),
        }),
      });
      adopt(saved);
      setSaveMessage(
        mode === "draft"
          ? "Taslak kaydedildi."
          : "Değerlendirmeniz gönderildi. Bu yalnız sizin değerlendirmenizi tamamlar.",
      );
    } catch (caught) {
      setSaveError(errorMessage(caught));
    } finally {
      setIsSaving(false);
    }
  }

  const header = useMemo(
    () => (
      <div className="sticky top-0 z-20 border-b border-slate-200 bg-white px-4 py-3">
        <Breadcrumb
          trail={[
            { label: "Atamalarım", to: "/app/review" },
            { label: workspace ? workspace.submission.applicationCode : "Değerlendirme" },
          ]}
        />
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold tracking-tight text-slate-950">
              {workspace ? workspace.submission.projectTitle : "Değerlendirme"}
            </h1>
            {workspace ? (
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <span className="metric-chip">{workspace.submission.applicationCode}</span>
                <span className="metric-chip">{workspace.submission.category.name}</span>
                <span
                  className={`status-chip ${analysisRunStatusChipClass(workspace.analysisRun.status)}`}
                >
                  Analiz: {ANALYSIS_RUN_STATUS_LABELS[workspace.analysisRun.status]}
                </span>
                <span
                  className={`status-chip ${evaluationStatusChipClass(workspace.evaluation?.status ?? null)}`}
                >
                  {workspace.evaluation === null
                    ? "Değerlendirme başlamadı"
                    : `Değerlendirme: ${REVIEWER_EVALUATION_STATUS_LABELS[workspace.evaluation.status]}`}
                </span>
              </div>
            ) : null}
          </div>
          <Link className="secondary-button" to="/app/review">
            Atamalarıma dön
          </Link>
        </div>
      </div>
    ),
    [workspace],
  );

  if (loadError !== null) {
    return (
      <main className="mx-auto w-full max-w-3xl px-5 py-10">
        <p className="eyebrow">Hakem çalışma alanı</p>
        <h1 className="page-title">Çalışma alanı açılamadı</h1>
        <p
          className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900"
          role="alert"
        >
          {loadError}
        </p>
        <p className="mt-4 text-sm leading-6 text-slate-600">
          Atama kaldırılmış veya bu başvuru için tamamlanmış bir analiz çalışması olmayabilir.
          Atamalarınıza dönüp listeyi yenileyebilirsiniz.
        </p>
        <Link className="secondary-button mt-6" to="/app/review">
          Atamalarıma dön
        </Link>
      </main>
    );
  }

  if (workspace === null) {
    return (
      <main className="mx-auto w-full max-w-3xl px-5 py-10">
        <p className="text-sm text-slate-600" role="status">
          Çalışma alanı yükleniyor…
        </p>
      </main>
    );
  }

  const panelClass = (key: PanelKey) => panelClassName(activePanel, key);

  return (
    <main className="flex min-h-[calc(100vh-4.5rem)] flex-col">
      {header}

      {/* Narrow screens show one pane at a time; every pane stays mounted behind `hidden`. */}
      <fieldset className="flex flex-wrap gap-2 px-4 pt-3 xl:hidden">
        <legend className="sr-only">Görüntülenecek panel</legend>
        <p className="sr-only">
          Geniş ekranda üç panel birlikte açıktır. Bu ekranda bir panel seçilir; seçilmeyen paneller
          açık kalır, girdiğiniz puanlar kaybolmaz.
        </p>
        {PANEL_KEYS.map((key) => (
          <button
            aria-pressed={activePanel === key}
            className={activePanel === key ? "primary-button" : "secondary-button"}
            key={key}
            onClick={() => setActivePanel(key)}
            type="button"
          >
            {PANEL_LABELS[key]}
          </button>
        ))}
      </fieldset>

      <div className="grid min-h-0 flex-1 gap-3 p-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)_minmax(0,1.05fr)]">
        <section aria-labelledby="panel-report-title" className={panelClass("report")}>
          <div className="workspace-pane-heading">
            <h2 className="workspace-pane-title" id="panel-report-title">
              Rapor
            </h2>
            <p className="pane-note">{PANEL_NOTES.report}</p>
          </div>
          <ReportPanel
            onPageChange={(next) => setPage(next)}
            page={page}
            pageCount={pageCount}
            reportPath={`${basePath}/report`}
          />
        </section>

        <section aria-labelledby="panel-ai-title" className={panelClass("ai")}>
          <div className="workspace-pane-heading">
            <h2 className="workspace-pane-title" id="panel-ai-title">
              AI 4. Göz
            </h2>
            <p className="pane-note">{PANEL_NOTES.ai}</p>
          </div>
          <AiPanel onNavigateToPage={navigateToPage} workspace={workspace} />
        </section>

        <section aria-labelledby="panel-rubric-title" className={panelClass("rubric")}>
          <div className="workspace-pane-heading">
            <h2 className="workspace-pane-title" id="panel-rubric-title">
              Hakem Rubriği
            </h2>
            <p className="pane-note">{PANEL_NOTES.rubric}</p>
          </div>
          <RubricPanel
            drafts={drafts}
            isDirty={isDirty}
            isSaving={isSaving}
            onDraftChange={(criterionId, next) => {
              setDrafts((current) => ({ ...current, [criterionId]: next }));
              setIsDirty(true);
              setSaveMessage(null);
            }}
            onNavigateToPage={navigateToPage}
            onOverallNoteChange={(value) => {
              setOverallNote(value);
              setIsDirty(true);
              setSaveMessage(null);
            }}
            onSaveDraft={() => void persist("draft")}
            onSubmit={() => void persist("submit")}
            overallNote={overallNote}
            saveError={saveError}
            saveMessage={saveMessage}
            workspace={workspace}
          />
        </section>
      </div>
    </main>
  );
}
