import type {
  AnalysisCheckDetails,
  AnalysisCheckStatus,
  AnalysisCheckType,
  SemanticEvidence,
} from "@teknofest-ai/shared";

import { createLocalD1, type LocalD1 } from "./local-d1";

/**
 * Deterministic SYNTHETIC golden scenarios for the review-priority queue.
 *
 * No real TEKNOFEST report, contestant or submission is involved: every document, quote, score and
 * name below is invented for this fixture. The same six scenarios back both the automated risk
 * queue assertions and the demo walkthrough documented in `docs/plans/P6-demo-ux-risk-queue.md`, so
 * the demo shows exactly the behaviour the tests pin.
 *
 *   A  OPS-A  clean, strong application, human review already submitted        → LOW
 *   B  OPS-B  structurally problematic report, nobody assigned yet             → HIGH
 *   C  OPS-C  category-fit and section-content concern with weak evidence      → HIGH
 *   D  OPS-D  high similarity observation against another submission           → HIGH
 *   E  OPS-E  AI/human rubric disagreement plus weak AI evidence               → MEDIUM
 *   F  OPS-F  analysis run failed                                              → HIGH
 *
 * Competition B carries its own high-similarity submission so cross-competition isolation can be
 * asserted against a row that would otherwise be the loudest signal in the system.
 */

export const OPS = {
  competitionA: "ops-competition-a",
  competitionB: "ops-competition-b",
  categoryA: "ops-category-a",
  categoryFarmingB: "ops-category-b",
  templateA: "ops-template-a",
  rubricA: "ops-rubric-a",
  criterionQuality: "ops-criterion-quality",
  criterionImpact: "ops-criterion-impact",
  manager: "ops-user-manager",
  evaluationManager: "ops-user-evaluation-manager",
  reviewer: "ops-user-reviewer",
  otherReviewer: "ops-user-reviewer-two",
  contestant: "ops-user-contestant",
  foreignManager: "ops-user-foreign-manager",
  /** Scenario submissions, in application-code order. */
  cleanSubmission: "ops-submission-a",
  structuralSubmission: "ops-submission-b",
  categorySubmission: "ops-submission-c",
  similaritySubmission: "ops-submission-d",
  disagreementSubmission: "ops-submission-e",
  failedSubmission: "ops-submission-f",
  foreignSubmission: "ops-submission-foreign",
} as const;

const MAX_TOTAL = 15;

function sha(seed: string): string {
  return seed.repeat(64).slice(0, 64);
}

function quote(page: number, excerpt: string): SemanticEvidence {
  return { page, excerpt, verified: true };
}

const STRUCTURAL_PROFILE = JSON.stringify({
  expectedLanguage: "tr",
  sections: [
    { key: "summary", title: "Proje Özeti", description: "", required: true, order: 1 },
    { key: "method", title: "Yöntem", description: "", required: true, order: 2 },
    { key: "results", title: "Sonuçlar", description: "", required: false, order: 3 },
  ],
});

// ---------------------------------------------------------------------------
// Check builders. Each returns a fully valid persisted AnalysisCheck payload.
// ---------------------------------------------------------------------------

interface SeedCheck {
  type: AnalysisCheckType;
  status: AnalysisCheckStatus;
  summary: string;
  details: AnalysisCheckDetails;
}

function language(status: AnalysisCheckStatus, detected: string | null): SeedCheck {
  return {
    type: "LANGUAGE",
    status,
    summary: status === "PASS" ? "Baskın dil beklenen dille uyumlu." : "Rapor dili incelenmeli.",
    details: {
      checkType: "LANGUAGE",
      expectedLanguage: "tr",
      detectedLanguage: detected,
      sampledCharacterCount: 4_000,
      sampledPageCount: 8,
      mixedLanguageSignal: status !== "PASS",
      undeterminedPageCount: 0,
      reason: status === "PASS" ? "MATCH" : "MIXED_LANGUAGE",
    },
  };
}

