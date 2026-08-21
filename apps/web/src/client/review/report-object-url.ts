export interface ReportObjectUrlHandlers {
  onUrl(url: string): void;
  onError(message: string): void;
}

export interface ObjectUrlSource {
  createObjectURL(blob: Blob): string;
  revokeObjectURL(url: string): void;
}

/**
 * Fetches a submission report once and hands the caller a browser object URL for it, tracking that
 * URL so it can be released later. This is the exact logic `ReportPanel`'s effect runs; it is pulled
 * out as a plain function (rather than left inline in the effect) so its object-URL lifecycle —
 * create once, revoke on teardown, never revoke while still in use — can be unit tested without a
 * DOM or a React renderer.
 *
 * The returned teardown function is what the caller's effect cleanup must invoke. It is idempotent
 * with "not yet created": if the fetch has not resolved into a URL yet, calling it only marks the
 * request stale so a late-arriving response is discarded without ever creating (and therefore never
 * needing to revoke) a URL for an abandoned request.
 */
export function loadReportObjectUrl(
  reportPath: string,
  handlers: ReportObjectUrlHandlers,
  urlApi: ObjectUrlSource = URL,
  fetchImpl: typeof fetch = fetch,
): () => void {
  let currentUrl: string | null = null;
  let active = true;

  fetchImpl(reportPath)
    .then(async (response) => {
      if (!response.ok) {
        let message = "Rapor görüntülenemedi.";
        try {
          const payload = (await response.json()) as { message?: string };
          if (typeof payload.message === "string") message = payload.message;
        } catch {
          // A non-JSON error body carries no better message than the default.
        }
        throw new Error(message);
      }
      return response.blob();
    })
    .then((blob) => {
      // The request went stale (teardown already ran) before the body arrived; never create a URL
      // for a response nobody will read, and therefore never need to remember to revoke it either.
      if (!active) return;
      currentUrl = urlApi.createObjectURL(blob);
      handlers.onUrl(currentUrl);
    })
    .catch((caught: unknown) => {
      if (active)
        handlers.onError(caught instanceof Error ? caught.message : "Rapor görüntülenemedi.");
    });

  return () => {
    active = false;
    if (currentUrl !== null) {
      urlApi.revokeObjectURL(currentUrl);
      currentUrl = null;
    }
  };
}
