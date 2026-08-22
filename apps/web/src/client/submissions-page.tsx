import {
  AnalysisRunListResponseSchema,
  type AnalysisRunResponse,
  AnalysisRunResponseSchema,
  CategoryListResponseSchema,
  MAX_SUBMISSION_PDF_BYTES,
  type SemanticEvidenceStrength,
  SIMILARITY_HIGH_THRESHOLD,
  SIMILARITY_MEDIUM_THRESHOLD,
  SubmissionListResponseSchema,
  SubmissionResponseSchema,
  type SubmissionSummary,
} from "@teknofest-ai/shared";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router";

import {
  ANALYSIS_RUN_STATUS_LABELS,
  analysisProgressLabel,
  analysisRunStatusChipClass,
  CHECK_STATUS_LABELS,
  CHECK_TYPE_LABELS,
  checkStatusClass,
  EVIDENCE_STRENGTH_LABELS,
  languageName,
  SIMILARITY_SEMANTIC_STATUS_LABELS,
} from "./analysis-labels";
import { apiRequest, errorMessage } from "./api";
import { Breadcrumb } from "./competition-nav";
import { Alert, EmptyState, FileDropzone, MetricCard, Modal, PageHeader } from "./ui";

function EvidenceStrength({ strength }: { strength: SemanticEvidenceStrength }) {
  return (
    <p className="mt-2 text-sm font-medium text-ink-muted">
      Kanıt Gücü: {EVIDENCE_STRENGTH_LABELS[strength]}
    </p>
  );
}

