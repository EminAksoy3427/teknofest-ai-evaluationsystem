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
  CHECK_STATUS_LABELS,
  CHECK_TYPE_LABELS,
  checkStatusClass,
  EVIDENCE_STRENGTH_LABELS,
  languageName,
} from "./analysis-labels";
import { apiRequest, errorMessage } from "./api";
import { Breadcrumb, ManagerStepNav } from "./competition-nav";

function formatFileSize(bytes: number) {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 }).format(bytes / 1024 / 1024);
}

function EvidenceStrength({ strength }: { strength: SemanticEvidenceStrength }) {
  return (
    <p className="mt-2 text-sm font-medium text-slate-700">
      Kanıt Gücü: {EVIDENCE_STRENGTH_LABELS[strength]}
    </p>
  );
}

export function AnalysisResults({ run }: { run: AnalysisRunResponse }) {
  if (run.checks.length === 0) {
    return <p className="mt-2 text-slate-500">Bu tarihsel koşuda ön kontrol sonucu yok.</p>;
  }
  const sectionPresence = run.checks.find((check) => check.type === "SECTION_PRESENCE");
  const sectionTitles = new Map(
    sectionPresence?.details.sections.map((section) => [section.sectionKey, section.expectedTitle]),
  );
  const displaySectionKeys = (keys: readonly string[]) =>
    keys.map((key) => sectionTitles.get(key) ?? key).join(", ");
  return (
    <details className="mt-2 min-w-64 text-slate-700">
      <summary className="cursor-pointer font-semibold text-blue-800">Analiz sonuçları</summary>
      <div className="mt-2 space-y-3">
        {run.checks.map((check) => (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3" key={check.type}>
            <div className="flex items-center justify-between gap-3">
              <span className="font-semibold text-slate-900">{CHECK_TYPE_LABELS[check.type]}</span>
              <span className={`font-semibold ${checkStatusClass(check.status)}`}>
                {CHECK_STATUS_LABELS[check.status]}
              </span>
            </div>
            <p className="mt-1 leading-5 text-slate-600">{check.summary}</p>
            {check.type === "LANGUAGE" ? (
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-slate-600">
                <dt>Beklenen dil</dt>
                <dd className="font-medium text-slate-800">
                  {languageName(check.details.expectedLanguage)}
                </dd>
                <dt>Baskın dil</dt>
                <dd className="font-medium text-slate-800">
                  {languageName(check.details.detectedLanguage)}
                </dd>
              </dl>
            ) : null}
            {check.type === "TEMPLATE_STRUCTURE" ? (
              <ul className="mt-2 space-y-1 text-slate-600">
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
              <ul className="mt-2 space-y-1 text-slate-600">
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
                    className="rounded-md border border-slate-200 bg-white p-2"
                    key={section.sectionKey}
                  >
                    <p className="font-semibold text-slate-800">
                      {section.title} · {section.assessment.replaceAll("_", " ")}
                    </p>
                    <p className="mt-1 text-slate-600">{section.reason}</p>
                    <EvidenceStrength strength={section.evidenceStrength} />
                    {section.evidence.map((evidence) => (
                      <blockquote
                        className="mt-2 border-l-2 border-blue-300 pl-2 text-slate-600"
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
              <div className="mt-2 text-slate-600">
                <p>{check.details.reason}</p>
                <EvidenceStrength strength={check.details.evidenceStrength} />
                {check.details.evidence.map((evidence) => (
                  <blockquote
                    className="mt-2 border-l-2 border-blue-300 pl-2"
                    key={`${evidence.page}-${evidence.excerpt}`}
                  >
                    “{evidence.excerpt}”{" "}
                    <span className="font-semibold">— Sayfa {evidence.page}</span>
                  </blockquote>
                ))}
                <p className="mt-2 font-medium text-slate-700">
                  Bu sinyal kategori değişikliği veya nihai ret kararı değildir.
                </p>
              </div>
            ) : null}
            {check.type === "SIMILARITY" ? (
              <div className="mt-3 text-slate-600">
                <p className="font-semibold text-slate-800">
                  {check.details.level === "HIGH"
                    ? "Yüksek"
                    : check.details.level === "MEDIUM"
                      ? "Orta"
                      : "Düşük"}{" "}
                  benzerlik sinyali
                </p>
                <p className="mt-1 font-medium text-blue-800">
                  {check.details.semanticStatus === "AVAILABLE"
                    ? "Hibrit benzerlik analizi · Lexical + semantik"
                    : check.details.semanticStatus === "DEGRADED"
                      ? "Lexical ön analiz · Semantik analiz bu koşuda tamamlanamadı"
                      : "Lexical ön analiz · Semantik sağlayıcı bağlı değil"}
                </p>
                {check.details.topMatches.map((match) => (
                  <div
                    className="mt-3 rounded-md border border-slate-200 bg-white p-3"
                    key={match.otherSubmissionId}
                  >
                    <p className="font-semibold text-slate-900">
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
                    <p className="mt-1 text-xs">
                      Lexical katkı: {match.lexicalScore.toFixed(2)} · Semantik katkı:{" "}
                      {match.semanticScore === null ? "yok" : match.semanticScore.toFixed(2)}
                    </p>
                    {match.sectionMatches.map((section) => (
                      <div
                        className="mt-3 grid gap-2 lg:grid-cols-2"
                        key={`${section.sectionKey}-${section.otherSectionKey}`}
                      >
                        <blockquote className="border-l-2 border-blue-300 pl-2">
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
                <p className="mt-2 font-medium text-slate-700">
                  Benzerlik bir inceleme sinyalidir; nihai yarışma kararı değildir.
                </p>
              </div>
            ) : null}
            {check.type === "RUBRIC_EVALUATION" ? (
              <div className="mt-3 text-slate-600">
                <p className="font-semibold text-blue-900">
                  Toplam AI önerisi: {check.details.suggestedTotalScore} /{" "}
                  {check.details.maxTotalScore}
                </p>
                <p className="mt-1 font-medium text-slate-700">
                  AI önerisi · Hakem kararı değildir. Nihai puanı yalnız hakem belirler.
                </p>
                <div className="mt-3 space-y-3">
                  {check.details.criteria.map((criterion) => (
                    <div
                      className="rounded-md border border-slate-200 bg-white p-3"
                      key={criterion.criterionId}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-semibold text-slate-900">{criterion.title}</span>
                        <span className="font-semibold text-blue-800">
                          {criterion.suggestedScore} / {criterion.maxScore} (AI önerisi)
                        </span>
                      </div>
                      <EvidenceStrength strength={criterion.evidenceStrength} />
                      <p className="mt-1 leading-5 text-slate-600">{criterion.reason}</p>
                      {criterion.evidence.map((evidence) => (
                        <blockquote
                          className="mt-2 border-l-2 border-blue-300 pl-2"
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
                <div className="mt-3 rounded-md border border-blue-200 bg-blue-50 p-3">
                  <p className="font-semibold text-blue-900">Geliştirme önerisi (AI önerisi)</p>
                  <p className="mt-1 text-slate-700">{check.details.feedbackSummary}</p>
                </div>
                <p className="mt-2 font-medium text-slate-700">
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
  const hasPrechecks = run.checks.length > 0;
  return (
    <div className="text-xs text-emerald-800">
      <p className="font-semibold">
        {run.stage === "RUBRIC_EVALUATION"
          ? "Rubrik önerisiyle analiz tamamlandı"
          : run.stage === "SIMILARITY_CHECKS"
            ? "Benzerlik sinyalleriyle analiz tamamlandı"
            : run.stage === "SEMANTIC_CHECKS"
              ? "Kanıta dayalı analiz tamamlandı"
              : hasPrechecks
                ? "Deterministik ön kontroller tamamlandı"
                : "Metin çıkarımı tamamlandı"}
      </p>
      <p className="mt-1 text-slate-600">
        {run.extraction.pageCount} sayfa · {run.extraction.characterCount} karakter
      </p>
      {run.extraction.warnings.includes("TEXT_SPARSE") ? (
        <p className="mt-1 font-medium text-amber-800">Metin seyrek; OCR gerekebilir.</p>
      ) : null}
      {hasPrechecks ? (
        <AnalysisResults run={run} />
      ) : (
        <p className="mt-2 text-slate-500">Bu tarihsel koşuda ön kontrol sonucu yok.</p>
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
    <div className="overflow-x-auto">
      <table className="w-full min-w-[72rem] border-separate border-spacing-0 text-left text-sm">
        <thead>
          <tr className="text-xs tracking-wide text-slate-500 uppercase">
            <th className="border-b border-slate-200 px-4 py-3 font-semibold">Başvuru</th>
            <th className="border-b border-slate-200 px-4 py-3 font-semibold">Kategori</th>
            <th className="border-b border-slate-200 px-4 py-3 font-semibold">Rapor</th>
            <th className="border-b border-slate-200 px-4 py-3 font-semibold">Yükleme</th>
            <th className="border-b border-slate-200 px-4 py-3 font-semibold">Dosya sinyali</th>
            <th className="border-b border-slate-200 px-4 py-3 font-semibold">Analiz</th>
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
      <Breadcrumb trail={[{ label: "Yarışmalar", to: "/app" }, { label: "Başvurular" }]} />
      <div className="mt-4 max-w-3xl">
        <p className="eyebrow">Özel belge deposu</p>
        <h1 className="page-title">Başvurular</h1>
        <p className="page-lead">
          PDF raporlarını yarışma kapsamında kaydedin; deterministik kontrolleri ve kanıta dayalı
          bölüm içeriği/kategori uyumu sinyallerini başlatın. Yapay zekâ sonuçları karar desteğidir;
          raporlar puanlanmaz ve nihai karar daima insana aittir.
        </p>
      </div>
      <ManagerStepNav competitionId={competitionId} current="submissions" />

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
