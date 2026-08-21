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

// Competition A has two historical AnalysisRuns for one submission, pinned to two different
// RubricVersions (rubric-a1 -> rubric-a2 activation). Competition B is unrelated, cross-scope only.
function seed(database) {
  database.exec(`
    INSERT INTO competition (id, name, slug, description) VALUES
      ('competition-a', 'A', 'a', 'Synthetic'), ('competition-b', 'B', 'b', 'Synthetic');
    INSERT INTO category (id, competition_id, name, code, description) VALUES
      ('category-a', 'competition-a', 'A', 'a', 'Synthetic'),
      ('category-b', 'competition-b', 'B', 'b', 'Synthetic');
    INSERT INTO template_version (id, competition_id, version_number, label, status) VALUES
      ('template-a', 'competition-a', 1, 'A', 'ACTIVE'),
      ('template-b', 'competition-b', 1, 'B', 'ACTIVE');
    INSERT INTO submission (id, competition_id, category_id, application_code, project_title) VALUES
      ('submission-a', 'competition-a', 'category-a', 'A', 'A'),
      ('submission-b1', 'competition-b', 'category-b', 'B1', 'B1');
    INSERT INTO rubric_version (id, competition_id, version_number, label, status) VALUES
      ('rubric-a1', 'competition-a', 1, 'A1', 'RETIRED'),
      ('rubric-a2', 'competition-a', 2, 'A2', 'ACTIVE'),
      ('rubric-b', 'competition-b', 1, 'B', 'ACTIVE');
    INSERT INTO criterion (
      id, rubric_version_id, code, title, description, max_score, weight_basis_points, sort_order
    ) VALUES
      -- The same criterion code 'quality' is deliberately scored out of 10 in rubric-a1 and out of
      -- 20 in rubric-a2, so historical isolation is proven across a real scale change.
      ('criterion-a1-quality', 'rubric-a1', 'quality', 'Kalite', 'Synthetic', 10, 10000, 1),
      ('criterion-a2-quality', 'rubric-a2', 'quality', 'Kalite', 'Synthetic', 20, 10000, 1),
      ('criterion-a2-impact', 'rubric-a2', 'impact', 'Etki', 'Synthetic', 5, 10000, 2),
      ('criterion-b-quality', 'rubric-b', 'quality', 'Kalite', 'Synthetic', 10, 10000, 1);
    INSERT INTO analysis_run (
      id, submission_id, category_id, template_version_id, rubric_version_id, source_sha256,
      status, stage, workflow_instance_id, document_artifact_key, page_count, character_count,
      extraction_warnings, created_at, started_at, completed_at
    ) VALUES
      ('run-a1', 'submission-a', 'category-a', 'template-a', 'rubric-a1', '${"a".repeat(64)}', 'SUCCEEDED', 'SIMILARITY_CHECKS', 'run-a1', 'a1.json', 1, 100, '[]', 1, 1, 2),
      ('run-a2', 'submission-a', 'category-a', 'template-a', 'rubric-a2', '${"a".repeat(64)}', 'SUCCEEDED', 'SIMILARITY_CHECKS', 'run-a2', 'a2.json', 1, 100, '[]', 3, 3, 4),
      ('run-b1', 'submission-b1', 'category-b', 'template-b', 'rubric-b', '${"b".repeat(64)}', 'SUCCEEDED', 'SIMILARITY_CHECKS', 'run-b1', 'b1.json', 1, 100, '[]', 1, 1, 2);
  `);
}

const database = new DatabaseSync(":memory:");
database.exec("PRAGMA foreign_keys = ON");
apply(database, migrations);
seed(database);

const insert = database.prepare(`INSERT INTO rubric_suggestion (
  id, analysis_run_id, rubric_version_id, criterion_id, suggested_score, reason,
  evidence_strength, evidence_json, missing_points_json
) VALUES (?, ?, ?, ?, ?, ?, ?, '[]', '[]')`);

