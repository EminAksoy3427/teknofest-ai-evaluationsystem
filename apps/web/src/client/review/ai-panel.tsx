import type {
  AnalysisCheckResponse,
  AnalysisRunResponse,
  ReviewerWorkspaceResponse,
  SemanticEvidenceStrength,
} from "@teknofest-ai/shared";
import type { ReactNode } from "react";

import {
  CHECK_STATUS_LABELS,
  CHECK_TYPE_LABELS,
  checkStatusChipClass,
  EVIDENCE_STRENGTH_LABELS,
  languageName,
  SIMILARITY_LEVEL_LABELS,
  SIMILARITY_SEMANTIC_STATUS_LABELS,
} from "../analysis-labels";
import { EvidenceQuote } from "./evidence-link";

interface AiPanelProps {
  workspace: ReviewerWorkspaceResponse;
  onNavigateToPage(page: number): void;
}

function EvidenceStrength({ strength }: { strength: SemanticEvidenceStrength }) {
  return (
    <p className="mt-1 text-sm font-medium text-slate-700">
      Kanıt gücü: {EVIDENCE_STRENGTH_LABELS[strength]}
    </p>
  );
}

function CheckCard({ check, children }: { check: AnalysisCheckResponse; children?: ReactNode }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-bold text-slate-950">{CHECK_TYPE_LABELS[check.type]}</h4>
        <span className={`status-chip ${checkStatusChipClass(check.status)}`}>
          {CHECK_STATUS_LABELS[check.status]}
        </span>
      </div>
      <p className="mt-1 text-sm leading-6 text-slate-600">{check.summary}</p>
      {children}
    </article>
  );
}

function PanelGroup({
  id,
  title,
  note,
  children,
}: {
  id: string;
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="mt-4 first:mt-0">
      <h3 className="text-xs font-bold tracking-[0.16em] text-blue-800 uppercase" id={id}>
        {title}
      </h3>
      {note ? <p className="mt-1 text-xs leading-5 text-slate-500">{note}</p> : null}
      <div className="mt-2 space-y-2">{children}</div>
    </section>
  );
}

function findCheck<T extends AnalysisCheckResponse["type"]>(
  run: AnalysisRunResponse,
  type: T,
): Extract<AnalysisCheckResponse, { type: T }> | undefined {
  return run.checks.find((check) => check.type === type) as
    | Extract<AnalysisCheckResponse, { type: T }>
    | undefined;
}

/**
 * Centre pane: "AI 4. Göz".
 *
 * Everything shown here was persisted by an earlier AnalysisRun. Opening the workspace, clicking a
 * page, changing a score, saving a draft or submitting never triggers a model call — the panel is a
 * pure read of the run this workspace is pinned to.
 */
