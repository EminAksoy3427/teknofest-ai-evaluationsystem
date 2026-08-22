import type { ReviewerWorkspaceResponse, SemanticEvidence } from "@teknofest-ai/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AiPanel } from "./review/ai-panel";
import { EvidenceQuote } from "./review/evidence-link";
import { type CriterionDraft, RubricPanel } from "./review/rubric-panel";

// The reviewer panels are rendered as markup and asserted on the wording and the controls they
// expose. These are the assertions that matter for the product boundary: the AI number is always
// labelled as a suggestion, the human number is a separate editable field, and the evidence page is
// a real focusable control rather than static text.

const evidence: SemanticEvidence[] = [
  { page: 4, excerpt: "Doğrulanmış yöntem alıntısı.", verified: true },
];

const draftEvaluation = {
  id: "evaluation-a",
  assignmentId: "assignment-a",
  analysisRunId: "run-a",
  rubricVersionId: "rubric-a",
  status: "DRAFT",
  overallNote: null,
  createdAt: 1,
  updatedAt: 1,
  submittedAt: null,
} as const satisfies NonNullable<ReviewerWorkspaceResponse["evaluation"]>;

const workspace: ReviewerWorkspaceResponse = {
  assignment: {
    id: "assignment-a",
    competitionId: "competition-a",
    submissionId: "submission-a",
    assignedAt: 1,
  },
  submission: {
    id: "submission-a",
    applicationCode: "A-001",
    projectTitle: "Akıllı Sera",
    category: { id: "category-a", code: "tarim", name: "Tarım Teknolojileri" },
  },
  analysisRun: {
    id: "run-a",
    submissionId: "submission-a",
    categoryId: "category-a",
    status: "SUCCEEDED",
    stage: "RUBRIC_EVALUATION",
    templateVersionId: "template-a",
    rubricVersionId: "rubric-a",
    sourceSha256: "a".repeat(64),
    ai: null,
    categorySnapshot: null,
    createdAt: 1,
    startedAt: 1,
    completedAt: 2,
    extraction: { pageCount: 8, characterCount: 4000, warnings: [] },
    checks: [
      {
        id: "check-language",
        analysisRunId: "run-a",
        type: "LANGUAGE",
        status: "PASS",
        summary: "Baskın dil beklenen dille uyumlu.",
        details: {
          checkType: "LANGUAGE",
          expectedLanguage: "tr",
          detectedLanguage: "tr",
          sampledPageCount: 8,
          sampledCharacterCount: 4000,
          mixedLanguageSignal: false,
          undeterminedPageCount: 0,
          reason: "MATCH",
        },
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: "check-category",
        analysisRunId: "run-a",
        type: "CATEGORY_FIT",
        status: "WARN",
        summary: "Kategori uyumu incelenmeli.",
        details: {
          checkType: "CATEGORY_FIT",
          assessment: "REVIEW",
          reason: "Kapsam kısmen farklı.",
          evidenceStrength: "MEDIUM",
          evidence,
          alignmentSignals: ["Tarımsal izleme"],
          mismatchSignals: ["Sağlık uygulaması ifadeleri"],
          sourceCoverage: "SAMPLED",
        },
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: "check-similarity",
        analysisRunId: "run-a",
        type: "SIMILARITY",
        status: "WARN",
        summary: "Orta düzey benzerlik sinyali.",
        details: {
          checkType: "SIMILARITY",
          mode: "LEXICAL_ONLY",
          semanticStatus: "DISABLED",
          level: "MEDIUM",
          candidateCount: 3,
          topMatches: [],
        },
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    error: null,
  },
  similarity: [],
  rubricVersionId: "rubric-a",
  criteria: [
    {
      criterionId: "criterion-quality",
      code: "quality",
      title: "Teknik Kalite",
      description: "Yöntemin teknik derinliği.",
      evidenceExpectation: "Sayfa alıntısı",
      maxScore: 10,
      order: 1,
      aiSuggestion: {
        suggestedScore: 7,
        reason: "Yöntem doğrulanmış kanıtla desteklenmiş.",
        evidenceStrength: "HIGH",
        evidence,
        missingPoints: ["Ölçülebilir hedef yok."],
      },
      humanScore: 5,
      humanNote: "Kanıt zayıf.",
      decisionTrace: {
        aiScore: 7,
        humanScore: 5,
        difference: -2,
        classification: "DIFFERENT_FROM_AI",
      },
    },
    {
      criterionId: "criterion-impact",
      code: "impact",
      title: "Etki",
      description: "Beklenen etki.",
      evidenceExpectation: "",
      maxScore: 5,
      order: 2,
      aiSuggestion: null,
      humanScore: null,
      humanNote: null,
      decisionTrace: {
        aiScore: null,
        humanScore: null,
        difference: null,
        classification: "NO_AI_SUGGESTION",
      },
    },
  ],
  totals: {
    aiSuggestedTotal: 7,
    aiMaxTotal: 15,
    humanTotal: 5,
    humanMaxTotal: 15,
    scoredCriterionCount: 1,
    criterionCount: 2,
    disagreementCount: 1,
  },
  evaluation: draftEvaluation,
  editable: true,
};

const drafts: Record<string, CriterionDraft> = {
  "criterion-quality": { score: "5", note: "Kanıt zayıf." },
  "criterion-impact": { score: "", note: "" },
};

function renderRubric(overrides: Partial<ReviewerWorkspaceResponse> = {}) {
  return renderToStaticMarkup(
    <RubricPanel
      drafts={drafts}
      isDirty={false}
      isSaving={false}
      onDraftChange={() => undefined}
      onNavigateToPage={() => undefined}
      onOverallNoteChange={() => undefined}
      onSaveDraft={() => undefined}
      onSubmit={() => undefined}
      overallNote=""
      saveError={null}
      saveMessage={null}
      workspace={{ ...workspace, ...overrides }}
    />,
  );
}

const markupAi = renderToStaticMarkup(
  <AiPanel onNavigateToPage={() => undefined} workspace={workspace} />,
);

describe("AI 4. Göz panel", () => {
  const markup = markupAi;

  it("groups the persisted checks into ön kontroller, içerik, benzerlik and AI rubrik", () => {
    for (const heading of ["Ön Kontroller", "İçerik", "Benzerlik", "AI Rubrik"]) {
      expect(markup).toContain(heading);
    }
    expect(markup).toContain("Dil");
    expect(markup).toContain("Kategori Uyumu");
  });

  it("states the check status as text rather than relying on colour alone", () => {
    expect(markup).toContain("Uygun");
    expect(markup).toContain("İncelenmeli");
  });

  it("renders a verified evidence page as a focusable button, not static text", () => {
    expect(markup).toContain('type="button"');
    expect(markup).toContain("Sayfa 4");
  });

  it("never presents similarity as a plagiarism verdict or a final decision", () => {
    expect(markup).toContain("inceleme sinyalidir");
    expect(markup).not.toContain("intihal tespiti edildi");
    expect(markup).toContain("hakem kararının yerine geçmez");
  });
});

describe("evidence quote", () => {
  it("drops the navigation control for evidence the server did not verify", () => {
    const markup = renderToStaticMarkup(
      <EvidenceQuote
        evidence={{ page: 4, excerpt: "Doğrulanmamış alıntı.", verified: false as true }}
        onNavigate={() => undefined}
        pageCount={8}
      />,
    );
    expect(markup).toContain("Sayfa doğrulanmadı");
    expect(markup).not.toContain("<button");
  });
});

describe("human rubric panel", () => {
  const markup = renderRubric();

  it("labels the AI number as a suggestion and keeps the human score a separate input", () => {
    expect(markup).toContain("AI önerisi: 7 / 10");
    expect(markup).toContain("Hakem puanı (0–10)");
    expect(markup).toContain('id="criterion-score-criterion-quality"');
    expect(markup).toContain('value="5"');
  });

  it("offers applying the AI suggestion as an explicit reviewer action", () => {
    expect(markup).toContain("AI önerisini puan olarak kullan (7)");
  });

  it("shows the decision trace with the difference and without blaming the reviewer", () => {
    expect(markup).toContain("AI&#x27;DAN FARKLI");
    expect(markup).toContain("Fark: -2");
    expect(markup).toContain("Gerekçe zorunlu değildir");
    expect(markup).not.toContain("hata");
  });

  it("reports a criterion with no AI suggestion instead of inventing one", () => {
    expect(markup).toContain("AI ÖNERİSİ YOK");
    expect(markup).toContain("Bu kriter için AI önerisi yok");
  });

  it("keeps the AI total and the human total visually and textually distinct", () => {
    expect(markup).toContain("AI önerisi</p>");
    expect(markup).toContain("7 / 15");
    expect(markup).toContain("Hakem puanı</p>");
    expect(markup).toContain("5 / 15");
    expect(markup).toContain("tek bir puana birleştirilmez");
    expect(markup).toContain("Toplamları sunucu hesaplar");
  });

  it("locks the form and explains the boundary once the evaluation is submitted", () => {
    const submitted = renderRubric({
      editable: false,
      evaluation: { ...draftEvaluation, status: "SUBMITTED", submittedAt: 10 },
    });
    expect(submitted).toContain("kaydı değiştirilemez");
    expect(submitted).toContain("projeyi elemez");
    expect(submitted).toContain('disabled=""');
    expect(submitted).not.toContain("Değerlendirmemi gönder");
  });

  it("labels the draft state and both save actions while the evaluation is editable", () => {
    expect(markup).toContain("Taslak");
    expect(markup).toContain("Göndermek için tüm kriterleri");
    expect(markup).toContain("Taslağı kaydet");
    expect(markup).toContain("Değerlendirmemi gönder");
  });

  it("distinguishes the submitted state from the draft state as text, not only colour", () => {
    const submitted = renderRubric({
      editable: false,
      evaluation: { ...draftEvaluation, status: "SUBMITTED", submittedAt: 10 },
    });
    expect(submitted).toContain("Gönderildi");
    expect(submitted).not.toContain("Göndermek için tüm kriterleri");
  });

  it("separates the AI suggestion block from the human decision block with headings", () => {
    expect(markup).toContain("AI önerisi · hakem kararı değildir");
    expect(markup).toContain("Hakem kararı");
  });

  it("explains an empty pinned rubric instead of rendering a blank pane", () => {
    const empty = renderRubric({
      criteria: [],
      totals: {
        aiSuggestedTotal: null,
        aiMaxTotal: 0,
        humanTotal: null,
        humanMaxTotal: 0,
        scoredCriterionCount: 0,
        criterionCount: 0,
        disagreementCount: 0,
      },
    });
    expect(empty).toContain("rubrik sürümünde kriter bulunmuyor");
  });
});

describe("AI 4. Göz panel empty and failure states", () => {
  it("explains a failed analysis run and keeps the reviewer able to work", () => {
    const failed = renderToStaticMarkup(
      <AiPanel
        onNavigateToPage={() => undefined}
        workspace={{
          ...workspace,
          analysisRun: {
            ...workspace.analysisRun,
            status: "FAILED",
            checks: [],
            error: { code: "AI_TIMEOUT", message: "Sentetik zaman aşımı." },
          },
        }}
      />,
    );
    expect(failed).toContain("analiz çalışması tamamlanamadı");
    expect(failed).toContain("raporu doğrudan okuyarak");
  });

  it("states that a run carries no persisted check instead of rendering nothing", () => {
    const noChecks = renderToStaticMarkup(
      <AiPanel
        onNavigateToPage={() => undefined}
        workspace={{ ...workspace, analysisRun: { ...workspace.analysisRun, checks: [] } }}
      />,
    );
    expect(noChecks).toContain("kayıtlı bir kontrol sonucu yok");
  });

  it("reports a missing AI rubric result rather than implying a zero suggestion", () => {
    expect(markupAi).toContain("Bu koşuda AI rubrik önerisi kaydedilmedi");
    expect(markupAi).not.toContain("AI kararı");
  });
});
