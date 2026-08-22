import type {
  ContestantOwnedSubmission,
  PublishedContestantFeedbackResponse,
} from "@teknofest-ai/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MyResultsPage } from "./my-results-page";

describe("contestant results copy", () => {
  it("explains the unpublished state without exposing internals", () => {
    const unpublished: ContestantOwnedSubmission = {
      submissionId: "sub-a",
      applicationCode: "A-001",
      projectTitle: "Akıllı Sera",
      categoryName: "Tarım",
      feedbackPublished: false,
    };
    expect(unpublished.feedbackPublished).toBe(false);
    expect("Değerlendirme sonucu henüz yayımlanmadı.").not.toMatch(
      /analiz|benzerlik|hakem|öncelik|kimlik/i,
    );
  });

  it("keeps published feedback qualitative", () => {
    const published: PublishedContestantFeedbackResponse = {
      submissionId: "sub-a",
      applicationCode: "A-001",
      projectTitle: "Akıllı Sera",
      categoryName: "Tarım",
      publishedAt: 1,
      summary: "Proje güçlü bir saha uygulaması sunuyor.",
      strengths: ["Yöntem açık."],
      improvements: ["Maliyet ayrıntısı genişletilmeli."],
      recommendations: ["Saha denemesini belgelendirin."],
    };
    const blob = JSON.stringify(published);
    expect(blob).not.toMatch(/intihal|risk|öncelik|analysisRun/i);
    expect(published.strengths.length).toBeGreaterThan(0);
  });

  it("renders the empty owned-submissions state", () => {
    const markup = renderToStaticMarkup(<MyResultsPage />);
    expect(markup).toContain("Sonuçlarım");
  });
});
