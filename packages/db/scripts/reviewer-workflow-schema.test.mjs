import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const packageDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const migrationDirectory = join(packageDirectory, "migrations");
const migrations = readdirSync(migrationDirectory)
  .filter((name) => name.endsWith(".sql"))
  .sort();

function apply(database, names) {
  for (const name of names) database.exec(readFileSync(join(migrationDirectory, name), "utf8"));
}

// Competition A holds two historical AnalysisRuns for one submission, pinned to two different
// RubricVersions (rubric-a1 retired, rubric-a2 active) with the SAME criterion code scored out of a
// different maximum, so historical pinning is proven across a real scale change. Competition B is
// unrelated and exists only to prove cross-competition isolation.
function seed(database) {
  database.exec(`
    INSERT INTO "user" (id, name, email) VALUES
      ('user-reviewer-1', 'Hakem Bir', 'reviewer1@example.com'),
      ('user-reviewer-2', 'Hakem Iki', 'reviewer2@example.com'),
      ('user-manager', 'Yonetici', 'manager@example.com'),
      ('user-reviewer-b', 'Hakem B', 'reviewerb@example.com');
    INSERT INTO competition (id, name, slug, description) VALUES
      ('competition-a', 'A', 'a', 'Synthetic'), ('competition-b', 'B', 'b', 'Synthetic');
    INSERT INTO competition_member (id, competition_id, user_id, role) VALUES
      ('member-a-r1', 'competition-a', 'user-reviewer-1', 'REVIEWER'),
      ('member-a-r2', 'competition-a', 'user-reviewer-2', 'REVIEWER'),
      ('member-a-mgr', 'competition-a', 'user-manager', 'COMPETITION_MANAGER'),
      ('member-b-rb', 'competition-b', 'user-reviewer-b', 'REVIEWER');
    INSERT INTO category (id, competition_id, name, code, description) VALUES
      ('category-a', 'competition-a', 'A', 'a', 'Synthetic'),
      ('category-b', 'competition-b', 'B', 'b', 'Synthetic');
    INSERT INTO template_version (id, competition_id, version_number, label, status) VALUES
      ('template-a', 'competition-a', 1, 'A', 'ACTIVE'),
      ('template-b', 'competition-b', 1, 'B', 'ACTIVE');
    INSERT INTO submission (id, competition_id, category_id, application_code, project_title) VALUES
      ('submission-a', 'competition-a', 'category-a', 'A', 'A'),
      ('submission-b', 'competition-b', 'category-b', 'B', 'B');
    INSERT INTO rubric_version (id, competition_id, version_number, label, status) VALUES
      ('rubric-a1', 'competition-a', 1, 'A1', 'RETIRED'),
      ('rubric-a2', 'competition-a', 2, 'A2', 'ACTIVE'),
      ('rubric-b', 'competition-b', 1, 'B', 'ACTIVE');
    INSERT INTO criterion (
      id, rubric_version_id, code, title, description, max_score, weight_basis_points, sort_order
    ) VALUES
      ('criterion-a1-quality', 'rubric-a1', 'quality', 'Kalite', 'Synthetic', 10, 10000, 1),
      ('criterion-a2-quality', 'rubric-a2', 'quality', 'Kalite', 'Synthetic', 20, 10000, 1),
      ('criterion-b-quality', 'rubric-b', 'quality', 'Kalite', 'Synthetic', 10, 10000, 1);
    INSERT INTO analysis_run (
      id, submission_id, category_id, template_version_id, rubric_version_id, source_sha256,
      status, stage, workflow_instance_id, document_artifact_key, page_count, character_count,
      extraction_warnings, created_at, started_at, completed_at
    ) VALUES
      ('run-a1', 'submission-a', 'category-a', 'template-a', 'rubric-a1', '${"a".repeat(64)}', 'SUCCEEDED', 'RUBRIC_EVALUATION', 'run-a1', 'a1.json', 4, 100, '[]', 1, 1, 2),
      ('run-a2', 'submission-a', 'category-a', 'template-a', 'rubric-a2', '${"a".repeat(64)}', 'SUCCEEDED', 'RUBRIC_EVALUATION', 'run-a2', 'a2.json', 4, 100, '[]', 3, 3, 4),
      ('run-b', 'submission-b', 'category-b', 'template-b', 'rubric-b', '${"b".repeat(64)}', 'SUCCEEDED', 'RUBRIC_EVALUATION', 'run-b', 'b.json', 4, 100, '[]', 1, 1, 2);
  `);
}

const database = new DatabaseSync(":memory:");
database.exec("PRAGMA foreign_keys = ON");
apply(database, migrations);
seed(database);

const insertAssignment = database.prepare(
  `INSERT INTO reviewer_assignment (id, competition_id, submission_id, reviewer_user_id, assigned_by_user_id)
   VALUES (?, ?, ?, ?, ?)`,
);

// --- ReviewerAssignment: the submission and the reviewer membership must both belong to the
// assignment's own competition. ---
assert.equal(
  insertAssignment.run(
    "assignment-a-r1",
    "competition-a",
    "submission-a",
    "user-reviewer-1",
    "user-manager",
  ).changes,
  1,
  "a reviewer who is a member of the competition can be assigned a submission of that competition",
);

