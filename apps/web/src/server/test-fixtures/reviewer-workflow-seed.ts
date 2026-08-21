import { createLocalD1, type LocalD1 } from "./local-d1";

// Test-only synthetic world for the reviewer workspace. Two competitions exist so cross-competition
// isolation can be asserted, and competition A carries TWO historical AnalysisRuns for one
// submission pinned to two different RubricVersions, so historical pinning can be asserted against
// a real rubric activation. Only synthetic data is used; no real report or contestant is involved.
//
// Competition A
//   submission-a1  run-a1 (rubric-a1, criteria out of 10 + 5)  run-a2 (rubric-a2, out of 20 + 10)
//   submission-a2  run-a3 (rubric-a2)
//   reviewers: user-r1, user-r2      manager: user-mgr      evaluation manager: user-eval
// Competition B
//   submission-b1  run-b1 (rubric-b)       reviewer: user-rb

export const SEED = {
  competitionA: "competition-a",
  competitionB: "competition-b",
  submissionA1: "submission-a1",
  submissionA2: "submission-a2",
  /** Has no AnalysisRun at all, so the queue reports the analysis as unavailable. */
  submissionA3: "submission-a3",
  /** Has a QUEUED AnalysisRun, so the queue reports the analysis as still running. */
  submissionA4: "submission-a4",
  submissionB1: "submission-b1",
  runA1: "run-a1",
  runA2: "run-a2",
  runA3: "run-a3",
  runB1: "run-b1",
  rubricA1: "rubric-a1",
  rubricA2: "rubric-a2",
  reviewerOne: "user-r1",
  reviewerTwo: "user-r2",
  reviewerB: "user-rb",
  manager: "user-mgr",
  evaluationManager: "user-eval",
  /** rubric-a1 criteria: quality out of 10, impact out of 5 (max total 15). */
  criterionA1Quality: "criterion-a1-quality",
  criterionA1Impact: "criterion-a1-impact",
  /** rubric-a2 criteria: quality out of 20, impact out of 10 (max total 30). */
  criterionA2Quality: "criterion-a2-quality",
  criterionA2Impact: "criterion-a2-impact",
  criterionB: "criterion-b-quality",
} as const;

function sha(seed: string): string {
  return seed.repeat(64).slice(0, 64);
}

/**
 * Creates an in-memory database with the full generated migration chain applied and the synthetic
 * reviewer world seeded, including persisted AI rubric suggestions for `run-a1` and `run-a2`.
 */
