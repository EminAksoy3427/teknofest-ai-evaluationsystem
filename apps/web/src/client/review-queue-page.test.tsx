import type { ReviewerQueueItem } from "@teknofest-ai/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";

import { reviewerQueueCta } from "./analysis-labels";
import { QueueCard } from "./review-queue-page";

function entry(state: ReviewerQueueItem["state"]): ReviewerQueueItem & { competitionName: string } {
  return {
    assignmentId: "assignment-a",
    competitionId: "comp-a",
    competitionName: "Sentetik Yarışma",
    submission: {
      id: "sub-a",
      applicationCode: "A-001",
      projectTitle: "Akıllı Sera",
      category: { id: "cat-a", code: "tarim", name: "Tarım" },
    },
    state,
    analysisRunId: state.startsWith("ANALYSIS") ? null : "run-a",
    evaluationStatus: state === "DRAFT" ? "DRAFT" : state === "SUBMITTED" ? "SUBMITTED" : null,
    submittedAt: state === "SUBMITTED" ? 10 : null,
    assignedAt: 1,
  };
}

describe("reviewer queue CTAs", () => {
  it("uses start, continue and view copy depending on evaluation state", () => {
    expect(reviewerQueueCta("ASSIGNED")).toBe("İncelemeye başla");
    expect(reviewerQueueCta("DRAFT")).toBe("Devam et");
    expect(reviewerQueueCta("SUBMITTED")).toBe("Değerlendirmeyi görüntüle");
    expect(reviewerQueueCta("ANALYSIS_PENDING")).toBeNull();
  });

  it("renders the CTA on an assigned row", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <QueueCard entry={entry("ASSIGNED")} />
      </MemoryRouter>,
    );
    expect(markup).toContain("İncelemeye başla");
    expect(markup).toContain("A-001");
    expect(markup).toContain("Akıllı Sera");
  });
});
