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

// Two synthetic competitions. Submission A and B live in competition A and each own two
// successful historical AnalysisRuns; submission B1 lives in competition B.
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
    INSERT INTO rubric_version (id, competition_id, version_number, label, status) VALUES
      ('rubric-a', 'competition-a', 1, 'A', 'ACTIVE'),
      ('rubric-b', 'competition-b', 1, 'B', 'ACTIVE');
    INSERT INTO submission (id, competition_id, category_id, application_code, project_title) VALUES
      ('submission-a', 'competition-a', 'category-a', 'A', 'A'),
      ('submission-b', 'competition-a', 'category-a', 'B', 'B'),
      ('submission-b1', 'competition-b', 'category-b', 'B1', 'B1');
    INSERT INTO analysis_run (
      id, submission_id, category_id, template_version_id, rubric_version_id, source_sha256,
      status, stage, workflow_instance_id, document_artifact_key, page_count, character_count,
      extraction_warnings, created_at, started_at, completed_at
    ) VALUES
      ('run-a1', 'submission-a', 'category-a', 'template-a', 'rubric-a', '${"a".repeat(64)}', 'SUCCEEDED', 'SEMANTIC_CHECKS', 'run-a1', 'a1.json', 1, 100, '[]', 1, 1, 2),
      ('run-a2', 'submission-a', 'category-a', 'template-a', 'rubric-a', '${"a".repeat(64)}', 'SUCCEEDED', 'SEMANTIC_CHECKS', 'run-a2', 'a2.json', 1, 100, '[]', 3, 3, 4),
      ('run-b1', 'submission-b', 'category-a', 'template-a', 'rubric-a', '${"b".repeat(64)}', 'SUCCEEDED', 'SEMANTIC_CHECKS', 'run-b1', 'b1.json', 1, 100, '[]', 1, 1, 2),
      ('run-b2', 'submission-b', 'category-a', 'template-a', 'rubric-a', '${"b".repeat(64)}', 'SUCCEEDED', 'SEMANTIC_CHECKS', 'run-b2', 'b2.json', 1, 100, '[]', 3, 3, 4),
      ('run-b1-other', 'submission-b1', 'category-b', 'template-b', 'rubric-b', '${"a".repeat(64)}', 'SUCCEEDED', 'SEMANTIC_CHECKS', 'run-b1-other', 'b1o.json', 1, 100, '[]', 1, 1, 2);
  `);
}

const database = new DatabaseSync(":memory:");
database.exec("PRAGMA foreign_keys = ON");
apply(database, migrations);
seed(database);

const insert = database.prepare(`INSERT INTO similarity_pair (
  id, competition_id, submission_a_id, submission_b_id, analysis_run_a_id, analysis_run_b_id,
  lexical_score, semantic_score, combined_score, mode, level, exact_document_match, evidence_json
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]')`);

function insertPair(id, submissionA, submissionB, runA, runB, score = 0.5) {
  return insert.run(
    id,
    "competition-a",
    submissionA,
    submissionB,
    runA,
    runB,
    score,
    null,
    score,
    "LEXICAL_ONLY",
    "MEDIUM",
    0,
  );
}

// --- Historical identity: every distinct run combination is its own observation. ---
assert.equal(
  insertPair("pair-a1-b1", "submission-a", "submission-b", "run-a1", "run-b1", 0.4).changes,
  1,
);
assert.equal(
  insertPair("pair-a2-b1", "submission-a", "submission-b", "run-a2", "run-b1", 0.5).changes,
  1,
);
assert.equal(
  insertPair("pair-a1-b2", "submission-a", "submission-b", "run-a1", "run-b2", 0.6).changes,
  1,
);
assert.equal(
  insertPair("pair-a2-b2", "submission-a", "submission-b", "run-a2", "run-b2", 0.7).changes,
  1,
);
assert.equal(database.prepare("SELECT count(*) AS count FROM similarity_pair").get().count, 4);

// The same run pair may exist only once, regardless of the row id.
assert.throws(
  () => insertPair("pair-duplicate", "submission-a", "submission-b", "run-a1", "run-b1"),
  /UNIQUE constraint failed/u,
);

// --- Self pair and inverse-ordered pair are rejected by the canonical order CHECK. ---
assert.throws(
  () => insertPair("pair-self", "submission-a", "submission-a", "run-a1", "run-a2"),
  /CHECK constraint failed/u,
);
assert.throws(
  () => insertPair("pair-inverse", "submission-b", "submission-a", "run-b1", "run-a1"),
  /CHECK constraint failed/u,
);