// --- Historical identity: run-a1 (pinned to rubric-a1) and run-a2 (pinned to rubric-a2, after
// activation) each own their own suggestions against their own pinned criteria. ---
assert.equal(
  insert.run("s-a1-quality", "run-a1", "rubric-a1", "criterion-a1-quality", 7, "İyi.", "HIGH")
    .changes,
  1,
);
assert.equal(
  insert.run("s-a2-quality", "run-a2", "rubric-a2", "criterion-a2-quality", 9, "Çok iyi.", "HIGH")
    .changes,
  1,
);
assert.equal(
  insert.run("s-a2-impact", "run-a2", "rubric-a2", "criterion-a2-impact", 3, "Orta.", "MEDIUM")
    .changes,
  1,
);
assert.equal(database.prepare("SELECT count(*) AS count FROM rubric_suggestion").get().count, 3);

// The same run/criterion pair may exist only once, regardless of the row id.
assert.throws(
  () =>
    insert.run("s-duplicate", "run-a1", "rubric-a1", "criterion-a1-quality", 5, "Duplicate", "LOW"),
  /UNIQUE constraint failed/u,
);

// --- Composite ownership is enforced by the database, bypassing repository validation. ---
// run-a1 is pinned to rubric-a1, not rubric-a2: (analysis_run_id, rubric_version_id) has no parent.
assert.throws(
  () => insert.run("s-wrong-run-pin", "run-a1", "rubric-a2", "criterion-a2-quality", 5, "x", "LOW"),
  /FOREIGN KEY constraint failed/u,
);
// criterion-b-quality belongs to rubric-b, not rubric-a1: (rubric_version_id, criterion_id) has no
// parent, even though run-a1 and criterion-b-quality both otherwise "exist".
assert.throws(
  () => insert.run("s-cross-rubric", "run-a1", "rubric-a1", "criterion-b-quality", 5, "x", "LOW"),
  /FOREIGN KEY constraint failed/u,
);
// A cross-competition criterion can never attach even indirectly through a matching rubric id.
assert.throws(
  () =>
    insert.run("s-cross-competition", "run-b1", "rubric-b", "criterion-a2-quality", 5, "x", "LOW"),
  /FOREIGN KEY constraint failed/u,
);
assert.equal(database.prepare("SELECT count(*) AS count FROM rubric_suggestion").get().count, 3);

// --- Score bound is enforced at the database boundary too, not only by application validation. ---
assert.throws(
  () => insert.run("s-negative", "run-a1", "rubric-a1", "criterion-a1-quality", -1, "x", "LOW"),
  /CHECK constraint failed/u,
);

// --- Retry reconciles the same logical suggestion and never appends a duplicate. ---
const before = database.prepare("SELECT * FROM rubric_suggestion WHERE id = 's-a1-quality'").get();
database.exec(`INSERT INTO rubric_suggestion (
  id, analysis_run_id, rubric_version_id, criterion_id, suggested_score, reason,
  evidence_strength, evidence_json, missing_points_json, updated_at
) VALUES ('retry', 'run-a1', 'rubric-a1', 'criterion-a1-quality', 8, 'Retry.', 'MEDIUM', '[]', '[]', 999)
ON CONFLICT (analysis_run_id, criterion_id) DO UPDATE SET
  suggested_score = excluded.suggested_score,
  reason = excluded.reason,
  evidence_strength = excluded.evidence_strength,
  updated_at = excluded.updated_at;`);
const after = database.prepare("SELECT * FROM rubric_suggestion WHERE id = 's-a1-quality'").get();
assert.equal(database.prepare("SELECT count(*) AS count FROM rubric_suggestion").get().count, 3);
assert.equal(after.id, before.id);
assert.equal(after.analysis_run_id, before.analysis_run_id);
assert.equal(after.criterion_id, before.criterion_id);
assert.equal(after.created_at, before.created_at);
assert.equal(after.suggested_score, 8);
assert.equal(after.evidence_strength, "MEDIUM");