function templateStructure(status: AnalysisCheckStatus, missing: string[]): SeedCheck {
  return {
    type: "TEMPLATE_STRUCTURE",
    status,
    summary: status === "PASS" ? "Şablon yapısı beklenen sırada." : "Şablon yapısı incelenmeli.",
    details: {
      checkType: "TEMPLATE_STRUCTURE",
      missingRequiredSectionKeys: missing,
      orderDeviation: status === "FAIL",
      duplicateHeadingKeys: [],
      extractionWarnings: [],
    },
  };
}

function sectionPresence(status: AnalysisCheckStatus, missing: string[]): SeedCheck {
  const sections = [
    { key: "summary", title: "Proje Özeti", required: true, order: 1, page: 1 },
    { key: "method", title: "Yöntem", required: true, order: 2, page: 3 },
    { key: "results", title: "Sonuçlar", required: false, order: 3, page: 6 },
  ].map((section) => {
    const found = !missing.includes(section.key);
    return {
      sectionKey: section.key,
      expectedTitle: section.title,
      required: section.required,
      expectedOrder: section.order,
      found,
      pageNumber: found ? section.page : null,
      matchedText: found ? section.title : null,
      occurrences: found
        ? [{ pageNumber: section.page, documentOrder: section.order, matchedText: section.title }]
        : [],
    };
  });
  return {
    type: "SECTION_PRESENCE",
    status,
    summary: missing.length === 0 ? "Zorunlu başlıklar bulundu." : "Zorunlu başlıklar eksik.",
    details: { checkType: "SECTION_PRESENCE", sections, missingRequiredSectionKeys: missing },
  };
}

function sectionContent(
  status: AnalysisCheckStatus,
  options: { weakRequiredSections: number },
): SeedCheck {
  const sections = [
    { key: "summary", title: "Proje Özeti", page: 1 },
    { key: "method", title: "Yöntem", page: 3 },
  ].map((section, index) => ({
    sectionKey: section.key,
    title: section.title,
    required: true,
    assessment: status === "PASS" ? ("SUPPORTED" as const) : ("PARTIAL" as const),
    reason:
      status === "PASS"
        ? "Bölüm beklenen içeriği doğrulanmış alıntılarla taşıyor."
        : "Bölüm beklenen içeriği yalnız kısmen taşıyor.",
    evidenceStrength: index < options.weakRequiredSections ? ("LOW" as const) : ("HIGH" as const),
    evidence: [
      quote(section.page, `Sentetik ${section.title.toLocaleLowerCase("tr-TR")} alıntısı.`),
    ],
    missingExpectations: status === "PASS" ? [] : ["Ölçülebilir sonuç yok."],
    sourceCoverage: "FULL" as const,
    startPage: section.page,
    endPage: section.page + 1,
  }));
  return {
    type: "SECTION_CONTENT",
    status,
    summary:
      status === "PASS" ? "Bölüm içerikleri kanıtla desteklendi." : "Bölüm içeriği incelenmeli.",
    details: { checkType: "SECTION_CONTENT", sections },
  };
}

function categoryFit(status: AnalysisCheckStatus): SeedCheck {
  const aligned = status === "PASS";
  return {
    type: "CATEGORY_FIT",
    status,
    summary: aligned ? "Kategori uyumu beklenen kapsamda." : "Kategori uyumu incelenmeli.",
    details: {
      checkType: "CATEGORY_FIT",
      assessment: aligned ? "ALIGNED" : "REVIEW",
      reason: aligned
        ? "Proje kapsamı kategori tanımıyla örtüşüyor."
        : "Proje kapsamı kategori tanımından kısmen farklı görünüyor.",
      evidenceStrength: aligned ? "HIGH" : "MEDIUM",
      evidence: [quote(2, "Sentetik kategori kapsamı alıntısı.")],
      alignmentSignals: aligned ? ["Tarımsal izleme"] : ["Sensör altyapısı"],
      mismatchSignals: aligned ? [] : ["Sağlık uygulaması ifadeleri"],
      sourceCoverage: "SAMPLED",
    },
  };
}