// --- Composite ownership is enforced by the database, bypassing repository validation. ---
// (competition_id, submission_b_id) has no parent row: submission-b1 belongs to competition B.
assert.throws(
  () =>
    insertPair("pair-cross-competition", "submission-a", "submission-b1", "run-a1", "run-b1-other"),
  /FOREIGN KEY constraint failed/u,
);
// (submission_a_id, analysis_run_a_id) has no parent row: run-b1 belongs to submission-b.
assert.throws(
  () => insertPair("pair-mismatched-run", "submission-a", "submission-b", "run-b1", "run-b2"),
  /FOREIGN KEY constraint failed/u,
);
// The A-side submission may not belong to another competition either.
assert.throws(
  () =>
    insert.run(
      "pair-cross-competition-a",
      "competition-b",
      "submission-a",
      "submission-b",
      "run-a1",
      "run-b1",
      0.5,
      null,
      0.5,
      "LEXICAL_ONLY",
      "MEDIUM",
      0,
    ),
  /FOREIGN KEY constraint failed/u,
);
assert.equal(database.prepare("SELECT count(*) AS count FROM similarity_pair").get().count, 4);

// --- Retry reconciles measurements for the same run pair and never rewrites identity. ---
const before = database.prepare("SELECT * FROM similarity_pair WHERE id = 'pair-a1-b1'").get();
database.exec(`INSERT INTO similarity_pair (
  id, competition_id, submission_a_id, submission_b_id, analysis_run_a_id, analysis_run_b_id,
  lexical_score, semantic_score, combined_score, mode, level, exact_document_match, evidence_json, updated_at
) VALUES ('retry', 'competition-a', 'submission-a', 'submission-b', 'run-a1', 'run-b1', 0.8, null, 0.8, 'LEXICAL_ONLY', 'HIGH', 0, '[]', 999)
ON CONFLICT (competition_id, analysis_run_a_id, analysis_run_b_id) DO UPDATE SET
  lexical_score = excluded.lexical_score,
  combined_score = excluded.combined_score,
  level = excluded.level,
  updated_at = excluded.updated_at;`);
const after = database.prepare("SELECT * FROM similarity_pair WHERE id = 'pair-a1-b1'").get();
assert.equal(database.prepare("SELECT count(*) AS count FROM similarity_pair").get().count, 4);
assert.equal(after.id, before.id);
assert.equal(after.competition_id, before.competition_id);
assert.equal(after.submission_a_id, before.submission_a_id);
assert.equal(after.submission_b_id, before.submission_b_id);
assert.equal(after.analysis_run_a_id, "run-a1");
assert.equal(after.analysis_run_b_id, "run-b1");
assert.equal(after.created_at, before.created_at);
assert.equal(after.combined_score, 0.8);

// A newer AnalysisRun observation leaves the older row untouched.
const untouched = database.prepare("SELECT * FROM similarity_pair WHERE id = 'pair-a2-b1'").get();
assert.equal(untouched.analysis_run_a_id, "run-a2");
assert.equal(untouched.analysis_run_b_id, "run-b1");
assert.equal(untouched.combined_score, 0.5);

// Historical rows for one logical submission pair remain deterministically ordered.
assert.deepEqual(
  database
    .prepare(
      `SELECT id FROM similarity_pair
       WHERE competition_id = 'competition-a'
         AND submission_a_id = 'submission-a' AND submission_b_id = 'submission-b'
       ORDER BY analysis_run_a_id, analysis_run_b_id`,
    )
    .all()
    .map((row) => row.id),
  ["pair-a1-b1", "pair-a1-b2", "pair-a2-b1", "pair-a2-b2"],
);

// --- The parent keys the composite foreign keys depend on must exist. ---
for (const name of [
  "submission_competition_scope_unique",
  "analysis_run_submission_scope_unique",
  "similarity_pair_competition_runs_unique",
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

// --- Upgrade path from the committed 0009 state. ---
const upgrade = new DatabaseSync(":memory:");
upgrade.exec("PRAGMA foreign_keys = ON");
apply(upgrade, migrations.slice(0, 10));
seed(upgrade);
apply(upgrade, migrations.slice(10));
assert.equal(upgrade.prepare("SELECT count(*) AS count FROM submission").get().count, 3);
assert.equal(upgrade.prepare("SELECT count(*) AS count FROM analysis_run").get().count, 5);
assert.equal(
  upgrade
    .prepare(
      "SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'similarity_pair'",
    )
    .get().count,
  1,
);
// Ownership enforcement is active on the upgraded database too.
assert.throws(
  () =>
    upgrade.exec(`INSERT INTO similarity_pair (
      id, competition_id, submission_a_id, submission_b_id, analysis_run_a_id, analysis_run_b_id,
      lexical_score, semantic_score, combined_score, mode, level, exact_document_match, evidence_json
    ) VALUES ('upgraded-cross', 'competition-a', 'submission-a', 'submission-b1', 'run-a1', 'run-b1-other',
      0.5, null, 0.5, 'LEXICAL_ONLY', 'MEDIUM', 0, '[]')`),
  /FOREIGN KEY constraint failed/u,
);
upgrade.close();

console.log(
  "similarity pair historical identity, composite ownership, canonical ordering, retry, and upgrade: PASS",
);
