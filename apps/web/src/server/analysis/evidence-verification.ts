import type { ClaimedEvidence } from "@teknofest-ai/ai";
import {
  type DocumentExtractionArtifact,
  MAX_SEMANTIC_EVIDENCE_EXCERPT_CHARACTERS,
  type SemanticEvidence,
} from "@teknofest-ai/shared";

export function normalizeEvidenceText(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

export function verifyClaimedEvidence(
  artifact: DocumentExtractionArtifact,
  claimed: readonly ClaimedEvidence[],
): SemanticEvidence[] {
  const pages = new Map(
    artifact.pages.map((page) => [page.pageNumber, normalizeEvidenceText(page.text)]),
  );
  const verified: SemanticEvidence[] = [];
  for (const evidence of claimed) {
    if (evidence.excerpt.length > MAX_SEMANTIC_EVIDENCE_EXCERPT_CHARACTERS) continue;
    const excerpt = normalizeEvidenceText(evidence.excerpt);
    const page = pages.get(evidence.page);
    if (!page || !excerpt || !page.includes(excerpt)) continue;
    verified.push({ page: evidence.page, excerpt: evidence.excerpt.trim(), verified: true });
  }
  return verified;
}