function similarity(
  level: "LOW" | "MEDIUM" | "HIGH",
  other: { submissionId: string; analysisRunId: string; applicationCode: string } | null,
): SeedCheck {
  const score = level === "HIGH" ? 0.82 : level === "MEDIUM" ? 0.44 : 0.08;
  return {
    type: "SIMILARITY",
    status: level === "LOW" ? "PASS" : "WARN",
    summary:
      level === "LOW"
        ? "Dikkat gerektiren benzerlik gözlemi yok."
        : "Benzerlik sinyali uzman incelemesi öneriyor.",
    details: {
      checkType: "SIMILARITY",
      mode: "LEXICAL_ONLY",
      semanticStatus: "DISABLED",
      level,
      candidateCount: other === null ? 0 : 1,
      topMatches:
        other === null
          ? []
          : [
              {
                otherSubmissionId: other.submissionId,
                otherAnalysisRunId: other.analysisRunId,
                applicationCode: other.applicationCode,
                projectTitle: "Sentetik Benzer Proje",
                exactDocumentMatch: false,
                combinedScore: score,
                lexicalScore: score,
                semanticScore: null,
                sectionMatches: [
                  {
                    sourceSubmissionId: "kaynak",
                    otherSubmissionId: other.submissionId,
                    sectionKey: "method",
                    sectionTitle: "Yöntem",
                    otherSectionKey: "method",
                    otherSectionTitle: "Yöntem",
                    sourcePage: 3,
                    otherPage: 3,
                    lexicalScore: score,
                    semanticScore: null,
                    sourceExcerpt: "Sentetik kaynak yöntem paragrafı.",
                    otherExcerpt: "Sentetik benzer yöntem paragrafı.",
                  },
                ],
              },
            ],
    },
  };
}

function rubricEvaluation(options: {
  quality: number;
  impact: number;
  weakCriteria: number;
}): SeedCheck {
  const criteria = [
    { id: OPS.criterionQuality, code: "quality", title: "Teknik Kalite", max: 10, order: 1 },
    { id: OPS.criterionImpact, code: "impact", title: "Etki", max: 5, order: 2 },
  ];
  const scores = [options.quality, options.impact];
  return {
    type: "RUBRIC_EVALUATION",
    status: "PASS",
    summary: "Rubrik kriterleri için AI puan önerisi üretildi.",
    details: {
      checkType: "RUBRIC_EVALUATION",
      criteria: criteria.map((criterion, index) => ({
        criterionId: criterion.id,
        code: criterion.code,
        title: criterion.title,
        order: criterion.order,
        suggestedScore: scores[index] as number,
        maxScore: criterion.max,
        reason: "Sentetik kriter gerekçesi.",
        evidenceStrength: index < options.weakCriteria ? "LOW" : "HIGH",
        evidence: index < options.weakCriteria ? [] : [quote(4, "Sentetik kriter alıntısı.")],
        missingPoints: index < options.weakCriteria ? ["Doğrulanabilir kanıt bulunamadı."] : [],
      })),
      suggestedTotalScore: options.quality + options.impact,
      maxTotalScore: MAX_TOTAL,
      feedbackSummary: "Sentetik geliştirme önerisi özeti.",
    },
  };
}

/** Every check a fully analysed submission carries, with the scenario's own statuses. */
function fullCheckSet(overrides: {
  language?: SeedCheck;
  templateStructure?: SeedCheck;
  sectionPresence?: SeedCheck;
  sectionContent?: SeedCheck;
  categoryFit?: SeedCheck;
  similarity?: SeedCheck;
  rubricEvaluation?: SeedCheck;
}): SeedCheck[] {
  return [
    overrides.language ?? language("PASS", "tr"),
    overrides.templateStructure ?? templateStructure("PASS", []),
    overrides.sectionPresence ?? sectionPresence("PASS", []),
    overrides.sectionContent ?? sectionContent("PASS", { weakRequiredSections: 0 }),
    overrides.categoryFit ?? categoryFit("PASS"),
    overrides.similarity ?? similarity("LOW", null),
    overrides.rubricEvaluation ?? rubricEvaluation({ quality: 8, impact: 4, weakCriteria: 0 }),
  ];
}

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

/** Escapes a single quote for the inline seed SQL below. Fixture-only, never production input. */
function sqlText(value: string): string {
  return value.replaceAll("'", "''");
}

