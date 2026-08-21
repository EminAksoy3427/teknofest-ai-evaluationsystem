import type { SemanticEvidence } from "@teknofest-ai/shared";

import { evidenceTargetPage } from "./evidence-navigation";

interface EvidenceQuoteProps {
  evidence: SemanticEvidence;
  pageCount: number | null;
  onNavigate(page: number): void;
}

/**
 * One server-verified evidence quote with its page as a real `<button>`, so it is reachable by
 * keyboard and activatable with Enter or Space like any other control. Unverified evidence never
 * reaches this component: the server strips it, and `evidenceTargetPage` refuses to produce a target
 * for it, so a model-claimed page can never become a navigation action.
 */
export function EvidenceQuote({ evidence, pageCount, onNavigate }: EvidenceQuoteProps) {
  const target = evidenceTargetPage(evidence, pageCount);

  return (
    <blockquote className="mt-2 border-l-2 border-blue-300 pl-2 text-sm leading-6 text-slate-700">
      “{evidence.excerpt}”{" "}
      {target === null ? (
        <span className="font-semibold text-slate-500">— Sayfa doğrulanmadı</span>
      ) : (
        <button
          className="evidence-link"
          onClick={() => onNavigate(target)}
          title={`Raporu ${target}. sayfaya götür`}
          type="button"
        >
          Sayfa {target}
        </button>
      )}
    </blockquote>
  );
}
