import {
  AnalysisRunListResponseSchema,
  type AnalysisRunResponse,
  AnalysisRunResponseSchema,
  CategoryListResponseSchema,
  MAX_SUBMISSION_PDF_BYTES,
  SubmissionListResponseSchema,
  SubmissionResponseSchema,
  type SubmissionSummary,
} from "@teknofest-ai/shared";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router";

import { apiRequest, errorMessage } from "./api";

function formatFileSize(bytes: number) {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 }).format(bytes / 1024 / 1024);
}

function AnalysisStatus({
  run,
  error,
}: {
  run: AnalysisRunResponse | null | undefined;
  error: string | undefined;
}) {
  if (error) return <span className="text-xs font-medium text-red-700">{error}</span>;
  if (!run) return <span className="text-xs font-medium text-slate-500">Henüz başlatılmadı</span>;
  if (run.status === "QUEUED" || run.status === "PROCESSING") {
    return (
      <span
        className="inline-flex items-center gap-2 text-xs font-semibold text-blue-800"
        role="status"
      >
        <span className="h-2 w-2 animate-pulse rounded-full bg-blue-600" />
        Belge işleniyor…
      </span>
    );
  }
  if (run.status === "FAILED") {
    return (
      <div className="max-w-52 text-xs text-red-800" role="alert">
        <p className="font-semibold">Belge işleme başarısız</p>
        <p className="mt-1 leading-5">{run.error?.message ?? "İşlem tamamlanamadı."}</p>
      </div>
    );
  }
  return (
    <div className="text-xs text-emerald-800">
      <p className="font-semibold">Metin çıkarıldı</p>
      <p className="mt-1 text-slate-600">
        {run.extraction.pageCount} sayfa · {run.extraction.characterCount} karakter
      </p>
      {run.extraction.warnings.includes("TEXT_SPARSE") ? (
        <p className="mt-1 font-medium text-amber-800">Metin seyrek; OCR gerekebilir.</p>
      ) : null}
    </div>
  );
}