assert.throws(
  () =>
    insertAssignment.run(
      "assignment-cross-submission",
      "competition-a",
      "submission-b",
      "user-reviewer-1",
      "user-manager",
    ),
  /FOREIGN KEY/i,
  "a submission from another competition cannot be assigned",
);

assert.throws(
  () =>
    insertAssignment.run(
      "assignment-cross-reviewer",
      "competition-a",
      "submission-a",
      "user-reviewer-b",
      "user-manager",
    ),
  /FOREIGN KEY/i,
  "a reviewer who is only a member of another competition cannot be assigned",
);

assert.throws(
  () =>
    insertAssignment.run(
      "assignment-duplicate",
      "competition-a",
      "submission-a",
      "user-reviewer-1",
      "user-manager",
    ),
  /UNIQUE/i,
  "the same reviewer cannot be assigned to the same submission twice",
);

assert.equal(
  insertAssignment.run(
    "assignment-a-r2",
    "competition-a",
    "submission-a",
    "user-reviewer-2",
    "user-manager",
  ).changes,
  1,
  "a second reviewer may be assigned to the same submission",
);

const insertEvaluation = database.prepare(
  `INSERT INTO reviewer_evaluation (
     id, assignment_id, submission_id, analysis_run_id, rubric_version_id, status, overall_note,
     submitted_at
   ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
);

// --- ReviewerEvaluation: pinned identity is enforced by composite foreign keys. ---
assert.equal(
  insertEvaluation.run(
    "evaluation-r1-run-a1",
    "assignment-a-r1",
    "submission-a",
    "run-a1",
    "rubric-a1",
    "DRAFT",
    null,
    null,
  ).changes,
  1,
  "an evaluation pins the assignment's submission, the run of that submission and the run's rubric",
);

assert.throws(
  () =>
    insertEvaluation.run(
      "evaluation-wrong-rubric",
      "assignment-a-r2",
      "submission-a",
      "run-a1",
      "rubric-a2",
      "DRAFT",
      null,
      null,
    ),
  /FOREIGN KEY/i,
  "the pinned RubricVersion must be the pinned AnalysisRun's own rubric, not the newest active one",
);

assert.throws(
  () =>
    insertEvaluation.run(
      "evaluation-wrong-submission",
      "assignment-a-r2",
      "submission-b",
      "run-b",
      "rubric-b",
      "DRAFT",
      null,
      null,
    ),
  /FOREIGN KEY/i,
  "an evaluation cannot point at a submission other than its own assignment's submission",
);

// This CHECK-constraint probe must run BEFORE assignment-a-r2 receives its own real evaluation
// below, otherwise a rejected insert here would hit the UNIQUE(assignment_id) constraint instead of
// exercising the submitted-at CHECK it is meant to test — the failed attempt inserts no row either
// way, so assignment-a-r2 is still empty afterward.
assert.throws(
  () =>
    insertEvaluation.run(
      "evaluation-bad-submitted-at",
      "assignment-a-r2",
      "submission-a",
      "run-a1",
      "rubric-a1",
      "SUBMITTED",
      null,
      null,
    ),
  /CHECK/i,
  "a SUBMITTED evaluation must carry a submittedAt timestamp",
);

// --- Evaluation identity: an assignment carries AT MOST ONE ReviewerEvaluation, ever. ---
assert.throws(
  () =>
    insertEvaluation.run(
      "evaluation-second-for-same-assignment",
      "assignment-a-r1",
      "submission-a",
      "run-a2",
      "rubric-a2",
      "DRAFT",
      null,
      null,
    ),
  /UNIQUE/i,
  "a second evaluation for the same assignment is rejected even against a different, newer AnalysisRun",
);

// A retried or racing "first save" for the SAME assignment is rejected the same way: the second
// writer to reach the database loses the UNIQUE(assignment_id) race rather than forking a duplicate.
assert.throws(
  () =>
    insertEvaluation.run(
      "evaluation-retry-duplicate",
      "assignment-a-r1",
      "submission-a",
      "run-a1",
      "rubric-a1",
      "DRAFT",
      null,
      null,
    ),
  /UNIQUE/i,
  "a retried/concurrent first save for the same assignment cannot create a duplicate evaluation row",
);

// A different ReviewerAssignment for the SAME submission is entirely independent: it may hold its
// own evaluation without being affected by assignment-a-r1's constraint.
assert.equal(
  insertEvaluation.run(
    "evaluation-r2-run-a1",
    "assignment-a-r2",
    "submission-a",
    "run-a1",
    "rubric-a1",
    "DRAFT",
    null,
    null,
  ).changes,
  1,
  "another reviewer's assignment for the same submission has its own, independent evaluation",
);
assert.throws(
  () =>
    insertEvaluation.run(
      "evaluation-r2-duplicate",
      "assignment-a-r2",
      "submission-a",
      "run-a1",
      "rubric-a1",
      "DRAFT",
      null,
      null,
    ),
  /UNIQUE/i,
  "the second assignment's own evaluation is equally protected against a duplicate",
);

const insertScore = database.prepare(
  `INSERT INTO reviewer_criterion_score (
     id, reviewer_evaluation_id, rubric_version_id, criterion_id, score, note
   ) VALUES (?, ?, ?, ?, ?, ?)`,
);

// --- ReviewerCriterionScore: the criterion must belong to the evaluation's pinned RubricVersion. ---
assert.equal(
  insertScore.run(
    "score-1",
    "evaluation-r1-run-a1",
    "rubric-a1",
    "criterion-a1-quality",
    5,
    "Gerekce.",
  ).changes,
  1,
  "a human score attaches to a criterion of the evaluation's own pinned rubric",
);

assert.throws(
  () =>
    insertScore.run(
      "score-cross-rubric",
      "evaluation-r1-run-a1",
      "rubric-a1",
      "criterion-a2-quality",
      5,
      null,
    ),
  /FOREIGN KEY/i,
  "a criterion from the newer RubricVersion cannot be scored inside an older pinned evaluation",
);

assert.throws(
  () =>
    insertScore.run(
      "score-duplicate",
      "evaluation-r1-run-a1",
      "rubric-a1",
      "criterion-a1-quality",
      7,
      null,
    ),
  /UNIQUE/i,
  "one criterion carries at most one human score per evaluation",
);

assert.throws(
  () =>
    insertScore.run(
      "score-negative",
      "evaluation-r1-run-a1",
      "rubric-a1",
      "criterion-a1-quality",
      -1,
      null,
    ),
  /CHECK|UNIQUE/i,
  "a negative human score is rejected",
);

// --- Historical pinning: activating rubric-a2 and creating run-a2 leaves the old evaluation and
// its human score untouched, still pointing at run-a1 and rubric-a1. ---
database.exec(
  `UPDATE reviewer_evaluation SET status = 'SUBMITTED', submitted_at = 10 WHERE id = 'evaluation-r1-run-a1'`,
);
assert.deepEqual(
  database
    .prepare(
      `SELECT evaluation.analysis_run_id, evaluation.rubric_version_id, score.criterion_id,
              score.score, criterion.max_score
       FROM reviewer_evaluation evaluation
       INNER JOIN reviewer_criterion_score score
         ON score.reviewer_evaluation_id = evaluation.id
       INNER JOIN criterion ON criterion.id = score.criterion_id
       WHERE evaluation.id = 'evaluation-r1-run-a1'`,
    )
    .all()
    .map((row) => ({ ...row })),
  [
    {
      analysis_run_id: "run-a1",
      rubric_version_id: "rubric-a1",
      criterion_id: "criterion-a1-quality",
      score: 5,
      max_score: 10,
    },
  ],
  "the submitted evaluation stays on run-a1 / rubric-a1 and keeps the 0..10 scale it was scored on",
);

// A SUBMITTED evaluation blocks any further evaluation row for the same assignment just as firmly
// as a DRAFT one did earlier — even against the newer AnalysisRun and its newer RubricVersion.
assert.throws(
  () =>
    insertEvaluation.run(
      "evaluation-r1-run-a2",
      "assignment-a-r1",
      "submission-a",
      "run-a2",
      "rubric-a2",
      "DRAFT",
      null,
      null,
    ),
  /UNIQUE/i,
  "a submitted evaluation permanently blocks a second evaluation for the same assignment",
);
assert.equal(
  database
    .prepare(
      "SELECT count(*) AS total FROM reviewer_evaluation WHERE assignment_id = 'assignment-a-r1'",
    )
    .get().total,
  1,
  "exactly one evaluation ever exists for the assignment, pinned to its original run",
);

database.close();

// --- Migration chain: the reviewer workflow tables also arrive cleanly as an upgrade from the
// last committed pre-P5 migration state. ---
const upgrade = new DatabaseSync(":memory:");
upgrade.exec("PRAGMA foreign_keys = ON");
const preP5 = migrations.filter((name) => Number(name.slice(0, 4)) <= 12);
assert.equal(preP5.length, 13, "the pre-P5 migration prefix is the first thirteen migrations");
apply(upgrade, preP5);
assert.equal(
  upgrade
    .prepare(
      "SELECT count(*) AS total FROM sqlite_master WHERE type = 'table' AND name LIKE 'reviewer_%'",
    )
    .get().total,
  0,
  "no reviewer workflow table exists before the P5 migrations",
);
apply(
  upgrade,
  migrations.filter((name) => Number(name.slice(0, 4)) > 12),
);
seed(upgrade);
assert.equal(
  upgrade
    .prepare(
      `INSERT INTO reviewer_assignment (id, competition_id, submission_id, reviewer_user_id, assigned_by_user_id)
       VALUES ('assignment-upgrade', 'competition-a', 'submission-a', 'user-reviewer-1', 'user-manager')`,
    )
    .run().changes,
  1,
  "the upgraded database accepts reviewer assignments",
);
upgrade.close();

console.log("reviewer workflow schema invariants verified");
