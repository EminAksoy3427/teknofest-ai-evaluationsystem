import {
  type ReviewerWorkspaceResponse,
  ReviewerWorkspaceResponseSchema,
} from "@teknofest-ai/shared";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";

import { apiRequest, errorMessage } from "./api";
import { AiPanel } from "./review/ai-panel";
import { clampPage } from "./review/evidence-navigation";
import { ReportPanel } from "./review/report-panel";
import { type CriterionDraft, RubricPanel } from "./review/rubric-panel";

type PanelKey = "report" | "ai" | "rubric";

const PANEL_LABELS: Record<PanelKey, string> = {
  report: "Rapor",
  ai: "AI 4. Göz",
  rubric: "Hakem Rubriği",
};

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
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <div className="min-w-0">
          <p className="eyebrow">Hakem çalışma alanı</p>
          <h1 className="mt-1 truncate text-xl font-bold tracking-tight text-slate-950">
            {workspace ? workspace.submission.projectTitle : "Değerlendirme"}
          </h1>
          {workspace ? (
            <p className="mt-0.5 text-sm text-slate-600">
              {workspace.submission.applicationCode} · {workspace.submission.category.name}
            </p>
          ) : null}
        </div>
        <Link className="secondary-button" to="/app/review">
          Kuyruğa dön
        </Link>
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
        <Link className="secondary-button mt-6" to="/app/review">
          Kuyruğa dön
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

  const panelClass = (key: PanelKey) =>
    `${activePanel === key ? "flex" : "hidden"} min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm xl:flex`;

  return (
    <main className="flex min-h-[calc(100vh-4.5rem)] flex-col">
      {header}

      {/* Narrow screens show one pane at a time; every pane stays mounted behind `hidden`. */}
      <fieldset className="flex flex-wrap gap-2 px-4 pt-3 xl:hidden">
        <legend className="sr-only">Görüntülenecek panel</legend>
        {(Object.keys(PANEL_LABELS) as PanelKey[]).map((key) => (
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
          <h2
            className="border-b border-slate-200 px-3 py-2 text-sm font-bold text-slate-950"
            id="panel-report-title"
          >
            Rapor
          </h2>
          <ReportPanel
            onPageChange={(next) => setPage(next)}
            page={page}
            pageCount={pageCount}
            reportPath={`${basePath}/report`}
          />
        </section>

        <section aria-labelledby="panel-ai-title" className={panelClass("ai")}>
          <h2
            className="border-b border-slate-200 px-3 py-2 text-sm font-bold text-slate-950"
            id="panel-ai-title"
          >
            AI 4. Göz
          </h2>
          <AiPanel onNavigateToPage={navigateToPage} workspace={workspace} />
        </section>

        <section aria-labelledby="panel-rubric-title" className={panelClass("rubric")}>
          <h2
            className="border-b border-slate-200 px-3 py-2 text-sm font-bold text-slate-950"
            id="panel-rubric-title"
          >
            Hakem Rubriği
          </h2>
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