function SubmissionTable({
  submissions,
  latestRuns,
  analysisErrors,
  startingSubmissionIds,
  onStartAnalysis,
}: {
  submissions: SubmissionSummary[];
  latestRuns: Record<string, AnalysisRunResponse | null>;
  analysisErrors: Record<string, string>;
  startingSubmissionIds: readonly string[];
  onStartAnalysis(submissionId: string): void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[72rem] border-separate border-spacing-0 text-left text-sm">
        <thead>
          <tr className="text-xs tracking-wide text-slate-500 uppercase">
            <th className="border-b border-slate-200 px-4 py-3 font-semibold">Başvuru</th>
            <th className="border-b border-slate-200 px-4 py-3 font-semibold">Kategori</th>
            <th className="border-b border-slate-200 px-4 py-3 font-semibold">Rapor</th>
            <th className="border-b border-slate-200 px-4 py-3 font-semibold">Yükleme</th>
            <th className="border-b border-slate-200 px-4 py-3 font-semibold">Dosya sinyali</th>
            <th className="border-b border-slate-200 px-4 py-3 font-semibold">Belge işleme</th>
            <th className="border-b border-slate-200 px-4 py-3 font-semibold">İşlem</th>
          </tr>
        </thead>
        <tbody>
          {submissions.map((submission) => (
            <tr key={submission.id}>
              <td className="border-b border-slate-100 px-4 py-4 align-top">
                <p className="font-mono text-xs font-semibold text-blue-800">
                  {submission.applicationCode}
                </p>
                <p className="mt-1 font-semibold text-slate-950">{submission.projectTitle}</p>
              </td>
              <td className="border-b border-slate-100 px-4 py-4 align-top">
                <p className="font-medium text-slate-800">{submission.category.name}</p>
                <p className="mt-1 font-mono text-xs text-slate-500">{submission.category.code}</p>
              </td>
              <td className="border-b border-slate-100 px-4 py-4 align-top">
                <p className="max-w-52 truncate font-medium text-slate-800">
                  {submission.file.originalFilename}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {formatFileSize(submission.file.sizeBytes)} MiB
                </p>
              </td>
              <td className="border-b border-slate-100 px-4 py-4 align-top text-slate-600">
                {new Intl.DateTimeFormat("tr-TR", {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(submission.createdAt)}
              </td>
              <td className="border-b border-slate-100 px-4 py-4 align-top">
                {submission.exactDuplicate ? (
                  <span className="inline-flex max-w-48 rounded-lg bg-amber-100 px-3 py-2 text-xs font-semibold leading-5 text-amber-900">
                    Birebir aynı {submission.matchingSubmissionCount} rapor daha var
                  </span>
                ) : (
                  <span className="text-xs font-medium text-slate-500">Birebir eşleşme yok</span>
                )}
              </td>
              <td className="border-b border-slate-100 px-4 py-4 align-top">
                <AnalysisStatus
                  error={analysisErrors[submission.id]}
                  run={latestRuns[submission.id]}
                />
              </td>
              <td className="border-b border-slate-100 px-4 py-4 align-top">
                <div className="flex flex-col items-start gap-2">
                  <a
                    className="secondary-button whitespace-nowrap"
                    href={`/api/v1/competitions/${submission.competitionId}/submissions/${submission.id}/report`}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Raporu aç
                  </a>
                  {latestRuns[submission.id]?.status === "QUEUED" ||
                  latestRuns[submission.id]?.status === "PROCESSING" ? null : (
                    <button
                      className="primary-button whitespace-nowrap"
                      disabled={startingSubmissionIds.includes(submission.id)}
                      onClick={() => onStartAnalysis(submission.id)}
                      type="button"
                    >
                      {startingSubmissionIds.includes(submission.id)
                        ? "Başlatılıyor…"
                        : "Analizi başlat"}
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SubmissionsPage() {
  const { competitionId } = useParams();
  const [submissions, setSubmissions] = useState<SubmissionSummary[] | null>(null);
  const [categories, setCategories] = useState<{ id: string; name: string; code: string }[] | null>(
    null,
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [latestRuns, setLatestRuns] = useState<Record<string, AnalysisRunResponse | null>>({});
  const [analysisErrors, setAnalysisErrors] = useState<Record<string, string>>({});
  const [startingSubmissionIds, setStartingSubmissionIds] = useState<string[]>([]);
  const [applicationCode, setApplicationCode] = useState("");
  const [projectTitle, setProjectTitle] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [report, setReport] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<{
    kind: "success" | "warning" | "error";
    text: string;
  } | null>(null);

  const refreshAnalyses = useCallback(
    async (submissionList: readonly SubmissionSummary[]) => {
      if (!competitionId) return;
      const results = await Promise.all(
        submissionList.map(async (submission) => {
          try {
            const response = await apiRequest(
              `/api/v1/competitions/${competitionId}/submissions/${submission.id}/analysis-runs`,
              AnalysisRunListResponseSchema,
            );
            return { submissionId: submission.id, run: response.runHistory[0] ?? null };
          } catch (error) {
            return { submissionId: submission.id, error: errorMessage(error) };
          }
        }),
      );
      setLatestRuns((current) => {
        const next = { ...current };
        for (const result of results) {
          if (!("error" in result)) next[result.submissionId] = result.run;
        }
        return next;
      });
      setAnalysisErrors(() => {
        const next: Record<string, string> = {};
        for (const result of results) {
          if ("error" in result) next[result.submissionId] = result.error;
        }
        return next;
      });
    },
    [competitionId],
  );

  const refresh = useCallback(async () => {
    if (!competitionId) return;
    try {
      const [submissionResponse, categoryResponse] = await Promise.all([
        apiRequest(
          `/api/v1/competitions/${competitionId}/submissions`,
          SubmissionListResponseSchema,
        ),
        apiRequest(`/api/v1/competitions/${competitionId}/categories`, CategoryListResponseSchema),
      ]);
      setSubmissions(submissionResponse.submissions);
      setCategories(categoryResponse.categories);
      setCategoryId((current) => current || categoryResponse.categories[0]?.id || "");
      setLoadError(null);
      await refreshAnalyses(submissionResponse.submissions);
    } catch (error) {
      setLoadError(errorMessage(error));
    }
  }, [competitionId, refreshAnalyses]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (
      !submissions ||
      !Object.values(latestRuns).some(
        (run) => run?.status === "QUEUED" || run?.status === "PROCESSING",
      )
    ) {
      return;
    }
    const timer = window.setInterval(() => refreshAnalyses(submissions), 3_000);
    return () => window.clearInterval(timer);
  }, [latestRuns, refreshAnalyses, submissions]);

  async function startAnalysis(submissionId: string) {
    if (!competitionId || startingSubmissionIds.includes(submissionId)) return;
    setStartingSubmissionIds((current) => [...current, submissionId]);
    setAnalysisErrors((current) => {
      const next = { ...current };
      delete next[submissionId];
      return next;
    });
    try {
      const started = await apiRequest(
        `/api/v1/competitions/${competitionId}/submissions/${submissionId}/analysis-runs`,
        AnalysisRunResponseSchema,
        { method: "POST" },
      );
      setLatestRuns((current) => ({ ...current, [submissionId]: started }));
    } catch (error) {
      setAnalysisErrors((current) => ({ ...current, [submissionId]: errorMessage(error) }));
    } finally {
      setStartingSubmissionIds((current) => current.filter((id) => id !== submissionId));
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!competitionId || !report || isUploading) return;
    if (report.type !== "application/pdf") {
      setUploadMessage({ kind: "error", text: "Yalnız PDF raporu seçebilirsiniz." });
      return;
    }
    if (report.size === 0 || report.size > MAX_SUBMISSION_PDF_BYTES) {
      setUploadMessage({ kind: "error", text: "PDF raporu boş olmamalı ve 20 MiB’ı aşmamalıdır." });
      return;
    }

    setIsUploading(true);
    setUploadMessage(null);
    const formData = new FormData();
    formData.set("applicationCode", applicationCode);
    formData.set("projectTitle", projectTitle);
    formData.set("categoryId", categoryId);
    formData.set("report", report);
    try {
      const created = await apiRequest(
        `/api/v1/competitions/${competitionId}/submissions`,
        SubmissionResponseSchema,
        { method: "POST", body: formData },
      );
      setUploadMessage(
        created.exactDuplicate
          ? {
              kind: "warning",
              text: "Başvuru kaydedildi. Bu raporla birebir aynı dosya daha önce yüklenmiş.",
            }
          : { kind: "success", text: "Başvuru ve PDF raporu güvenle kaydedildi." },
      );
      setApplicationCode("");
      setProjectTitle("");
      setReport(null);
      const fileInput = form.elements.namedItem("report");
      if (fileInput instanceof HTMLInputElement) fileInput.value = "";
      await refresh();
    } catch (error) {
      setUploadMessage({ kind: "error", text: errorMessage(error) });
    } finally {
      setIsUploading(false);
    }
  }

  if (!competitionId) {
    return <main className="mx-auto max-w-4xl p-8">Yarışma kimliği bulunamadı.</main>;
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-8 sm:py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link className="text-sm font-semibold text-blue-700 hover:text-blue-900" to="/app">
          ← Yarışmalara dön
        </Link>
        <Link className="secondary-button" to={`/app/competitions/${competitionId}/setup`}>
          Yarışma yapılandırması
        </Link>
      </div>
      <div className="mt-6 max-w-3xl">
        <p className="eyebrow">Özel belge deposu</p>
        <h1 className="page-title">Başvurular</h1>
        <p className="page-lead">
          PDF raporlarını yarışma kapsamında kaydedin ve sayfa kimliğini koruyan metin çıkarımını
          başlatın. Bu aşamada raporlar puanlanmaz veya semantik olarak değerlendirilmez.
        </p>
      </div>

      <section aria-labelledby="upload-title" className="setup-panel mt-8">
        <h2 className="section-title" id="upload-title">
          Yeni başvuru yükle
        </h2>
        <p className="mt-2 text-sm text-slate-600">Yalnız PDF · En fazla 20 MiB</p>
        <form className="mt-6 grid gap-5 lg:grid-cols-2" onSubmit={submit}>
          <div>
            <label className="field-label" htmlFor="application-code">
              Başvuru kodu
            </label>
            <input
              className="field-input"
              id="application-code"
              maxLength={80}
              onChange={(event) => setApplicationCode(event.target.value)}
              required
              value={applicationCode}
            />
          </div>
          <div>
            <label className="field-label" htmlFor="project-title">
              Proje başlığı
            </label>
            <input
              className="field-input"
              id="project-title"
              maxLength={240}
              onChange={(event) => setProjectTitle(event.target.value)}
              required
              value={projectTitle}
            />
          </div>
          <div>
            <label className="field-label" htmlFor="submission-category">
              Kategori
            </label>
            <select
              className="field-input"
              disabled={!categories?.length}
              id="submission-category"
              onChange={(event) => setCategoryId(event.target.value)}
              required
              value={categoryId}
            >
              {categories?.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name} ({category.code})
                </option>
              ))}
            </select>
            {categories?.length === 0 ? (
              <p className="field-help text-amber-800">
                Önce yarışma yapılandırmasında kategori oluşturun.
              </p>
            ) : null}
          </div>
          <div>
            <label className="field-label" htmlFor="submission-report">
              PDF raporu
            </label>
            <input
              accept="application/pdf,.pdf"
              className="field-input"
              id="submission-report"
              name="report"
              onChange={(event) => setReport(event.target.files?.[0] ?? null)}
              required
              type="file"
            />
          </div>
          <div className="flex flex-wrap items-center gap-4 lg:col-span-2">
            <button
              className="primary-button"
              disabled={isUploading || !categories?.length}
              type="submit"
            >
              {isUploading ? "Rapor yükleniyor…" : "Başvuruyu kaydet"}
            </button>
            {uploadMessage ? (
              <p
                className={
                  uploadMessage.kind === "error"
                    ? "text-sm font-medium text-red-700"
                    : uploadMessage.kind === "warning"
                      ? "text-sm font-medium text-amber-800"
                      : "text-sm font-medium text-emerald-700"
                }
                role={uploadMessage.kind === "error" ? "alert" : "status"}
              >
                {uploadMessage.text}
              </p>
            ) : null}
          </div>
        </form>
      </section>

      <section aria-labelledby="list-title" className="setup-panel mt-8">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Yarışma kapsamı</p>
            <h2 className="section-title" id="list-title">
              Yüklenen başvurular
            </h2>
          </div>
          <button className="secondary-button" onClick={() => refresh()} type="button">
            Yenile
          </button>
        </div>
        {loadError ? (
          <div
            className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
            role="alert"
          >
            <p>{loadError}</p>
            <button className="secondary-button mt-3" onClick={() => refresh()} type="button">
              Tekrar dene
            </button>
          </div>
        ) : null}
        {submissions === null && !loadError ? (
          <p className="mt-6 text-sm text-slate-600" role="status">
            Başvurular yükleniyor…
          </p>
        ) : null}
        {submissions?.length === 0 ? (
          <div className="empty-state mt-6">Henüz PDF raporu yüklenmiş bir başvuru yok.</div>
        ) : null}
        {submissions && submissions.length > 0 ? (
          <div className="mt-6">
            <SubmissionTable
              analysisErrors={analysisErrors}
              latestRuns={latestRuns}
              onStartAnalysis={startAnalysis}
              startingSubmissionIds={startingSubmissionIds}
              submissions={submissions}
            />
          </div>
        ) : null}
      </section>
    </main>
  );
}