export function AnalysisResults({ run }: { run: AnalysisRunResponse }) {
  if (run.checks.length === 0) {
    return <p className="mt-2 text-ink-subtle">Bu tarihsel koşuda ön kontrol sonucu yok.</p>;
  }
  const sectionPresence = run.checks.find((check) => check.type === "SECTION_PRESENCE");
  const sectionTitles = new Map(
    sectionPresence?.details.sections.map((section) => [section.sectionKey, section.expectedTitle]),
  );
  const displaySectionKeys = (keys: readonly string[]) =>
    keys.map((key) => sectionTitles.get(key) ?? key).join(", ");
  return (
    <details className="mt-2 min-w-64 text-ink-muted">
      <summary className="cursor-pointer font-medium text-brand-deep">Analiz sonuçları</summary>
      <div className="mt-2 space-y-3">
        {run.checks.map((check) => (
          <div className="rounded-md border border-line bg-surface-raised p-3" key={check.type}>
            <div className="flex items-center justify-between gap-3">
              <span className="font-semibold text-ink">{CHECK_TYPE_LABELS[check.type]}</span>
              <span className={`font-semibold ${checkStatusClass(check.status)}`}>
                {CHECK_STATUS_LABELS[check.status]}
              </span>
            </div>
            <p className="mt-1 leading-5 text-ink-muted">{check.summary}</p>
            {check.type === "LANGUAGE" ? (
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-ink-muted">
                <dt>Beklenen dil</dt>
                <dd className="font-medium text-ink">
                  {languageName(check.details.expectedLanguage)}
                </dd>
                <dt>Baskın dil</dt>
                <dd className="font-medium text-ink">
                  {languageName(check.details.detectedLanguage)}
                </dd>
              </dl>
            ) : null}
            {check.type === "TEMPLATE_STRUCTURE" ? (
              <ul className="mt-2 space-y-1 text-ink-muted">
                {check.details.missingRequiredSectionKeys.length > 0 ? (
                  <li>
                    Eksik zorunlu başlık:{" "}
                    {displaySectionKeys(check.details.missingRequiredSectionKeys)}
                  </li>
                ) : null}
                {check.details.orderDeviation ? <li>Bölüm sırası şablondan farklı.</li> : null}
                {check.details.duplicateHeadingKeys.length > 0 ? (
                  <li>
                    Tekrarlanan başlık: {displaySectionKeys(check.details.duplicateHeadingKeys)}
                  </li>
                ) : null}
              </ul>
            ) : null}
            {check.type === "SECTION_PRESENCE" ? (
              <ul className="mt-2 space-y-1 text-ink-muted">
                {check.details.sections.map((section) => (
                  <li key={section.sectionKey}>
                    {section.expectedTitle}:{" "}
                    {section.found
                      ? `Bulundu · Sayfa ${section.pageNumber}`
                      : section.required
                        ? "Eksik"
                        : "İsteğe bağlı · Bulunamadı"}
                  </li>
                ))}
              </ul>
            ) : null}
            {check.type === "SECTION_CONTENT" ? (
              <div className="mt-3 space-y-3">
                {check.details.sections.map((section) => (
                  <div
                    className="rounded-md border border-line bg-surface p-2"
                    key={section.sectionKey}
                  >
                    <p className="font-semibold text-ink">
                      {section.title} · {section.assessment.replaceAll("_", " ")}
                    </p>
                    <p className="mt-1 text-ink-muted">{section.reason}</p>
                    <EvidenceStrength strength={section.evidenceStrength} />
                    {section.evidence.map((evidence) => (
                      <blockquote
                        className="mt-2 border-l-2 border-brand-border pl-2 text-ink-muted"
                        key={`${evidence.page}-${evidence.excerpt}`}
                      >
                        “{evidence.excerpt}”{" "}
                        <span className="font-semibold">— Sayfa {evidence.page}</span>
                      </blockquote>
                    ))}
                  </div>
                ))}
              </div>
            ) : null}
            {check.type === "CATEGORY_FIT" ? (
              <div className="mt-2 text-ink-muted">
                <p>{check.details.reason}</p>
                <EvidenceStrength strength={check.details.evidenceStrength} />
                {check.details.evidence.map((evidence) => (
                  <blockquote
                    className="mt-2 border-l-2 border-brand-border pl-2"
                    key={`${evidence.page}-${evidence.excerpt}`}
                  >
                    “{evidence.excerpt}”{" "}
                    <span className="font-semibold">— Sayfa {evidence.page}</span>
                  </blockquote>
                ))}
                <p className="mt-2 font-medium text-ink">
                  Bu sinyal kategori değişikliği veya nihai ret kararı değildir.
                </p>
              </div>
            ) : null}
            {check.type === "SIMILARITY" ? (
              <div className="mt-3 text-ink-muted">
                <p className="font-semibold text-ink">
                  {check.details.level === "HIGH"
                    ? "Yüksek"
                    : check.details.level === "MEDIUM"
                      ? "Orta"
                      : "Düşük"}{" "}
                  benzerlik sinyali
                </p>
                <p className="mt-1 font-medium text-brand-deep">
                  {SIMILARITY_SEMANTIC_STATUS_LABELS[check.details.semanticStatus]}
                </p>
                {check.details.topMatches.map((match) => (
                  <div
                    className="mt-3 rounded-md border border-line bg-white p-3"
                    key={match.otherSubmissionId}
                  >
                    <p className="font-semibold text-ink">
                      {match.applicationCode} · {match.projectTitle}
                    </p>
                    <p className="mt-1">
                      Sinyal düzeyi:{" "}
                      {match.combinedScore >= SIMILARITY_HIGH_THRESHOLD
                        ? "Yüksek"
                        : match.combinedScore >= SIMILARITY_MEDIUM_THRESHOLD
                          ? "Orta"
                          : "Düşük"}
                      {match.exactDocumentMatch ? " · Birebir belge eşleşmesi" : ""}
                    </p>
                    <p className="mt-1 text-xs text-ink-subtle">
                      Metin katkısı: {match.lexicalScore.toFixed(2)}
                      {match.semanticScore === null
                        ? ""
                        : ` · Anlam katkısı: ${match.semanticScore.toFixed(2)}`}
                    </p>
                    {match.sectionMatches.map((section) => (
                      <div
                        className="mt-3 grid gap-2 lg:grid-cols-2"
                        key={`${section.sectionKey}-${section.otherSectionKey}`}
                      >
                        <blockquote className="border-l-2 border-brand-border pl-2">
                          <span className="font-semibold">
                            {section.sectionTitle} · Sayfa {section.sourcePage}
                          </span>
                          <br />“{section.sourceExcerpt}”
                        </blockquote>
                        <blockquote className="border-l-2 border-amber-300 pl-2">
                          <span className="font-semibold">
                            {section.otherSectionTitle} · Sayfa {section.otherPage}
                          </span>
                          <br />“{section.otherExcerpt}”
                        </blockquote>
                      </div>
                    ))}
                  </div>
                ))}
                {check.details.level === "HIGH" ? (
                  <p className="mt-3 font-semibold text-amber-800">Uzman incelemesi önerilir.</p>
                ) : null}
                <p className="mt-2 font-medium text-ink">
                  Benzerlik bir inceleme sinyalidir; nihai yarışma kararı değildir.
                </p>
              </div>
            ) : null}
            {check.type === "RUBRIC_EVALUATION" ? (
              <div className="mt-3 text-ink-muted">
                <p className="font-semibold text-brand-deep">
                  Toplam AI önerisi: {check.details.suggestedTotalScore} /{" "}
                  {check.details.maxTotalScore}
                </p>
                <p className="mt-1 font-medium text-ink">
                  AI önerisi · Hakem kararı değildir. Nihai puanı yalnız hakem belirler.
                </p>
                <div className="mt-3 space-y-3">
                  {check.details.criteria.map((criterion) => (
                    <div
                      className="rounded-md border border-line bg-white p-3"
                      key={criterion.criterionId}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-semibold text-ink">{criterion.title}</span>
                        <span className="font-semibold text-brand-deep">
                          {criterion.suggestedScore} / {criterion.maxScore} (AI önerisi)
                        </span>
                      </div>
                      <EvidenceStrength strength={criterion.evidenceStrength} />
                      <p className="mt-1 leading-5 text-ink-muted">{criterion.reason}</p>
                      {criterion.evidence.map((evidence) => (
                        <blockquote
                          className="mt-2 border-l-2 border-brand-border pl-2"
                          key={`${evidence.page}-${evidence.excerpt}`}
                        >
                          “{evidence.excerpt}”{" "}
                          <span className="font-semibold">— Sayfa {evidence.page}</span>
                        </blockquote>
                      ))}
                      {criterion.missingPoints.length > 0 ? (
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-amber-800">
                          {criterion.missingPoints.map((point) => (
                            <li key={point}>{point}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ))}
                </div>
                <div className="mt-3 rounded-md border border-brand-border bg-brand-soft p-3">
                  <p className="font-semibold text-brand-deep">Geliştirme önerisi (AI önerisi)</p>
                  <p className="mt-1 text-ink">{check.details.feedbackSummary}</p>
                </div>
                <p className="mt-2 font-medium text-ink">
                  Rubrik puanları bir AI önerisidir; hakem kararı veya nihai puan değildir.
                </p>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </details>
  );
}

function AnalysisStatus({
  run,
  error,
}: {
  run: AnalysisRunResponse | null | undefined;
  error: string | undefined;
}) {
  if (error) return <span className="text-xs font-medium text-critical">{error}</span>;
  if (!run) {
    return <span className="status-chip status-chip-neutral">Analiz başlatılmadı</span>;
  }
  const label = analysisProgressLabel(run.status, run.stage);
  if (run.status === "QUEUED" || run.status === "PROCESSING") {
    return (
      <span className="inline-flex items-center gap-2" role="status">
        <span className={`status-chip ${analysisRunStatusChipClass(run.status)}`}>{label}</span>
      </span>
    );
  }
  if (run.status === "FAILED") {
    return (
      <div className="max-w-56 text-xs text-critical" role="alert">
        <span className="status-chip status-chip-fail">{label}</span>
        <p className="mt-1.5 leading-5">
          {run.error?.message ?? ANALYSIS_RUN_STATUS_LABELS.FAILED}
        </p>
      </div>
    );
  }
  const hasPrechecks = run.checks.length > 0;
  return (
    <div className="text-xs">
      <span className={`status-chip ${analysisRunStatusChipClass(run.status)}`}>{label}</span>
      {run.extraction.warnings.includes("TEXT_SPARSE") ? (
        <p className="mt-1.5 font-medium text-warning-ink">Metin seyrek; OCR gerekebilir.</p>
      ) : null}
      {hasPrechecks ? (
        <AnalysisResults run={run} />
      ) : (
        <p className="mt-1.5 text-ink-subtle">Bu analizde ayrıntılı kontrol sonucu yok.</p>
      )}
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
    <div className="table-scroll">
      <table className="data-table min-w-[64rem]">
        <caption className="sr-only">Yarışma başvuruları ve analiz durumları</caption>
        <thead>
          <tr>
            <th scope="col">Başvuru</th>
            <th scope="col">Kategori</th>
            <th scope="col">Analiz</th>
            <th scope="col">İşlem</th>
          </tr>
        </thead>
        <tbody>
          {submissions.map((submission) => (
            <tr key={submission.id}>
              <td>
                <p className="font-mono text-xs font-bold text-brand">
                  {submission.applicationCode}
                </p>
                <p className="mt-1 font-semibold text-ink">{submission.projectTitle}</p>
                {submission.exactDuplicate ? (
                  <p className="mt-1 text-xs text-warning-ink">
                    Birebir aynı {submission.matchingSubmissionCount} rapor daha var
                  </p>
                ) : null}
              </td>
              <td>
                <p className="font-medium text-ink">{submission.category.name}</p>
              </td>
              <td>
                <AnalysisStatus
                  error={analysisErrors[submission.id]}
                  run={latestRuns[submission.id]}
                />
              </td>
              <td>
                <div className="flex flex-col items-start gap-2">
                  <a
                    className="secondary-button whitespace-nowrap"
                    href={`/api/v1/competitions/${submission.competitionId}/submissions/${submission.id}/report`}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Raporu aç
                  </a>
                  <Link
                    className="secondary-button whitespace-nowrap"
                    to={`/app/competitions/${submission.competitionId}/submissions/${submission.id}/participants`}
                  >
                    Katılımcılar
                  </Link>
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
                        : latestRuns[submission.id]
                          ? "Analizi yeniden başlat"
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
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [search, setSearch] = useState("");
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
      setIsUploadOpen(false);
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
    return <div className="mx-auto max-w-4xl">Yarışma kimliği bulunamadı.</div>;
  }

  const query = search.trim().toLocaleLowerCase("tr-TR");
  const visible = (submissions ?? []).filter((submission) => {
    if (!query) return true;
    return (
      submission.applicationCode.toLocaleLowerCase("tr-TR").includes(query) ||
      submission.projectTitle.toLocaleLowerCase("tr-TR").includes(query) ||
      submission.category.name.toLocaleLowerCase("tr-TR").includes(query)
    );
  });
  const readyCount = (submissions ?? []).filter(
    (submission) => latestRuns[submission.id]?.status === "SUCCEEDED",
  ).length;

  return (
    <div className="layout-wide">
      <Breadcrumb trail={[{ label: "Genel Bakış", to: "/app" }, { label: "Başvurular" }]} />
      <div className="mt-4">
        <PageHeader
          actions={
            <button className="primary-button" onClick={() => setIsUploadOpen(true)} type="button">
              Başvuru yükle
            </button>
          }
          lead="Başvuru kodu, proje adı ve analiz durumunu buradan izleyin."
          title="Başvurular"
        />
      </div>

      {submissions && submissions.length > 0 ? (
        <div className="metrics-strip mt-6 sm:grid-cols-3">
          <MetricCard label="Başvurular" value={String(submissions.length)} />
          <MetricCard label="Analizi tamamlanan" value={String(readyCount)} />
          <MetricCard
            label="Analiz bekleyen"
            tone={submissions.length - readyCount > 0 ? "warn" : "neutral"}
            value={String(submissions.length - readyCount)}
          />
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap items-end gap-3">
        <div className="min-w-64 flex-1">
          <label className="field-label" htmlFor="submission-search">
            Ara
          </label>
          <input
            className="field-input"
            id="submission-search"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Başvuru kodu, proje adı veya kategori"
            type="search"
            value={search}
          />
        </div>
        <button className="secondary-button" onClick={() => refresh()} type="button">
          Yenile
        </button>
      </div>

      {uploadMessage ? (
        <p
          className={
            uploadMessage.kind === "error"
              ? "mt-4 text-sm font-medium text-critical"
              : uploadMessage.kind === "warning"
                ? "mt-4 text-sm font-medium text-warning-ink"
                : "mt-4 text-sm font-medium text-success-ink"
          }
          role={uploadMessage.kind === "error" ? "alert" : "status"}
        >
          {uploadMessage.text}
        </p>
      ) : null}

      {loadError ? (
        <div className="mt-6">
          <Alert tone="error">
            <p>{loadError}</p>
            <button className="secondary-button mt-3" onClick={() => refresh()} type="button">
              Tekrar dene
            </button>
          </Alert>
        </div>
      ) : null}

      {submissions === null && !loadError ? (
        <p className="mt-6 text-sm text-ink-muted" role="status">
          Başvurular yükleniyor…
        </p>
      ) : null}

      {submissions?.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            action={
              <button
                className="primary-button"
                onClick={() => setIsUploadOpen(true)}
                type="button"
              >
                Başvuru yükle
              </button>
            }
            description="İlk başvuruyu yüklediğinizde analiz başlatılabilir ve hakem ataması yapılabilir."
            title="Henüz başvuru yok"
          />
        </div>
      ) : null}

      {submissions && submissions.length > 0 && visible.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            description="Aramayı temizleyerek tüm başvuruları görebilirsiniz."
            title="Aramanıza uyan başvuru yok"
          />
        </div>
      ) : null}

      {visible.length > 0 ? (
        <div className="mt-6">
          <SubmissionTable
            analysisErrors={analysisErrors}
            latestRuns={latestRuns}
            onStartAnalysis={startAnalysis}
            startingSubmissionIds={startingSubmissionIds}
            submissions={visible}
          />
        </div>
      ) : null}

      {isUploadOpen ? (
        <Modal labelledBy="upload-title" onClose={() => setIsUploadOpen(false)}>
          <h2 className="section-title" id="upload-title">
            Başvuru yükle
          </h2>
          <p className="mt-1 text-sm text-ink-muted">Yalnız PDF · En fazla 20 MiB</p>
          <form className="mt-5 grid gap-4" onSubmit={submit}>
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
                Proje adı
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
                    {category.name}
                  </option>
                ))}
              </select>
              {categories?.length === 0 ? (
                <p className="field-help text-warning-ink">Önce kurulumda kategori ekleyin.</p>
              ) : null}
            </div>
            <FileDropzone
              file={report}
              id="submission-report"
              label="PDF raporu"
              name="report"
              onFile={setReport}
              required
            />
            <div className="flex flex-wrap items-center gap-3">
              <button
                className="primary-button"
                disabled={isUploading || !categories?.length}
                type="submit"
              >
                {isUploading ? "Yükleniyor…" : "Başvuruyu kaydet"}
              </button>
              <button
                className="secondary-button"
                onClick={() => setIsUploadOpen(false)}
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
