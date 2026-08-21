import type { AnalysisRunResponse } from "@teknofest-ai/shared";

export const PDF_ZOOM_STEPS = [50, 75, 100, 125, 150, 200] as const;
export const DEFAULT_PDF_ZOOM = 100;

/**
 * Clamps a page number into the report's real page range. The upper bound is the server-recorded
 * `pageCount` of the pinned AnalysisRun's extraction, so the reviewer can never be navigated past
 * the end of the document by a stale or malformed page number.
 */
export function clampPage(requested: number, pageCount: number | null): number {
  const total = pageCount !== null && pageCount > 0 ? pageCount : 1;
  if (!Number.isFinite(requested)) return 1;
  return Math.min(Math.max(Math.trunc(requested), 1), total);
}

/**
 * Resolves the page an evidence item should navigate to. Only server-verified evidence is accepted:
 * an unverified page number is never followed, because the AI is not allowed to steer the reviewer
 * to a page the server did not confirm the quote actually appears on.
 */
export function evidenceTargetPage(
  evidence: { page: number; verified: boolean },
  pageCount: number | null,
): number | null {
  if (!evidence.verified) return null;
  return clampPage(evidence.page, pageCount);
}

/**
 * Builds the viewer URL for the embedded PDF. The page and zoom travel in the URL fragment, which
 * the browser's built-in PDF viewer reads; the fragment never reaches the server, so it cannot
 * widen what the protected report endpoint returns.
 */
export function pdfViewerUrl(source: string, page: number, zoomPercent: number): string {
  return `${source}#page=${page}&zoom=${zoomPercent}`;
}

/** The report's page count as recorded by the pinned run's extraction, or null when unknown. */
export function reportPageCount(run: AnalysisRunResponse): number | null {
  return run.extraction.pageCount;
}

export interface EvidenceReference {
  page: number;
  excerpt: string;
  /** Where the quote came from, so the reviewer can see which check surfaced it. */
  sourceLabel: string;
}

/**
 * Collects every server-verified evidence page in the pinned run, grouped by the check that
 * produced it. Only `verified: true` evidence is ever returned, so unverified model claims never
 * become clickable navigation targets.
 */
export function collectVerifiedEvidence(run: AnalysisRunResponse): EvidenceReference[] {
  const references: EvidenceReference[] = [];
  const push = (
    sourceLabel: string,
    items: readonly { page: number; excerpt: string; verified: boolean }[],
  ) => {
    for (const item of items) {
      if (item.verified) references.push({ page: item.page, excerpt: item.excerpt, sourceLabel });
    }
  };

  for (const check of run.checks) {
    if (check.type === "SECTION_CONTENT") {
      for (const section of check.details.sections) push(section.title, section.evidence);
    }
    if (check.type === "CATEGORY_FIT") push("Kategori Uyumu", check.details.evidence);
    if (check.type === "RUBRIC_EVALUATION") {
      for (const criterion of check.details.criteria) push(criterion.title, criterion.evidence);
    }
  }

  return references;
}
