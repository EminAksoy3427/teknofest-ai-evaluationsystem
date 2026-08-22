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
    <p className="mt-1 text-sm font-medium text-ink-muted">
      Kanıt Gücü: {EVIDENCE_STRENGTH_LABELS[strength]}
    </p>
  );
}

function CheckCard({ check, children }: { check: AnalysisCheckResponse; children?: ReactNode }) {
  const quiet = check.status === "PASS";
  return (
    <article className={`border-b border-line py-3 last:border-b-0 ${quiet ? "opacity-80" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className={`text-sm font-semibold ${quiet ? "text-ink-muted" : "text-ink"}`}>
          {CHECK_TYPE_LABELS[check.type]}
        </h4>
        <span className={`status-chip ${checkStatusChipClass(check.status)}`}>
          {CHECK_STATUS_LABELS[check.status]}
        </span>
      </div>
      <p className="mt-1 text-sm leading-6 text-ink-muted">{check.summary}</p>
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
      <h3 className="text-[13px] font-semibold text-ink" id={id}>
        {title}
      </h3>
      {note ? <p className="mt-1 text-xs leading-5 text-ink-subtle">{note}</p> : null}
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
 * Centre pane: AI 3. Göz.
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
        <p className="alert-error" role="alert">
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
      <p className="text-xs leading-5 text-ink-subtle">
        Kanıta dayalı karar desteği · hakem kararının yerine geçmez.
      </p>

      <PanelGroup id="ai-group-deterministic" title="Ön Kontroller">
        {language ? (
          <CheckCard check={language}>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm text-ink-muted">
              <dt>Beklenen dil</dt>
              <dd className="font-medium text-ink">
                {languageName(language.details.expectedLanguage)}
              </dd>
              <dt>Baskın dil</dt>
              <dd className="font-medium text-ink">
                {languageName(language.details.detectedLanguage)}
              </dd>
            </dl>
          </CheckCard>
        ) : null}
        {templateStructure ? (
          <CheckCard check={templateStructure}>
            <ul className="mt-2 space-y-1 text-sm text-ink-muted">
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
          <p className="empty-state">Bu koşuda ön kontrol sonucu kaydedilmedi.</p>
        ) : null}
        {sectionPresence ? (
          <CheckCard check={sectionPresence}>
            <ul className="mt-2 space-y-1 text-sm text-ink-muted">
              {sectionPresence.details.sections.map((section) => (
                <li className="flex flex-wrap items-baseline gap-1" key={section.sectionKey}>
                  <span className="font-medium text-ink">{section.expectedTitle}:</span>
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
        note="Başlığın var olması bölümün beklenen içeriği taşıdığını kanıtlamaz."
        title="İçerik"
      >
        {sectionContent ? (
          <CheckCard check={sectionContent}>
            <div className="mt-2 space-y-2">
              {sectionContent.details.sections.map((section) => (
                <div
                  className="rounded-lg border border-line bg-surface-muted p-2.5"
                  key={section.sectionKey}
                >
                  <p className="text-sm font-semibold text-ink">{section.title}</p>
                  <p className="mt-1 text-sm leading-6 text-ink-muted">{section.reason}</p>
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
          <p className="empty-state">Bu koşuda içerik kontrolü kaydedilmedi.</p>
        ) : null}
        {categoryFit ? (
          <CheckCard check={categoryFit}>
            <p className="mt-2 text-sm leading-6 text-ink-muted">{categoryFit.details.reason}</p>
            <EvidenceStrength strength={categoryFit.details.evidenceStrength} />
            {categoryFit.details.evidence.map((evidence) => (
              <EvidenceQuote
                evidence={evidence}
                key={`${evidence.page}-${evidence.excerpt}`}
                onNavigate={onNavigateToPage}
                pageCount={pageCount}
              />
            ))}
            <p className="mt-2 text-xs font-medium text-ink-muted">
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
            <p className="mt-2 text-sm font-semibold text-ink">
              {SIMILARITY_LEVEL_LABELS[similarity.details.level]} benzerlik sinyali
            </p>
            <p className="mt-1 text-xs font-medium text-brand-deep">
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
            <article className="rounded-lg border border-line bg-surface p-3" key={pair.id}>
              <p className="text-sm font-bold text-ink">
                {pair.otherSubmission.applicationCode} · {pair.otherSubmission.projectTitle}
              </p>
              <p className="mt-1 text-sm text-ink-muted">
                Sinyal düzeyi: {SIMILARITY_LEVEL_LABELS[pair.level]}
                {pair.exactDocumentMatch ? " · Birebir belge eşleşmesi" : ""}
              </p>
              {pair.evidence.map((section) => (
                <div
                  className="mt-2 grid gap-2 lg:grid-cols-2"
                  key={`${section.sectionKey}-${section.otherSectionKey}`}
                >
                  <blockquote className="border-l-2 border-brand-border pl-2 text-sm text-ink">
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
                  <blockquote className="border-l-2 border-warning-border pl-2 text-sm text-ink">
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
        title="AI Rubrik"
      >
        {rubric ? (
          <CheckCard check={rubric}>
            <p className="mt-2 text-sm font-bold text-brand-deep">
              AI önerisi toplamı: {rubric.details.suggestedTotalScore} /{" "}
              {rubric.details.maxTotalScore}
            </p>
            <div className="mt-2 rounded-lg border border-brand-border bg-brand-soft p-2.5">
              <p className="text-sm font-semibold text-brand-deep">Dikkat gerektiren kriterler</p>
              <p className="mt-1 text-sm leading-6 text-ink">{rubric.details.feedbackSummary}</p>
            </div>
          </CheckCard>
        ) : (
          <p className="empty-state">Bu koşuda AI rubrik önerisi kaydedilmedi.</p>
        )}
        <p className="text-xs leading-5 text-ink-subtle">
          Kriter bazındaki öneriler ve puan girişleri sağdaki Hakem Kararı panelindedir.
        </p>
      </PanelGroup>
    </div>
  );
}
