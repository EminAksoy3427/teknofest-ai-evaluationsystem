import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const packageDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const migrationDirectory = join(packageDirectory, "migrations");
const migrations = readdirSync(migrationDirectory)
  .filter((candidate) => candidate.endsWith(".sql"))
  .sort();

assert.equal(migrations.length, 7, "P2-03 must extend the 0000-0005 chain with exactly 0006");
assert.ok(migrations[6]?.startsWith("0006_"));

function apply(database, filenames) {
  for (const filename of filenames) {
    database.exec(readFileSync(join(migrationDirectory, filename), "utf8"));
  }
}

function seedFoundation(database) {
  database.exec(`
    INSERT INTO competition (id, name, slug, description)
    VALUES ('competition-a', 'Yarışma A', 'analysis-a', 'Synthetic only');
    INSERT INTO category (id, competition_id, name, code, description)
    VALUES ('category-a', 'competition-a', 'Yapay Zekâ', 'ai', 'Synthetic only');
    INSERT INTO template_version (
      id, competition_id, version_number, label, status, structural_profile
    ) VALUES (
      'template-v1', 'competition-a', 1, 'v1', 'ACTIVE',
      '{"expectedLanguage":"tr","sections":[{"key":"summary","title":"Summary","description":"","required":true,"order":1}]}'
    );
    INSERT INTO rubric_version (id, competition_id, version_number, label, status)
    VALUES ('rubric-v1', 'competition-a', 1, 'v1', 'ACTIVE');
    INSERT INTO criterion (
      id, rubric_version_id, code, title, description, max_score, weight_basis_points
    ) VALUES ('criterion-v1', 'rubric-v1', 'quality', 'Quality', 'Synthetic', 10, 10000);
    INSERT INTO submission (
      id, competition_id, category_id, application_code, project_title
    ) VALUES ('submission-a', 'competition-a', 'category-a', 'APP-001', 'Synthetic project');
    INSERT INTO submission_file (
      id, submission_id, storage_key, original_filename, mime_type, size_bytes, sha256
    ) VALUES (
      'file-a', 'submission-a', 'private/source.pdf', 'source.pdf', 'application/pdf', 42,
      '${"a".repeat(64)}'
    );
  `);
}

const insertPinnedRun = `
  INSERT INTO analysis_run (
    id, submission_id, category_id, template_version_id, rubric_version_id,
    source_sha256, status, stage, workflow_instance_id, extraction_warnings, created_at
  )
  SELECT ?, submission.id, category.id, template_version.id, rubric_version.id,
    submission_file.sha256, 'QUEUED', 'INGEST_AND_EXTRACT', ?, '[]', ?
  FROM submission
  INNER JOIN category
    ON category.id = submission.category_id
   AND category.competition_id = submission.competition_id
  INNER JOIN submission_file ON submission_file.submission_id = submission.id
  INNER JOIN template_version
    ON template_version.competition_id = submission.competition_id
   AND template_version.status = 'ACTIVE'
  INNER JOIN rubric_version
    ON rubric_version.competition_id = submission.competition_id
   AND rubric_version.status = 'ACTIVE'
  WHERE submission.id = ? AND submission.competition_id = ?
    AND EXISTS (
      SELECT 1 FROM criterion WHERE criterion.rubric_version_id = rubric_version.id
    )
  LIMIT 1
`;

function createRun(database, id, createdAt) {
  return database.prepare(insertPinnedRun).run(id, id, createdAt, "submission-a", "competition-a");
}

const database = new DatabaseSync(":memory:");
database.exec("PRAGMA foreign_keys = ON");
apply(database, migrations);
seedFoundation(database);

assert.equal(createRun(database, "run-v1", 100).changes, 1);
assert.deepEqual(
  {
    ...database
      .prepare(
        `SELECT category_id, template_version_id, rubric_version_id, source_sha256
       FROM analysis_run WHERE id = 'run-v1'`,
      )
      .get(),
  },
  {
    category_id: "category-a",
    template_version_id: "template-v1",
    rubric_version_id: "rubric-v1",
    source_sha256: "a".repeat(64),
  },
  "R1 must pin category, active versions, and source hash at creation",
);