/**
 * Writes the run's checks, and — exactly as `persistRubricEvaluation` does in production — also the
 * normalized `rubric_suggestion` rows behind a RUBRIC_EVALUATION check. Both sources exist in a real
 * run, so seeding only one would let a test pass against data the workflow never produces.
 */
function insertChecks(local: LocalD1, runId: string, checks: readonly SeedCheck[]): void {
  for (const [index, check] of checks.entries()) {
    local.exec(
      `INSERT INTO analysis_check (id, analysis_run_id, type, status, summary, details_json)
       VALUES ('${runId}-check-${index}', '${runId}', '${check.type}', '${check.status}',
               '${sqlText(check.summary)}', '${sqlText(JSON.stringify(check.details))}')`,
    );
    if (check.details.checkType !== "RUBRIC_EVALUATION") continue;
    for (const [criterionIndex, criterion] of check.details.criteria.entries()) {
      local.exec(
        `INSERT INTO rubric_suggestion (
           id, analysis_run_id, rubric_version_id, criterion_id, suggested_score, reason,
           evidence_strength, evidence_json, missing_points_json
         ) VALUES (
           '${runId}-suggestion-${criterionIndex}', '${runId}', '${OPS.rubricA}',
           '${criterion.criterionId}', ${criterion.suggestedScore}, '${sqlText(criterion.reason)}',
           '${criterion.evidenceStrength}', '${sqlText(JSON.stringify(criterion.evidence))}',
           '${sqlText(JSON.stringify(criterion.missingPoints))}'
         )`,
      );
    }
  }
}

function insertRun(
  local: LocalD1,
  options: {
    id: string;
    submissionId: string;
    categoryId: string;
    status: "SUCCEEDED" | "FAILED" | "QUEUED";
    createdAt: number;
    sha: string;
  },
): void {
  const succeeded = options.status === "SUCCEEDED";
  const failed = options.status === "FAILED";
  local.exec(
    `INSERT INTO analysis_run (
       id, submission_id, category_id, template_version_id, rubric_version_id, source_sha256,
       status, stage, workflow_instance_id, document_artifact_key, page_count, character_count,
       extraction_warnings, error_code, error_message, created_at, started_at, completed_at
     ) VALUES (
       '${options.id}', '${options.submissionId}', '${options.categoryId}', '${OPS.templateA}',
       '${OPS.rubricA}', '${options.sha}', '${options.status}',
       '${succeeded ? "RUBRIC_EVALUATION" : failed ? "SEMANTIC_CHECKS" : "INGEST_AND_EXTRACT"}',
       '${options.id}', ${succeeded ? "'artifact.json'" : "null"},
       ${succeeded ? 8 : "null"}, ${succeeded ? 4000 : "null"}, '[]',
       ${failed ? "'AI_TIMEOUT'" : "null"},
       ${failed ? "'Sentetik analiz zaman aşımı.'" : "null"},
       ${options.createdAt}, ${options.createdAt},
       ${succeeded || failed ? options.createdAt + 100 : "null"}
     )`,
  );
}

function insertSubmission(
  local: LocalD1,
  options: {
    id: string;
    competitionId: string;
    categoryId: string;
    applicationCode: string;
    projectTitle: string;
    sha: string;
  },
): void {
  local.exec(
    `INSERT INTO submission (id, competition_id, category_id, application_code, project_title)
     VALUES ('${options.id}', '${options.competitionId}', '${options.categoryId}',
             '${options.applicationCode}', '${sqlText(options.projectTitle)}');
     INSERT INTO submission_file (
       id, submission_id, storage_key, original_filename, mime_type, size_bytes, sha256
     ) VALUES (
       '${options.id}-file', '${options.id}',
       'competitions/${options.competitionId}/submissions/${options.id}/report.pdf',
       'rapor.pdf', 'application/pdf', 2048, '${options.sha}'
     )`,
  );
}

