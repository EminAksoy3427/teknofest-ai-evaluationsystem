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

function apply(database, filenames) {
  for (const filename of filenames) {
    database.exec(readFileSync(join(migrationDirectory, filename), "utf8"));
  }
}

function insertFoundations(database) {
  database
    .prepare("INSERT INTO competition (id, name, slug, description) VALUES (?, ?, ?, ?)")
    .run("competition-a", "Yarışma A", "submission-a", "A");
  database
    .prepare("INSERT INTO competition (id, name, slug, description) VALUES (?, ?, ?, ?)")
    .run("competition-b", "Yarışma B", "submission-b", "B");
  const category = database.prepare(
    "INSERT INTO category (id, competition_id, name, code, description) VALUES (?, ?, ?, ?, ?)",
  );
  category.run("category-a", "competition-a", "Yapay Zekâ", "ai", "A");
  category.run("category-b", "competition-b", "Yapay Zekâ", "ai", "B");
}

const database = new DatabaseSync(":memory:");
database.exec("PRAGMA foreign_keys = ON");
apply(database, migrations);
insertFoundations(database);

const insertSubmission = database.prepare(
  "INSERT INTO submission (id, competition_id, category_id, application_code, project_title) VALUES (?, ?, ?, ?, ?)",
);
const insertFile = database.prepare(
  "INSERT INTO submission_file (id, submission_id, storage_key, original_filename, mime_type, size_bytes, sha256) VALUES (?, ?, ?, ?, ?, ?, ?)",
);
const hashA = "a".repeat(64);

insertSubmission.run("submission-a1", "competition-a", "category-a", "APP-001", "Proje 1");
insertFile.run(
  "file-a1",
  "submission-a1",
  "competitions/competition-a/submissions/submission-a1/file-a1/report.pdf",
  "rapor.pdf",
  "application/pdf",
  42,
  hashA,
);

assert.throws(
  () => insertSubmission.run("submission-a2", "competition-a", "category-a", "APP-001", "Tekrar"),
  /UNIQUE constraint failed/,
  "Application code must be unique inside a competition",
);
insertSubmission.run("submission-b1", "competition-b", "category-b", "APP-001", "Başka yarışma");
insertFile.run(
  "file-b1",
  "submission-b1",
  "competitions/competition-b/submissions/submission-b1/file-b1/report.pdf",
  "rapor.pdf",
  "application/pdf",
  42,
  hashA,
);

insertSubmission.run("submission-a2", "competition-a", "category-a", "APP-002", "Proje 2");
insertFile.run(
  "file-a2",
  "submission-a2",
  "competitions/competition-a/submissions/submission-a2/file-a2/report.pdf",
  "ikinci.pdf",
  "application/pdf",
  42,
  hashA,
);
assert.equal(
  database
    .prepare(
      `SELECT count(*) AS count
       FROM submission_file f
       JOIN submission s ON s.id = f.submission_id
       WHERE s.competition_id = ? AND f.sha256 = ?`,
    )
    .get("competition-a", hashA).count,
  2,
  "Identical files in one competition must both be preserved",
);
assert.equal(
  database
    .prepare(
      `SELECT count(*) AS count
       FROM submission_file f
       JOIN submission s ON s.id = f.submission_id
       WHERE s.competition_id = ? AND f.sha256 = ?`,
    )
    .get("competition-b", hashA).count,
  1,
  "Duplicate lookup must remain competition scoped",
);

assert.throws(
  () =>
    insertFile.run(
      "file-a1-second",
      "submission-a1",
      "another/key",
      "second.pdf",
      "application/pdf",
      42,
      "b".repeat(64),
    ),
  /UNIQUE constraint failed/,
  "One authoritative report per submission must be enforced",
);
assert.throws(
  () =>
    insertFile.run(
      "file-invalid-mime",
      "submission-a2",
      "invalid/mime",
      "invalid.pdf",
      "text/plain",
      42,
      hashA,
    ),
  /CHECK constraint failed/,
);
assert.throws(
  () => database.prepare("DELETE FROM category WHERE id = ?").run("category-a"),
  /FOREIGN KEY constraint failed/,
  "A category with submissions must be restricted",
);

database.exec("BEGIN");
assert.throws(() => {
  try {
    insertSubmission.run(
      "atomic-submission",
      "competition-a",
      "category-a",
      "APP-ATOMIC",
      "Atomik",
    );
    insertFile.run(
      "atomic-file",
      "atomic-submission",
      "atomic/key",
      "atomic.pdf",
      "application/pdf",
      0,
      hashA,
    );
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}, /CHECK constraint failed/);
assert.equal(
  database.prepare("SELECT count(*) AS count FROM submission WHERE id = ?").get("atomic-submission")
    .count,
  0,
  "A failed file insert must roll back the submission row",
);

database.prepare("DELETE FROM competition WHERE id = ?").run("competition-a");
assert.equal(
  database
    .prepare("SELECT count(*) AS count FROM submission WHERE competition_id = ?")
    .get("competition-a").count,
  0,
);
assert.equal(
  database
    .prepare("SELECT count(*) AS count FROM submission_file WHERE submission_id IN (?, ?)")
    .get("submission-a1", "submission-a2").count,
  0,
  "Competition cascade must remove submission and file metadata",
);
database.close();

const upgradeDatabase = new DatabaseSync(":memory:");
upgradeDatabase.exec("PRAGMA foreign_keys = ON");
apply(upgradeDatabase, migrations.slice(0, 5));
insertFoundations(upgradeDatabase);
apply(upgradeDatabase, migrations.slice(5));
assert.deepEqual(
  upgradeDatabase
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('submission', 'submission_file') ORDER BY name",
    )
    .all()
    .map((row) => row.name),
  ["submission", "submission_file"],
  "0000-0004 to latest upgrade must create both submission tables",
);
assert.equal(
  upgradeDatabase.prepare("SELECT count(*) AS count FROM category").get().count,
  2,
  "Upgrade must preserve existing configuration rows",
);
upgradeDatabase.close();

console.log("submission schema clean-chain and upgrade integration: PASS");
