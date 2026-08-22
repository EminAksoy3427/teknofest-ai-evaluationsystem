import { type FormEvent, useEffect, useState } from "react";

import { clampPage, DEFAULT_PDF_ZOOM, PDF_ZOOM_STEPS, pdfViewerUrl } from "./evidence-navigation";
import { loadReportObjectUrl } from "./report-object-url";

interface ReportPanelProps {
  /** Protected, competition-scoped report endpoint for this reviewer's own assignment. */
  reportPath: string;
  /** Page count recorded by the pinned AnalysisRun's extraction, or null when unknown. */
  pageCount: number | null;
  page: number;
  onPageChange(page: number): void;
}

/**
 * Left pane: the submission report.
 *
 * The PDF body is fetched once from the protected endpoint with the session cookie and handed to the
 * browser's built-in viewer as an object URL, so no R2 key, bucket name or shareable storage URL is
 * ever produced. Page and zoom are driven through the viewer URL fragment; re-keying the frame on
 * the page number is what makes an evidence click actually move the document.
 *
 * Deliberately deferred: bundling PDF.js for in-app rendering. The built-in viewer already gives
 * page navigation, zoom and text selection at no bundle cost; a PDF.js upgrade would only be needed
 * for features this milestone does not claim (annotation overlays, highlight-on-page).
 */
export function ReportPanel({ reportPath, pageCount, page, onPageChange }: ReportPanelProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number>(DEFAULT_PDF_ZOOM);
  const [pageDraft, setPageDraft] = useState<string>(String(page));

  useEffect(() => {
    setPageDraft(String(page));
  }, [page]);

  useEffect(() => {
    setObjectUrl(null);
    setError(null);
    // The returned teardown revokes the object URL this created (if any) whenever this effect
    // reruns — the report path changed, so the previous blob is being replaced — or the component
    // unmounts. See `loadReportObjectUrl` for why a late response never leaks a URL either.
    return loadReportObjectUrl(reportPath, { onUrl: setObjectUrl, onError: setError });
  }, [reportPath]);

  const total = pageCount ?? null;
  const atFirstPage = page <= 1;
  const atLastPage = total !== null && page >= total;

  function jumpToPage(event: FormEvent) {
    event.preventDefault();
    onPageChange(clampPage(Number(pageDraft), total));
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {/* The toolbar stays reachable while the document scrolls, so an evidence jump can always be
          undone with "Önceki sayfa" without scrolling back up. */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-1.5 border-b border-line bg-surface px-3 py-2">
        <button
          className="icon-button"
          disabled={atFirstPage}
          onClick={() => onPageChange(clampPage(page - 1, total))}
          type="button"
        >
          <span aria-hidden="true">‹</span>
          <span className="sr-only">Önceki sayfa</span>
        </button>
        <button
          className="icon-button"
          disabled={atLastPage}
          onClick={() => onPageChange(clampPage(page + 1, total))}
          type="button"
        >
          <span aria-hidden="true">›</span>
          <span className="sr-only">Sonraki sayfa</span>
        </button>
        <p aria-live="polite" className="px-1 text-[13px] font-medium tabular-nums text-ink">
          Sayfa {page}
          {total === null ? "" : ` / ${total}`}
        </p>
        {total === null ? <p className="pane-note">Sayfa sayısı bu koşuda kaydedilmemiş.</p> : null}
        <form className="flex items-end gap-2" onSubmit={jumpToPage}>
          <div>
            <label className="field-label sr-only" htmlFor="report-page-input">
              Gidilecek sayfa
            </label>
            <input
              className="field-input w-24"
              id="report-page-input"
              inputMode="numeric"
              max={total ?? undefined}
              min={1}
              onChange={(event) => setPageDraft(event.target.value)}
              type="number"
              value={pageDraft}
            />
          </div>
          <button className="secondary-button" type="submit">
            Git
          </button>
        </form>
        <div>
          <label className="field-label sr-only" htmlFor="report-zoom-select">
            Yakınlaştırma
          </label>
          <select
            className="field-input w-28"
            id="report-zoom-select"
            onChange={(event) => setZoom(Number(event.target.value))}
            value={zoom}
          >
            {PDF_ZOOM_STEPS.map((step) => (
              <option key={step} value={step}>
                %{step}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div
        className="report-page-focus min-h-0 flex-1 bg-surface-raised"
        key={`${objectUrl}-${page}`}
      >
        {error ? (
          <div className="p-4">
            <p className="alert-error" role="alert">
              {error}
            </p>
          </div>
        ) : objectUrl === null ? (
          <p className="p-4 text-sm text-ink-muted" role="status">
            Rapor yükleniyor…
          </p>
        ) : (
          <iframe
            className="h-full min-h-[24rem] w-full border-0"
            // Re-keying on the page number reloads the viewer at the requested page, which is what
            // makes an evidence click in the AI panel actually move the document.
            key={`${objectUrl}-${page}-${zoom}`}
            src={pdfViewerUrl(objectUrl, page, zoom)}
            title="Başvuru raporu"
          />
        )}
      </div>
    </div>
  );
}
