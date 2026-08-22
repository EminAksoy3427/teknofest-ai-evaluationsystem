import { createLocalD1, type LocalD1 } from "./local-d1";

/**
 * Deterministic SYNTHETIC world for P6.5A: official template files, submission participants and
 * published contestant feedback. No real TEKNOFEST report, contestant or reviewer is involved.
 *
 * Competition A carries the full historical-integrity scenario required by the milestone:
 *
 *   Template v1 (ACTIVE, file H1) + Rubric v1 (ACTIVE)
 *   Submission S1 -> AnalysisRun R1 (SUCCEEDED, pinned to v1/v1)
 *   ReviewerAssignment -> ReviewerEvaluation E1 (SUBMITTED)
 *   ContestantFeedback F1 (PUBLISHED), sourced from E1
 *   SubmissionParticipant: contestantOne owns S1; contestantTwo owns nothing
 *
 * `activateNewVersionsAndAnalyze` (called only by the tests that need it) later activates Template
 * v2 + Rubric v2 and creates AnalysisRun R2 for the SAME submission, so a test can assert that R1,
 * E1 and F1 all stay pinned to their original context.
 *
 * Competition B is a second, unrelated competition used only to prove cross-competition isolation.
 */

export const P65 = {
  competitionA: "p65-competition-a",
  competitionB: "p65-competition-b",
  categoryA: "p65-category-a",
  categoryB: "p65-category-b",
  templateA1: "p65-template-a1",
  templateA2: "p65-template-a2",
  templateB1: "p65-template-b1",
  rubricA1: "p65-rubric-a1",
  rubricA2: "p65-rubric-a2",
  rubricB1: "p65-rubric-b1",
  criterionA1Quality: "p65-criterion-a1-quality",
  criterionA1Impact: "p65-criterion-a1-impact",
  criterionA2Quality: "p65-criterion-a2-quality",
  criterionA2Impact: "p65-criterion-a2-impact",
  criterionB1Quality: "p65-criterion-b1-quality",
  manager: "p65-user-manager",
  evaluationManager: "p65-user-evaluation-manager",
  reviewerOne: "p65-user-reviewer-one",
  contestantOne: "p65-user-contestant-one",
  contestantTwo: "p65-user-contestant-two",
  foreignManager: "p65-user-foreign-manager",
  foreignContestant: "p65-user-foreign-contestant",
  submissionA1: "p65-submission-a1",
  submissionB1: "p65-submission-b1",
  runA1: "p65-run-a1",
  runA2: "p65-run-a2",
  runB1: "p65-run-b1",
  assignmentA1: "p65-assignment-a1",
  evaluationA1: "p65-evaluation-a1",
  feedbackA1: "p65-feedback-a1",
  participantA1: "p65-participant-a1",
} as const;

function sha(seed: string): string {
  return seed.repeat(64).slice(0, 64);
}

const STRUCTURAL_PROFILE = JSON.stringify({
  expectedLanguage: "tr",
  sections: [
    { key: "summary", title: "Proje Özeti", description: "", required: true, order: 1 },
    { key: "method", title: "Yöntem", description: "", required: true, order: 2 },
  ],
});

function sqlText(value: string): string {
  return value.replaceAll("'", "''");
}

function insertTemplateVersion(
  local: LocalD1,
  options: {
    id: string;
    competitionId: string;
    versionNumber: number;
    status: "ACTIVE" | "DRAFT" | "RETIRED";
    fileHashSeed: string | null;
  },
): void {
  const fileColumns = options.fileHashSeed
    ? `, '${sqlText(`competitions/${options.competitionId}/template-versions/${options.id}/seed/template.pdf`)}', '${sha(options.fileHashSeed)}', 'sablon.pdf', 'application/pdf', 2048, 1`
    : ", null, null, null, null, null, null";
  local.exec(
    `INSERT INTO template_version (
       id, competition_id, version_number, label, status, structural_profile,
       storage_key, sha256, original_filename, mime_type, size_bytes, file_uploaded_at
     ) VALUES (
       '${options.id}', '${options.competitionId}', ${options.versionNumber}, 'v${options.versionNumber}',
       '${options.status}', '${STRUCTURAL_PROFILE}'${fileColumns}
     )`,
  );
}