assert.throws(
  () => createRun(database, "run-concurrent", 101),
  /UNIQUE constraint failed/,
  "A second queued run must be blocked atomically",
);

database
  .prepare(
    `UPDATE analysis_run
     SET status = 'SUCCEEDED', started_at = 101, completed_at = 102,
         document_artifact_key = 'derived/submission-a/run-v1/document.json',
         page_count = 2, character_count = 40
     WHERE id = 'run-v1'`,
  )
  .run();

database.exec(`
  UPDATE template_version SET status = 'RETIRED' WHERE id = 'template-v1';
  INSERT INTO template_version (
    id, competition_id, version_number, label, status, structural_profile
  ) VALUES (
    'template-v2', 'competition-a', 2, 'v2', 'ACTIVE',
    '{"expectedLanguage":"tr","sections":[{"key":"new","title":"New","description":"","required":true,"order":1}]}'
  );
  UPDATE rubric_version SET status = 'RETIRED' WHERE id = 'rubric-v1';
  INSERT INTO rubric_version (id, competition_id, version_number, label, status)
  VALUES ('rubric-v2', 'competition-a', 2, 'v2', 'ACTIVE');
  INSERT INTO criterion (
    id, rubric_version_id, code, title, description, max_score, weight_basis_points
  ) VALUES ('criterion-v2', 'rubric-v2', 'impact', 'Impact', 'Synthetic', 10, 10000);
`);

assert.deepEqual(
  {
    ...database
      .prepare(
        "SELECT template_version_id, rubric_version_id FROM analysis_run WHERE id = 'run-v1'",
      )
      .get(),
  },
  { template_version_id: "template-v1", rubric_version_id: "rubric-v1" },
  "Activating v2 must not float R1 to current configuration",
);
assert.equal(createRun(database, "run-v2", 200).changes, 1);
assert.deepEqual(
  {
    ...database
      .prepare(
        "SELECT template_version_id, rubric_version_id FROM analysis_run WHERE id = 'run-v2'",
      )
      .get(),
  },
  { template_version_id: "template-v2", rubric_version_id: "rubric-v2" },
  "R2 must pin the newly active versions",
);

database
  .prepare(
    `UPDATE analysis_run SET status = 'FAILED', completed_at = 201,
       error_code = 'PDF_PARSE_FAILED', error_message = 'Safe failure'
     WHERE id = 'run-v2'`,
  )
  .run();
assert.equal(createRun(database, "run-after-failure", 300).changes, 1);

assert.deepEqual(
  database
    .prepare("SELECT id FROM analysis_run ORDER BY created_at DESC, id DESC")
    .all()
    .map((row) => row.id),
  ["run-after-failure", "run-v2", "run-v1"],
  "Historical run order must be deterministic",
);
assert.equal(
  database
    .prepare(
      "SELECT count(*) AS count FROM pragma_table_info('analysis_run') WHERE name LIKE '%text%'",
    )
    .get().count,
  0,
  "AnalysisRun must not gain a full extracted-text column",
);
database.close();

const upgradeDatabase = new DatabaseSync(":memory:");
upgradeDatabase.exec("PRAGMA foreign_keys = ON");
apply(upgradeDatabase, migrations.slice(0, 6));
seedFoundation(upgradeDatabase);
apply(upgradeDatabase, migrations.slice(6));
assert.equal(
  upgradeDatabase
    .prepare(
      "SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'analysis_run'",
    )
    .get().count,
  1,
  "0000-0005 to 0006 upgrade must create AnalysisRun",
);
assert.equal(
  upgradeDatabase.prepare("SELECT count(*) AS count FROM submission").get().count,
  1,
  "Upgrade must preserve P2-02 submission metadata",
);
upgradeDatabase.close();

console.log("analysis run clean-chain, upgrade, concurrency, and version pinning: PASS");