export function AiPanel({ workspace, onNavigateToPage }: AiPanelProps) {
  const run = workspace.analysisRun;
  const pageCount = run.extraction.pageCount;

  if (run.status === "FAILED") {
    return (
      <div className="p-4">
        <p
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          role="alert"
        >
          Bu başvurunun analiz çalışması tamamlanamadı
          {run.error ? `: ${run.error.message}` : "."} Değerlendirmenizi raporu doğrudan okuyarak
          yapabilirsiniz; yapay zekâ desteği bu koşuda kullanılamıyor.
        </p>
      </div>
    );
  }

  if (run.checks.length === 0) {
    return (
      <div className="p-4">
        <p className="empty-state">
          Bu analiz çalışmasında kayıtlı bir kontrol sonucu yok. Rapor panelinden inceleyip rubriği
          doğrudan puanlayabilirsiniz.
        </p>
      </div>
    );
  }

  const language = findCheck(run, "LANGUAGE");
  const templateStructure = findCheck(run, "TEMPLATE_STRUCTURE");
  const sectionPresence = findCheck(run, "SECTION_PRESENCE");
  const sectionContent = findCheck(run, "SECTION_CONTENT");
  const categoryFit = findCheck(run, "CATEGORY_FIT");
  const similarity = findCheck(run, "SIMILARITY");
  const rubric = findCheck(run, "RUBRIC_EVALUATION");

  const sectionTitles = new Map(
    sectionPresence?.details.sections.map((section) => [section.sectionKey, section.expectedTitle]),
  );
  const sectionTitleList = (keys: readonly string[]) =>
    keys.map((key) => sectionTitles.get(key) ?? key).join(", ");

  return (
    <div className="min-h-0 min-w-0 overflow-y-auto p-3">
      <p className="rounded-lg border border-blue-200 bg-blue-50 p-2.5 text-xs leading-5 text-blue-900">
        Bu panel daha önce kaydedilmiş analiz sonuçlarını gösterir. Yapay zekâ karar vermez; kararı
        hakem verir. Alıntıların yanındaki sayfa bağlantıları raporu ilgili sayfaya götürür.
      </p>

      <PanelGroup id="ai-group-deterministic" title="Deterministik">
        {language ? (
          <CheckCard check={language}>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm text-slate-600">
              <dt>Beklenen dil</dt>
              <dd className="font-medium text-slate-800">
                {languageName(language.details.expectedLanguage)}
              </dd>
              <dt>Baskın dil</dt>
              <dd className="font-medium text-slate-800">
                {languageName(language.details.detectedLanguage)}
              </dd>
            </dl>
          </CheckCard>
        ) : null}
        {templateStructure ? (
          <CheckCard check={templateStructure}>
            <ul className="mt-2 space-y-1 text-sm text-slate-600">
              {templateStructure.details.missingRequiredSectionKeys.length > 0 ? (
                <li>
                  Eksik zorunlu başlık:{" "}
                  {sectionTitleList(templateStructure.details.missingRequiredSectionKeys)}
                </li>
              ) : null}
              {templateStructure.details.orderDeviation ? (
                <li>Bölüm sırası şablondan farklı.</li>
              ) : null}
              {templateStructure.details.duplicateHeadingKeys.length > 0 ? (
                <li>
                  Tekrarlanan başlık:{" "}
                  {sectionTitleList(templateStructure.details.duplicateHeadingKeys)}
                </li>
              ) : null}
            </ul>
          </CheckCard>
        ) : null}
        {!language && !templateStructure && !sectionPresence ? (
          <p className="empty-state">Bu koşuda deterministik kontrol sonucu kaydedilmedi.</p>
        ) : null}
        {sectionPresence ? (
          <CheckCard check={sectionPresence}>
            <ul className="mt-2 space-y-1 text-sm text-slate-600">
              {sectionPresence.details.sections.map((section) => (
                <li className="flex flex-wrap items-baseline gap-1" key={section.sectionKey}>
                  <span className="font-medium text-slate-800">{section.expectedTitle}:</span>
                  {section.found && section.pageNumber !== null ? (
                    <>
                      <span>Bulundu ·</span>
                      <button
                        className="evidence-link"
                        onClick={() => onNavigateToPage(section.pageNumber as number)}
                        type="button"
                      >
                        Sayfa {section.pageNumber}
                      </button>
                    </>
                  ) : (
                    <span>{section.required ? "Eksik" : "İsteğe bağlı · bulunamadı"}</span>
                  )}
                </li>
              ))}
            </ul>
          </CheckCard>
        ) : null}
      </PanelGroup>

      <PanelGroup
        id="ai-group-semantic"
        note="Başlığın var olması bölümün beklenen içeriği taşıdığını kanıtlamaz; bu iki kontrol içeriği ayrıca değerlendirir."
        title="Semantik"
      >
        {sectionContent ? (
          <CheckCard check={sectionContent}>
            <div className="mt-2 space-y-2">
              {sectionContent.details.sections.map((section) => (
                <div
                  className="rounded-lg border border-slate-200 bg-slate-50 p-2.5"
                  key={section.sectionKey}
                >
                  <p className="text-sm font-semibold text-slate-800">{section.title}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">{section.reason}</p>
                  <EvidenceStrength strength={section.evidenceStrength} />
                  {section.evidence.map((evidence) => (
                    <EvidenceQuote
                      evidence={evidence}
                      key={`${evidence.page}-${evidence.excerpt}`}
                      onNavigate={onNavigateToPage}
                      pageCount={pageCount}
                    />
                  ))}
                </div>
              ))}
            </div>
          </CheckCard>
        ) : null}
        {!sectionContent && !categoryFit ? (
          <p className="empty-state">
            Bu koşuda kanıt doğrulamalı semantik kontrol sonucu kaydedilmedi.
          </p>
        ) : null}
        {categoryFit ? (
          <CheckCard check={categoryFit}>
            <p className="mt-2 text-sm leading-6 text-slate-600">{categoryFit.details.reason}</p>
            <EvidenceStrength strength={categoryFit.details.evidenceStrength} />
            {categoryFit.details.evidence.map((evidence) => (
              <EvidenceQuote
                evidence={evidence}
                key={`${evidence.page}-${evidence.excerpt}`}
                onNavigate={onNavigateToPage}
                pageCount={pageCount}
              />
            ))}
            <p className="mt-2 text-xs font-medium text-slate-600">
              Bu sinyal kategori değişikliği veya nihai ret kararı değildir.
            </p>
          </CheckCard>
        ) : null}
      </PanelGroup>

      <PanelGroup
        id="ai-group-similarity"
        note="Benzerlik bir inceleme sinyalidir; intihal tespiti, kopya kararı veya nihai yarışma kararı değildir. Birebir eşleşme de bunu değiştirmez."
        title="Benzerlik"
      >
        {similarity ? (
          <CheckCard check={similarity}>
            <p className="mt-2 text-sm font-semibold text-slate-800">
              {SIMILARITY_LEVEL_LABELS[similarity.details.level]} benzerlik sinyali
            </p>
            <p className="mt-1 text-xs font-medium text-blue-800">
              {SIMILARITY_SEMANTIC_STATUS_LABELS[similarity.details.semanticStatus]}
            </p>
          </CheckCard>
        ) : null}
        {workspace.similarity.length === 0 ? (
          <p className="empty-state">
            Bu koşuda dikkat gerektiren bir benzerlik gözlemi kaydedilmedi.
          </p>
        ) : (
          workspace.similarity.map((pair) => (
            <article className="rounded-xl border border-slate-200 bg-white p-3" key={pair.id}>
              <p className="text-sm font-bold text-slate-950">
                {pair.otherSubmission.applicationCode} · {pair.otherSubmission.projectTitle}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Sinyal düzeyi: {SIMILARITY_LEVEL_LABELS[pair.level]}
                {pair.exactDocumentMatch ? " · Birebir belge eşleşmesi" : ""}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Lexical katkı: {pair.lexicalScore.toFixed(2)} · Semantik katkı:{" "}
                {pair.semanticScore === null ? "yok" : pair.semanticScore.toFixed(2)}
              </p>
              {pair.evidence.map((section) => (
                <div
                  className="mt-2 grid gap-2 lg:grid-cols-2"
                  key={`${section.sectionKey}-${section.otherSectionKey}`}
                >
                  <blockquote className="border-l-2 border-blue-300 pl-2 text-sm text-slate-700">
                    <span className="font-semibold">{section.sectionTitle}</span>{" "}
                    <button
                      className="evidence-link"
                      onClick={() => onNavigateToPage(section.sourcePage)}
                      type="button"
                    >
                      Sayfa {section.sourcePage}
                    </button>
                    <br />“{section.sourceExcerpt}”
                  </blockquote>
                  <blockquote className="border-l-2 border-amber-300 pl-2 text-sm text-slate-700">
                    <span className="font-semibold">
                      {section.otherSectionTitle} · Diğer başvuru sayfa {section.otherPage}
                    </span>
                    <br />“{section.otherExcerpt}”
                  </blockquote>
                </div>
              ))}
            </article>
          ))
        )}
      </PanelGroup>

      <PanelGroup
        id="ai-group-rubric"
        note="Rubrik puanları AI önerisidir. Hakem puanını yalnız hakem belirler; öneri otomatik olarak puana dönüşmez."
        title="Rubrik"
      >
        {rubric ? (
          <CheckCard check={rubric}>
            <p className="mt-2 text-sm font-bold text-blue-900">
              AI önerisi toplamı: {rubric.details.suggestedTotalScore} /{" "}
              {rubric.details.maxTotalScore}
            </p>
            <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50 p-2.5">
              <p className="text-sm font-semibold text-blue-900">Geliştirme önerisi (AI önerisi)</p>
              <p className="mt-1 text-sm leading-6 text-slate-700">
                {rubric.details.feedbackSummary}
              </p>
            </div>
          </CheckCard>
        ) : (
          <p className="empty-state">Bu koşuda AI rubrik önerisi kaydedilmedi.</p>
        )}
        <p className="text-xs leading-5 text-slate-500">
          Kriter bazındaki öneriler, kanıtları ve hakem puan girişleri sağdaki Hakem Rubriği
          panelindedir.
        </p>
      </PanelGroup>
    </div>
  );
}