export function createP65World(): LocalD1 {
  const local = createLocalD1();

  local.exec(`
    INSERT INTO "user" (id, name, email) VALUES
      ('${P65.manager}', 'Yarışma Yöneticisi', 'p65-mgr@example.com'),
      ('${P65.evaluationManager}', 'Değerlendirme Yöneticisi', 'p65-eval@example.com'),
      ('${P65.reviewerOne}', 'Hakem Bir', 'p65-r1@example.com'),
      ('${P65.contestantOne}', 'Yarışmacı Bir', 'p65-c1@example.com'),
      ('${P65.contestantTwo}', 'Yarışmacı İki', 'p65-c2@example.com'),
      ('${P65.foreignManager}', 'Diğer Yönetici', 'p65-foreign-mgr@example.com'),
      ('${P65.foreignContestant}', 'Diğer Yarışmacı', 'p65-foreign-c@example.com');

    INSERT INTO competition (id, name, slug, description) VALUES
      ('${P65.competitionA}', 'Yarışma A', 'p65-yarisma-a', 'Sentetik'),
      ('${P65.competitionB}', 'Yarışma B', 'p65-yarisma-b', 'Sentetik');

    INSERT INTO competition_member (id, competition_id, user_id, role) VALUES
      ('p65-m-a-mgr', '${P65.competitionA}', '${P65.manager}', 'COMPETITION_MANAGER'),
      ('p65-m-a-eval', '${P65.competitionA}', '${P65.evaluationManager}', 'EVALUATION_MANAGER'),
      ('p65-m-a-r1', '${P65.competitionA}', '${P65.reviewerOne}', 'REVIEWER'),
      ('p65-m-a-c1', '${P65.competitionA}', '${P65.contestantOne}', 'CONTESTANT'),
      ('p65-m-a-c2', '${P65.competitionA}', '${P65.contestantTwo}', 'CONTESTANT'),
      ('p65-m-b-mgr', '${P65.competitionB}', '${P65.foreignManager}', 'COMPETITION_MANAGER'),
      ('p65-m-b-c1', '${P65.competitionB}', '${P65.foreignContestant}', 'CONTESTANT');

    INSERT INTO category (id, competition_id, name, code, description) VALUES
      ('${P65.categoryA}', '${P65.competitionA}', 'Tarım Teknolojileri', 'tarim', 'Sentetik'),
      ('${P65.categoryB}', '${P65.competitionB}', 'Sağlık', 'saglik', 'Sentetik');

    INSERT INTO rubric_version (id, competition_id, version_number, label, status) VALUES
      ('${P65.rubricA1}', '${P65.competitionA}', 1, 'Rubrik v1', 'ACTIVE'),
      ('${P65.rubricB1}', '${P65.competitionB}', 1, 'Rubrik B', 'ACTIVE');

    INSERT INTO criterion (
      id, rubric_version_id, code, title, description, evidence_expectation, max_score,
      weight_basis_points, sort_order
    ) VALUES
      ('${P65.criterionA1Quality}', '${P65.rubricA1}', 'quality', 'Teknik Kalite', 'Sentetik', 'Sayfa alıntısı', 10, 6000, 1),
      ('${P65.criterionA1Impact}', '${P65.rubricA1}', 'impact', 'Etki', 'Sentetik', 'Sayfa alıntısı', 5, 4000, 2),
      ('${P65.criterionB1Quality}', '${P65.rubricB1}', 'quality', 'Teknik Kalite', 'Sentetik', 'Sayfa alıntısı', 10, 10000, 1);

    INSERT INTO submission (id, competition_id, category_id, application_code, project_title) VALUES
      ('${P65.submissionA1}', '${P65.competitionA}', '${P65.categoryA}', 'P65-A1', 'Akıllı Sera'),
      ('${P65.submissionB1}', '${P65.competitionB}', '${P65.categoryB}', 'P65-B1', 'Tanı Destek');

    INSERT INTO submission_file (
      id, submission_id, storage_key, original_filename, mime_type, size_bytes, sha256
    ) VALUES
      ('p65-file-a1', '${P65.submissionA1}', 'competitions/${P65.competitionA}/submissions/${P65.submissionA1}/file/report.pdf', 'rapor.pdf', 'application/pdf', 2048, '${sha("sub-a1")}'),
      ('p65-file-b1', '${P65.submissionB1}', 'competitions/${P65.competitionB}/submissions/${P65.submissionB1}/file/report.pdf', 'rapor.pdf', 'application/pdf', 2048, '${sha("sub-b1")}');

    INSERT INTO reviewer_assignment (id, competition_id, submission_id, reviewer_user_id, assigned_by_user_id) VALUES
      ('${P65.assignmentA1}', '${P65.competitionA}', '${P65.submissionA1}', '${P65.reviewerOne}', '${P65.manager}');

    INSERT INTO submission_participant (id, competition_id, submission_id, user_id) VALUES
      ('${P65.participantA1}', '${P65.competitionA}', '${P65.submissionA1}', '${P65.contestantOne}');
  `);

  insertTemplateVersion(local, {
    id: P65.templateA1,
    competitionId: P65.competitionA,
    versionNumber: 1,
    status: "ACTIVE",
    fileHashSeed: "template-a1",
  });
  insertTemplateVersion(local, {
    id: P65.templateB1,
    competitionId: P65.competitionB,
    versionNumber: 1,
    status: "ACTIVE",
    fileHashSeed: "template-b1",
  });

  local.exec(`
    INSERT INTO analysis_run (
      id, submission_id, category_id, template_version_id, rubric_version_id, source_sha256,
      status, stage, workflow_instance_id, document_artifact_key, page_count, character_count,
      extraction_warnings, created_at, started_at, completed_at
    ) VALUES
      ('${P65.runA1}', '${P65.submissionA1}', '${P65.categoryA}', '${P65.templateA1}', '${P65.rubricA1}', '${sha("sub-a1")}', 'SUCCEEDED', 'RUBRIC_EVALUATION', '${P65.runA1}', 'a1.json', 8, 4000, '[]', 100, 100, 200),
      ('${P65.runB1}', '${P65.submissionB1}', '${P65.categoryB}', '${P65.templateB1}', '${P65.rubricB1}', '${sha("sub-b1")}', 'SUCCEEDED', 'RUBRIC_EVALUATION', '${P65.runB1}', 'b1.json', 6, 3000, '[]', 100, 100, 200);

    INSERT INTO reviewer_evaluation (
      id, assignment_id, submission_id, analysis_run_id, rubric_version_id, status, submitted_at
    ) VALUES (
      '${P65.evaluationA1}', '${P65.assignmentA1}', '${P65.submissionA1}', '${P65.runA1}', '${P65.rubricA1}', 'SUBMITTED', 900
    );

    INSERT INTO reviewer_criterion_score (id, reviewer_evaluation_id, rubric_version_id, criterion_id, score, note) VALUES
      ('p65-score-quality', '${P65.evaluationA1}', '${P65.rubricA1}', '${P65.criterionA1Quality}', 8, 'Yöntem güçlü.'),
      ('p65-score-impact', '${P65.evaluationA1}', '${P65.rubricA1}', '${P65.criterionA1Impact}', 4, null);

    INSERT INTO rubric_suggestion (
      id, analysis_run_id, rubric_version_id, criterion_id, suggested_score, reason,
      evidence_strength, evidence_json, missing_points_json
    ) VALUES
      ('p65-sug-quality', '${P65.runA1}', '${P65.rubricA1}', '${P65.criterionA1Quality}', 7, 'Sentetik gerekçe.', 'HIGH', '[]', '[]'),
      ('p65-sug-impact', '${P65.runA1}', '${P65.rubricA1}', '${P65.criterionA1Impact}', 3, 'Sentetik gerekçe.', 'MEDIUM', '[]', '["Ölçülebilir hedef eksik."]');

    INSERT INTO contestant_feedback (
      id, competition_id, submission_id, source_reviewer_evaluation_id, status, summary,
      strengths_json, improvements_json, recommendations_json, created_by_user_id,
      published_by_user_id, created_at, updated_at, published_at
    ) VALUES (
      '${P65.feedbackA1}', '${P65.competitionA}', '${P65.submissionA1}', '${P65.evaluationA1}', 'PUBLISHED',
      'Projeniz yöntem açısından güçlü bulundu.',
      '["Yöntem bölümü güçlü."]', '["Etki ölçülebilir hedeflerle desteklenmeli."]', '["Pilot uygulama sonuçları eklenebilir."]',
      '${P65.evaluationManager}', '${P65.evaluationManager}', 1000, 1000, 1000
    );
  `);

  return local;
}