/** Assigns a reviewer and optionally records their own evaluation and per-criterion scores. */
export function assignAndEvaluate(
  local: LocalD1,
  options: {
    assignmentId: string;
    competitionId: string;
    submissionId: string;
    reviewerUserId: string;
    analysisRunId?: string;
    evaluation?: {
      id: string;
      status: "DRAFT" | "SUBMITTED";
      scores: readonly { criterionId: string; score: number }[];
    };
  },
): void {
  local.exec(
    `INSERT INTO reviewer_assignment (id, competition_id, submission_id, reviewer_user_id, assigned_by_user_id)
     VALUES ('${options.assignmentId}', '${options.competitionId}', '${options.submissionId}',
             '${options.reviewerUserId}', '${OPS.manager}')`,
  );
  if (!options.evaluation || !options.analysisRunId) return;

  const { id, status, scores } = options.evaluation;
  local.exec(
    `INSERT INTO reviewer_evaluation (
       id, assignment_id, submission_id, analysis_run_id, rubric_version_id, status, submitted_at
     ) VALUES (
       '${id}', '${options.assignmentId}', '${options.submissionId}', '${options.analysisRunId}',
       '${OPS.rubricA}', '${status}', ${status === "SUBMITTED" ? 900 : "null"}
     )`,
  );
  for (const [index, entry] of scores.entries()) {
    local.exec(
      `INSERT INTO reviewer_criterion_score (
         id, reviewer_evaluation_id, rubric_version_id, criterion_id, score
       ) VALUES ('${id}-score-${index}', '${id}', '${OPS.rubricA}', '${entry.criterionId}', ${entry.score})`,
    );
  }
}

/**
 * Creates an in-memory database with the full generated migration chain applied and the six
 * synthetic review-priority scenarios seeded across two competitions.
 */