export function createReviewerWorld(): LocalD1 {
  const local = createLocalD1();
  local.exec(`
    INSERT INTO "user" (id, name, email) VALUES
      ('${SEED.reviewerOne}', 'Hakem Bir', 'r1@example.com'),
      ('${SEED.reviewerTwo}', 'Hakem İki', 'r2@example.com'),
      ('${SEED.reviewerB}', 'Hakem B', 'rb@example.com'),
      ('${SEED.manager}', 'Yarışma Yöneticisi', 'mgr@example.com'),
      ('${SEED.evaluationManager}', 'Değerlendirme Yöneticisi', 'eval@example.com');

    INSERT INTO competition (id, name, slug, description) VALUES
      ('${SEED.competitionA}', 'Yarışma A', 'yarisma-a', 'Sentetik'),
      ('${SEED.competitionB}', 'Yarışma B', 'yarisma-b', 'Sentetik');

    INSERT INTO competition_member (id, competition_id, user_id, role) VALUES
      ('m-a-r1', '${SEED.competitionA}', '${SEED.reviewerOne}', 'REVIEWER'),
      ('m-a-r2', '${SEED.competitionA}', '${SEED.reviewerTwo}', 'REVIEWER'),
      ('m-a-mgr', '${SEED.competitionA}', '${SEED.manager}', 'COMPETITION_MANAGER'),
      ('m-a-eval', '${SEED.competitionA}', '${SEED.evaluationManager}', 'EVALUATION_MANAGER'),
      ('m-b-rb', '${SEED.competitionB}', '${SEED.reviewerB}', 'REVIEWER');

    INSERT INTO category (id, competition_id, name, code, description) VALUES
      ('category-a', '${SEED.competitionA}', 'Tarım Teknolojileri', 'tarim', 'Sentetik'),
      ('category-b', '${SEED.competitionB}', 'Sağlık', 'saglik', 'Sentetik');

    INSERT INTO template_version (id, competition_id, version_number, label, status) VALUES
      ('template-a', '${SEED.competitionA}', 1, 'A', 'ACTIVE'),
      ('template-b', '${SEED.competitionB}', 1, 'B', 'ACTIVE');

    INSERT INTO rubric_version (id, competition_id, version_number, label, status) VALUES
      ('${SEED.rubricA1}', '${SEED.competitionA}', 1, 'Rubrik v1', 'RETIRED'),
      ('${SEED.rubricA2}', '${SEED.competitionA}', 2, 'Rubrik v2', 'ACTIVE'),
      ('rubric-b', '${SEED.competitionB}', 1, 'Rubrik B', 'ACTIVE');

    INSERT INTO criterion (
      id, rubric_version_id, code, title, description, evidence_expectation, max_score,
      weight_basis_points, sort_order
    ) VALUES
      ('${SEED.criterionA1Quality}', '${SEED.rubricA1}', 'quality', 'Teknik Kalite', 'Sentetik', 'Sayfa alıntısı', 10, 6000, 1),
      ('${SEED.criterionA1Impact}', '${SEED.rubricA1}', 'impact', 'Etki', 'Sentetik', 'Sayfa alıntısı', 5, 4000, 2),
      ('${SEED.criterionA2Quality}', '${SEED.rubricA2}', 'quality', 'Teknik Kalite', 'Sentetik', 'Sayfa alıntısı', 20, 6000, 1),
      ('${SEED.criterionA2Impact}', '${SEED.rubricA2}', 'impact', 'Etki', 'Sentetik', 'Sayfa alıntısı', 10, 4000, 2),
      ('${SEED.criterionB}', 'rubric-b', 'quality', 'Teknik Kalite', 'Sentetik', 'Sayfa alıntısı', 10, 10000, 1);

    INSERT INTO submission (id, competition_id, category_id, application_code, project_title) VALUES
      ('${SEED.submissionA1}', '${SEED.competitionA}', 'category-a', 'A-001', 'Akıllı Sera'),
      ('${SEED.submissionA2}', '${SEED.competitionA}', 'category-a', 'A-002', 'Toprak Analizi'),
      ('${SEED.submissionA3}', '${SEED.competitionA}', 'category-a', 'A-003', 'Analizi Olmayan Proje'),
      ('${SEED.submissionA4}', '${SEED.competitionA}', 'category-a', 'A-004', 'Analizi Süren Proje'),
      ('${SEED.submissionB1}', '${SEED.competitionB}', 'category-b', 'B-001', 'Tanı Destek');

    INSERT INTO submission_file (
      id, submission_id, storage_key, original_filename, mime_type, size_bytes, sha256
    ) VALUES
      ('file-a1', '${SEED.submissionA1}', 'competitions/${SEED.competitionA}/submissions/${SEED.submissionA1}/file-a1/report.pdf', 'rapor.pdf', 'application/pdf', 2048, '${sha("a")}'),
      ('file-a2', '${SEED.submissionA2}', 'competitions/${SEED.competitionA}/submissions/${SEED.submissionA2}/file-a2/report.pdf', 'rapor.pdf', 'application/pdf', 2048, '${sha("c")}'),
      ('file-a3', '${SEED.submissionA3}', 'competitions/${SEED.competitionA}/submissions/${SEED.submissionA3}/file-a3/report.pdf', 'rapor.pdf', 'application/pdf', 2048, '${sha("d")}'),
      ('file-a4', '${SEED.submissionA4}', 'competitions/${SEED.competitionA}/submissions/${SEED.submissionA4}/file-a4/report.pdf', 'rapor.pdf', 'application/pdf', 2048, '${sha("e")}'),
      ('file-b1', '${SEED.submissionB1}', 'competitions/${SEED.competitionB}/submissions/${SEED.submissionB1}/file-b1/report.pdf', 'rapor.pdf', 'application/pdf', 2048, '${sha("b")}');

    INSERT INTO analysis_run (
      id, submission_id, category_id, template_version_id, rubric_version_id, source_sha256,
      status, stage, workflow_instance_id, document_artifact_key, page_count, character_count,
      extraction_warnings, created_at, started_at, completed_at
    ) VALUES
      ('${SEED.runA1}', '${SEED.submissionA1}', 'category-a', 'template-a', '${SEED.rubricA1}', '${sha("a")}', 'SUCCEEDED', 'RUBRIC_EVALUATION', '${SEED.runA1}', 'a1.json', 8, 4000, '[]', 100, 100, 200),
      ('${SEED.runA3}', '${SEED.submissionA2}', 'category-a', 'template-a', '${SEED.rubricA2}', '${sha("c")}', 'SUCCEEDED', 'RUBRIC_EVALUATION', '${SEED.runA3}', 'a3.json', 6, 3000, '[]', 100, 100, 200),
      ('${SEED.runB1}', '${SEED.submissionB1}', 'category-b', 'template-b', 'rubric-b', '${sha("b")}', 'SUCCEEDED', 'RUBRIC_EVALUATION', '${SEED.runB1}', 'b1.json', 5, 2000, '[]', 100, 100, 200);

    INSERT INTO analysis_run (
      id, submission_id, category_id, template_version_id, rubric_version_id, source_sha256,
      status, stage, workflow_instance_id, extraction_warnings, created_at, started_at
    ) VALUES
      ('run-a4-inflight', '${SEED.submissionA4}', 'category-a', 'template-a', '${SEED.rubricA2}', '${sha("e")}', 'QUEUED', 'INGEST_AND_EXTRACT', 'run-a4-inflight', '[]', 100, null);

    INSERT INTO rubric_suggestion (
      id, analysis_run_id, rubric_version_id, criterion_id, suggested_score, reason,
      evidence_strength, evidence_json, missing_points_json
    ) VALUES
      ('sug-a1-quality', '${SEED.runA1}', '${SEED.rubricA1}', '${SEED.criterionA1Quality}', 7, 'Yöntem bölümü doğrulanmış kanıtla desteklenmiş.', 'HIGH', '[{"page":4,"excerpt":"Sentetik doğrulanmış alıntı.","verified":true}]', '[]'),
      ('sug-a1-impact', '${SEED.runA1}', '${SEED.rubricA1}', '${SEED.criterionA1Impact}', 3, 'Etki ölçütü kısmen karşılanmış.', 'MEDIUM', '[{"page":6,"excerpt":"Etki ile ilgili sentetik alıntı.","verified":true}]', '["Ölçülebilir hedef yok."]');
  `);
  return local;
}