export function activateNewVersionsAndAnalyze(local: LocalD1): void {
  local.exec(
    `UPDATE template_version SET status = 'RETIRED', updated_at = 500 WHERE id = '${P65.templateA1}'`,
  );
  local.exec(
    `INSERT INTO template_version (
       id, competition_id, version_number, label, status, structural_profile,
       storage_key, sha256, original_filename, mime_type, size_bytes, file_uploaded_at
     ) VALUES (
       '${P65.templateA2}', '${P65.competitionA}', 2, 'v2', 'ACTIVE', '${STRUCTURAL_PROFILE}',
       'competitions/${P65.competitionA}/template-versions/${P65.templateA2}/seed/template.pdf',
       '${sha("template-a2")}', 'sablon-v2.pdf', 'application/pdf', 2048, 500
     );
     UPDATE rubric_version SET status = 'RETIRED', updated_at = 500 WHERE id = '${P65.rubricA1}';
     INSERT INTO rubric_version (id, competition_id, version_number, label, status) VALUES
       ('${P65.rubricA2}', '${P65.competitionA}', 2, 'Rubrik v2', 'ACTIVE');
     INSERT INTO criterion (
       id, rubric_version_id, code, title, description, evidence_expectation, max_score,
       weight_basis_points, sort_order
     ) VALUES
       ('${P65.criterionA2Quality}', '${P65.rubricA2}', 'quality', 'Teknik Kalite', 'Sentetik', 'Sayfa alıntısı', 20, 6000, 1),
       ('${P65.criterionA2Impact}', '${P65.rubricA2}', 'impact', 'Etki', 'Sentetik', 'Sayfa alıntısı', 10, 4000, 2);
     INSERT INTO analysis_run (
       id, submission_id, category_id, template_version_id, rubric_version_id, source_sha256,
       status, stage, workflow_instance_id, document_artifact_key, page_count, character_count,
       extraction_warnings, created_at, started_at, completed_at
     ) VALUES (
       '${P65.runA2}', '${P65.submissionA1}', '${P65.categoryA}', '${P65.templateA2}', '${P65.rubricA2}',
       '${sha("sub-a1")}', 'SUCCEEDED', 'RUBRIC_EVALUATION', '${P65.runA2}', 'a2.json', 8, 4000, '[]', 600, 600, 700
     );`,
  );
}