export function createReviewOperationsWorld(): LocalD1 {
  const local = createLocalD1();

  local.exec(`
    INSERT INTO "user" (id, name, email) VALUES
      ('${OPS.manager}', 'Yarışma Yöneticisi', 'ops-mgr@example.com'),
      ('${OPS.evaluationManager}', 'Değerlendirme Yöneticisi', 'ops-eval@example.com'),
      ('${OPS.reviewer}', 'Hakem Bir', 'ops-r1@example.com'),
      ('${OPS.otherReviewer}', 'Hakem İki', 'ops-r2@example.com'),
      ('${OPS.contestant}', 'Yarışmacı', 'ops-contestant@example.com'),
      ('${OPS.foreignManager}', 'Diğer Yarışma Yöneticisi', 'ops-foreign@example.com');

    INSERT INTO competition (id, name, slug, description) VALUES
      ('${OPS.competitionA}', 'Operasyon Yarışması', 'operasyon-yarismasi', 'Sentetik'),
      ('${OPS.competitionB}', 'Diğer Yarışma', 'diger-yarisma', 'Sentetik');

    INSERT INTO competition_member (id, competition_id, user_id, role) VALUES
      ('ops-m-mgr', '${OPS.competitionA}', '${OPS.manager}', 'COMPETITION_MANAGER'),
      ('ops-m-eval', '${OPS.competitionA}', '${OPS.evaluationManager}', 'EVALUATION_MANAGER'),
      ('ops-m-r1', '${OPS.competitionA}', '${OPS.reviewer}', 'REVIEWER'),
      ('ops-m-r2', '${OPS.competitionA}', '${OPS.otherReviewer}', 'REVIEWER'),
      ('ops-m-contestant', '${OPS.competitionA}', '${OPS.contestant}', 'CONTESTANT'),
      ('ops-m-foreign', '${OPS.competitionB}', '${OPS.foreignManager}', 'COMPETITION_MANAGER');

    INSERT INTO category (id, competition_id, name, code, description) VALUES
      ('${OPS.categoryA}', '${OPS.competitionA}', 'Tarım Teknolojileri', 'tarim', 'Sentetik'),
      ('${OPS.categoryFarmingB}', '${OPS.competitionB}', 'Sağlık', 'saglik', 'Sentetik');

    INSERT INTO template_version (id, competition_id, version_number, label, status, structural_profile) VALUES
      ('${OPS.templateA}', '${OPS.competitionA}', 1, 'Şablon v1', 'ACTIVE', '${STRUCTURAL_PROFILE}'),
      ('ops-template-b', '${OPS.competitionB}', 1, 'Şablon v1', 'ACTIVE', '${STRUCTURAL_PROFILE}');

    INSERT INTO rubric_version (id, competition_id, version_number, label, status) VALUES
      ('${OPS.rubricA}', '${OPS.competitionA}', 1, 'Rubrik v1', 'ACTIVE'),
      ('ops-rubric-b', '${OPS.competitionB}', 1, 'Rubrik v1', 'ACTIVE');

    INSERT INTO criterion (
      id, rubric_version_id, code, title, description, evidence_expectation, max_score,
      weight_basis_points, sort_order
    ) VALUES
      ('${OPS.criterionQuality}', '${OPS.rubricA}', 'quality', 'Teknik Kalite', 'Sentetik', 'Sayfa alıntısı', 10, 6000, 1),
      ('${OPS.criterionImpact}', '${OPS.rubricA}', 'impact', 'Etki', 'Sentetik', 'Sayfa alıntısı', 5, 4000, 2),
      ('ops-criterion-b', 'ops-rubric-b', 'quality', 'Teknik Kalite', 'Sentetik', 'Sayfa alıntısı', 10, 10000, 1);
  `);

  // A — clean and strong; the reviewer already submitted and agreed with every AI suggestion.
  insertSubmission(local, {
    id: OPS.cleanSubmission,
    competitionId: OPS.competitionA,
    categoryId: OPS.categoryA,
    applicationCode: "OPS-A",
    projectTitle: "Akıllı Sera İzleme",
    sha: sha("a"),
  });
  insertRun(local, {
    id: "ops-run-a",
    submissionId: OPS.cleanSubmission,
    categoryId: OPS.categoryA,
    status: "SUCCEEDED",
    createdAt: 100,
    sha: sha("a"),
  });
  insertChecks(local, "ops-run-a", fullCheckSet({}));
  assignAndEvaluate(local, {
    assignmentId: "ops-assignment-a",
    competitionId: OPS.competitionA,
    submissionId: OPS.cleanSubmission,
    reviewerUserId: OPS.reviewer,
    analysisRunId: "ops-run-a",
    evaluation: {
      id: "ops-evaluation-a",
      status: "SUBMITTED",
      scores: [
        { criterionId: OPS.criterionQuality, score: 8 },
        { criterionId: OPS.criterionImpact, score: 4 },
      ],
    },
  });

  // B — structurally problematic report and nobody assigned yet.
  insertSubmission(local, {
    id: OPS.structuralSubmission,
    competitionId: OPS.competitionA,
    categoryId: OPS.categoryA,
    applicationCode: "OPS-B",
    projectTitle: "Yapısı Eksik Rapor",
    sha: sha("b"),
  });
  insertRun(local, {
    id: "ops-run-b",
    submissionId: OPS.structuralSubmission,
    categoryId: OPS.categoryA,
    status: "SUCCEEDED",
    createdAt: 200,
    sha: sha("b"),
  });
  insertChecks(
    local,
    "ops-run-b",
    fullCheckSet({
      language: language("WARN", "en"),
      templateStructure: templateStructure("FAIL", ["method"]),
      sectionPresence: sectionPresence("FAIL", ["method"]),
    }),
  );

  // C — category-fit and section-content concern with weak evidence on both required sections.
  insertSubmission(local, {
    id: OPS.categorySubmission,
    competitionId: OPS.competitionA,
    categoryId: OPS.categoryA,
    applicationCode: "OPS-C",
    projectTitle: "Kategori Kapsamı Tartışmalı Proje",
    sha: sha("c"),
  });
  insertRun(local, {
    id: "ops-run-c",
    submissionId: OPS.categorySubmission,
    categoryId: OPS.categoryA,
    status: "SUCCEEDED",
    createdAt: 300,
    sha: sha("c"),
  });
  insertChecks(
    local,
    "ops-run-c",
    fullCheckSet({
      categoryFit: categoryFit("WARN"),
      sectionContent: sectionContent("WARN", { weakRequiredSections: 2 }),
    }),
  );
  assignAndEvaluate(local, {
    assignmentId: "ops-assignment-c",
    competitionId: OPS.competitionA,
    submissionId: OPS.categorySubmission,
    reviewerUserId: OPS.reviewer,
  });

  // D — high similarity observation against submission E. A signal, never a verdict.
  insertSubmission(local, {
    id: OPS.similaritySubmission,
    competitionId: OPS.competitionA,
    categoryId: OPS.categoryA,
    applicationCode: "OPS-D",
    projectTitle: "Benzerlik Sinyali Taşıyan Proje",
    sha: sha("d"),
  });
  insertRun(local, {
    id: "ops-run-d",
    submissionId: OPS.similaritySubmission,
    categoryId: OPS.categoryA,
    status: "SUCCEEDED",
    createdAt: 400,
    sha: sha("d"),
  });

  // E — AI/human rubric disagreement plus one weak-evidence criterion.
  insertSubmission(local, {
    id: OPS.disagreementSubmission,
    competitionId: OPS.competitionA,
    categoryId: OPS.categoryA,
    applicationCode: "OPS-E",
    projectTitle: "AI ve Hakem Puanı Farklı Proje",
    sha: sha("e"),
  });
  insertRun(local, {
    id: "ops-run-e",
    submissionId: OPS.disagreementSubmission,
    categoryId: OPS.categoryA,
    status: "SUCCEEDED",
    createdAt: 500,
    sha: sha("e"),
  });
  insertChecks(
    local,
    "ops-run-d",
    fullCheckSet({
      similarity: similarity("HIGH", {
        submissionId: OPS.disagreementSubmission,
        analysisRunId: "ops-run-e",
        applicationCode: "OPS-E",
      }),
    }),
  );
  insertChecks(
    local,
    "ops-run-e",
    fullCheckSet({
      rubricEvaluation: rubricEvaluation({ quality: 9, impact: 4, weakCriteria: 1 }),
    }),
  );
  assignAndEvaluate(local, {
    assignmentId: "ops-assignment-e",
    competitionId: OPS.competitionA,
    submissionId: OPS.disagreementSubmission,
    reviewerUserId: OPS.otherReviewer,
    analysisRunId: "ops-run-e",
    evaluation: {
      id: "ops-evaluation-e",
      status: "SUBMITTED",
      // The reviewer scored lower on quality and higher on impact than the AI proposed. A
      // difference is a legitimate human judgement, never a reviewer error.
      scores: [
        { criterionId: OPS.criterionQuality, score: 6 },
        { criterionId: OPS.criterionImpact, score: 5 },
      ],
    },
  });

  // F — the analysis run itself failed, so no evidence exists for a reviewer to work from.
  insertSubmission(local, {
    id: OPS.failedSubmission,
    competitionId: OPS.competitionA,
    categoryId: OPS.categoryA,
    applicationCode: "OPS-F",
    projectTitle: "Analizi Tamamlanamayan Proje",
    sha: sha("f"),
  });
  insertRun(local, {
    id: "ops-run-f",
    submissionId: OPS.failedSubmission,
    categoryId: OPS.categoryA,
    status: "FAILED",
    createdAt: 600,
    sha: sha("f"),
  });

  // Competition B — its own high-similarity submission, used only to assert isolation.
  insertSubmission(local, {
    id: OPS.foreignSubmission,
    competitionId: OPS.competitionB,
    categoryId: OPS.categoryFarmingB,
    applicationCode: "OPS-Z",
    projectTitle: "Diğer Yarışmanın Projesi",
    sha: sha("a"),
  });
  local.exec(
    `INSERT INTO analysis_run (
       id, submission_id, category_id, template_version_id, rubric_version_id, source_sha256,
       status, stage, workflow_instance_id, document_artifact_key, page_count, character_count,
       extraction_warnings, created_at, started_at, completed_at
     ) VALUES (
       'ops-run-foreign', '${OPS.foreignSubmission}', '${OPS.categoryFarmingB}', 'ops-template-b',
       'ops-rubric-b', '${sha("a")}', 'SUCCEEDED', 'RUBRIC_EVALUATION', 'ops-run-foreign',
       'artifact.json', 8, 4000, '[]', 700, 700, 800
     )`,
  );
  insertChecks(local, "ops-run-foreign", [
    similarity("HIGH", {
      submissionId: OPS.foreignSubmission,
      analysisRunId: "ops-run-foreign",
      applicationCode: "OPS-Z",
    }),
  ]);

  return local;
}