/**
 * Activates rubric v2 for competition A and creates a second, newer AnalysisRun for
 * `submission-a1`, together with that run's own AI suggestions. This is the historical-integrity
 * scenario: nothing already written against `run-a1` / `rubric-a1` may move onto the new records.
 */
export function activateRubricV2AndCreateNewerRun(local: LocalD1): void {
  local.exec(`
    INSERT INTO analysis_run (
      id, submission_id, category_id, template_version_id, rubric_version_id, source_sha256,
      status, stage, workflow_instance_id, document_artifact_key, page_count, character_count,
      extraction_warnings, created_at, started_at, completed_at
    ) VALUES
      ('${SEED.runA2}', '${SEED.submissionA1}', 'category-a', 'template-a', '${SEED.rubricA2}', '${sha("a")}', 'SUCCEEDED', 'RUBRIC_EVALUATION', '${SEED.runA2}', 'a2.json', 8, 4000, '[]', 500, 500, 600);

    INSERT INTO rubric_suggestion (
      id, analysis_run_id, rubric_version_id, criterion_id, suggested_score, reason,
      evidence_strength, evidence_json, missing_points_json
    ) VALUES
      ('sug-a2-quality', '${SEED.runA2}', '${SEED.rubricA2}', '${SEED.criterionA2Quality}', 16, 'Yeni rubrik ölçeğinde teknik kalite.', 'HIGH', '[{"page":4,"excerpt":"Sentetik doğrulanmış alıntı.","verified":true}]', '[]'),
      ('sug-a2-impact', '${SEED.runA2}', '${SEED.rubricA2}', '${SEED.criterionA2Impact}', 6, 'Yeni rubrik ölçeğinde etki.', 'LOW', '[]', '[]');
  `);
}

export function assignReviewer(
  local: LocalD1,
  id: string,
  competitionId: string,
  submissionId: string,
  reviewerUserId: string,
  assignedByUserId: string = SEED.manager,
): void {
  local.exec(
    `INSERT INTO reviewer_assignment (id, competition_id, submission_id, reviewer_user_id, assigned_by_user_id)
     VALUES ('${id}', '${competitionId}', '${submissionId}', '${reviewerUserId}', '${assignedByUserId}')`,
  );
}