// --- Activating a new RubricVersion must never mutate an older run's historical suggestions. ---
const untouchedQuality = database
  .prepare("SELECT * FROM rubric_suggestion WHERE id = 's-a2-quality'")
  .get();
assert.equal(untouchedQuality.suggested_score, 9);
assert.equal(untouchedQuality.rubric_version_id, "rubric-a2");
const runA1AfterActivation = database
  .prepare("SELECT rubric_version_id FROM analysis_run WHERE id = 'run-a1'")
  .get();
assert.equal(
  runA1AfterActivation.rubric_version_id,
  "rubric-a1",
  "run-a1 must stay pinned to its own RubricVersion after rubric-a2 activation",
);

// --- A RubricVersion that changes a criterion's SCALE must not retroactively rescore history. ---
// 'quality' is out of 10 in rubric-a1 and out of 20 in rubric-a2. Each run's suggestion must read
// the maxScore of its OWN pinned criterion, so the historical score keeps its original meaning
// (8/10) instead of silently becoming 8/20 once the wider scale became active.
const scaleByRun = database
  .prepare(
    `SELECT rs.analysis_run_id, rs.suggested_score, c.max_score
     FROM rubric_suggestion rs
     INNER JOIN criterion c ON c.id = rs.criterion_id
     WHERE c.code = 'quality'
     ORDER BY rs.analysis_run_id`,
  )
  .all();
assert.deepEqual(
  scaleByRun.map((row) => ({ ...row })),
  [
    { analysis_run_id: "run-a1", suggested_score: 8, max_score: 10 },
    { analysis_run_id: "run-a2", suggested_score: 9, max_score: 20 },
  ],
  "Each run's suggestion must resolve the maxScore of its own pinned RubricVersion criterion",
);

// --- The parent keys the composite foreign keys depend on must exist. ---
for (const name of [
  "analysis_run_rubric_version_scope_unique",
  "criterion_rubric_version_scope_unique",
  "rubric_suggestion_run_criterion_unique",
]) {
  assert.equal(
    database
      .prepare("SELECT count(*) AS count FROM sqlite_master WHERE type = 'index' AND name = ?")
      .get(name).count,
    1,
    `missing index ${name}`,
  );
}
database.close();

// --- Upgrade path from the committed pre-P4-02 state (through migration 0010). ---
const upgrade = new DatabaseSync(":memory:");
upgrade.exec("PRAGMA foreign_keys = ON");
apply(upgrade, migrations.slice(0, 11));
seed(upgrade);
apply(upgrade, migrations.slice(11));
assert.equal(upgrade.prepare("SELECT count(*) AS count FROM submission").get().count, 2);
assert.equal(upgrade.prepare("SELECT count(*) AS count FROM analysis_run").get().count, 3);
assert.equal(
  upgrade
    .prepare(
      "SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'rubric_suggestion'",
    )
    .get().count,
  1,
);
assert.equal(upgrade.prepare("SELECT count(*) AS count FROM rubric_suggestion").get().count, 0);
assert.equal(
  upgrade
    .prepare(
      "INSERT INTO rubric_suggestion (id, analysis_run_id, rubric_version_id, criterion_id, suggested_score, reason, evidence_strength, evidence_json, missing_points_json) VALUES ('upgraded', 'run-a2', 'rubric-a2', 'criterion-a2-quality', 6, 'x', 'LOW', '[]', '[]')",
    )
    .run().changes,
  1,
);
// Ownership enforcement is active on the upgraded database too.
assert.throws(
  () =>
    upgrade.exec(`INSERT INTO rubric_suggestion (
      id, analysis_run_id, rubric_version_id, criterion_id, suggested_score, reason,
      evidence_strength, evidence_json, missing_points_json
    ) VALUES ('upgraded-cross', 'run-b1', 'rubric-b', 'criterion-a2-quality', 5, 'x', 'LOW', '[]', '[]')`),
  /FOREIGN KEY constraint failed/u,
);
upgrade.close();

console.log(
  "rubric suggestion historical identity, composite ownership, idempotent retry, and upgrade: PASS",
);
