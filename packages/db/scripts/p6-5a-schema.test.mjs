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

// Every later milestone must APPEND to this chain; an already committed migration is never edited
// or renumbered, so the ordinal prefix of each existing entry stays exactly where it was.
assert.equal(
  migrations.length,
  18,
  "P6.5A must extend the unchanged 0000-0015 chain with exactly two new migrations",
);
for (const [index, migration] of migrations.entries()) {
  assert.ok(
    migration.startsWith(`${String(index).padStart(4, "0")}_`),
    `migration ${index} must keep its committed ordinal prefix`,
  );
}

function apply(database, filenames) {
  for (const filename of filenames) {
    database.exec(readFileSync(join(migrationDirectory, filename), "utf8"));
  }
}

function sha(seed) {
  return seed.repeat(64).slice(0, 64);
}

// --- Clean chain -----------------------------------------------------------------------------

const clean = new DatabaseSync(":memory:");
clean.exec("PRAGMA foreign_keys = ON");
apply(clean, migrations);
// No drizzle "meta" bookkeeping table exists in this project's runtime schema (matching the
// other milestone scripts); "pending migrations: NONE" is proven by the fact that applying the
// full generated chain to a fresh database succeeds byte-for-byte, asserted immediately below.
assert.deepEqual(
  clean.prepare("PRAGMA foreign_key_check").all(),
  [],
  "clean chain: foreign keys must be NONE violated",
);

const templateColumns = clean
  .prepare("SELECT name FROM pragma_table_info('template_version')")
  .all()
  .map((row) => row.name);
for (const column of [
  "storage_key",
  "sha256",
  "original_filename",
  "mime_type",
  "size_bytes",
  "file_uploaded_at",
]) {
  assert.ok(templateColumns.includes(column), `template_version must have column ${column}`);
}
for (const table of ["submission_participant", "contestant_feedback"]) {
  assert.ok(
    clean.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table),
    `${table} table must exist after a clean apply`,
  );
}
clean.close();

// --- Upgrade path from the P6 checkpoint (0000-0015) ------------------------------------------

const upgrade = new DatabaseSync(":memory:");
upgrade.exec("PRAGMA foreign_keys = ON");
const checkpointMigrations = migrations.filter(
  (name) => !name.startsWith("0016") && !name.startsWith("0017"),
);
assert.equal(checkpointMigrations.length, 16, "the P6 checkpoint chain is exactly 0000-0015");
apply(upgrade, checkpointMigrations);

// Seed data in the SHAPE the P6 checkpoint actually produced: an ACTIVE TemplateVersion with no
// file at all. This is the exact historical state P6.5A's activation gate must never break on
// upgrade.
upgrade.exec(`
  INSERT INTO "user" (id, name, email) VALUES ('u-mgr', 'Yönetici', 'mgr@example.com');
  INSERT INTO competition (id, name, slug, description) VALUES ('c-a', 'A', 'a', 'Synthetic');
  INSERT INTO competition_member (id, competition_id, user_id, role)
    VALUES ('m-a', 'c-a', 'u-mgr', 'COMPETITION_MANAGER');
  INSERT INTO template_version (id, competition_id, version_number, label, status)
    VALUES ('t-legacy', 'c-a', 1, 'v1', 'ACTIVE');
`);

apply(
  upgrade,
  migrations.filter((name) => name.startsWith("0016") || name.startsWith("0017")),
);
// Same proof again, this time for the upgrade path: the remaining chain applied cleanly on top
// of the checkpoint state, so there is nothing left pending.
assert.deepEqual(
  upgrade.prepare("PRAGMA foreign_key_check").all(),
  [],
  "upgrade path: foreign keys must be NONE violated",
);
assert.deepEqual(
  {
    ...upgrade
      .prepare("SELECT status, storage_key FROM template_version WHERE id = 't-legacy'")
      .get(),
  },
  { status: "ACTIVE", storage_key: null },
  "a pre-P6.5A ACTIVE TemplateVersion with no file must survive the upgrade unchanged",
);
upgrade.close();

// --- template_version: file columns are all-or-nothing, ACTIVE is gated at the application layer

const database = new DatabaseSync(":memory:");
database.exec("PRAGMA foreign_keys = ON");
apply(database, migrations);
database.exec(`
  INSERT INTO "user" (id, name, email) VALUES
    ('u-mgr', 'Yönetici', 'mgr@example.com'),
    ('u-contestant', 'Yarışmacı', 'c@example.com'),
    ('u-reviewer', 'Hakem', 'r@example.com'),
    ('u-outsider', 'Dışarıdan', 'o@example.com');
  INSERT INTO competition (id, name, slug, description) VALUES
    ('c-a', 'A', 'a', 'Synthetic'), ('c-b', 'B', 'b', 'Synthetic');
  INSERT INTO competition_member (id, competition_id, user_id, role) VALUES
    ('m-a-mgr', 'c-a', 'u-mgr', 'COMPETITION_MANAGER'),
    ('m-a-contestant', 'c-a', 'u-contestant', 'CONTESTANT'),
    ('m-a-reviewer', 'c-a', 'u-reviewer', 'REVIEWER'),
    ('m-b-outsider', 'c-b', 'u-outsider', 'CONTESTANT');
  INSERT INTO category (id, competition_id, name, code, description) VALUES ('cat-a', 'c-a', 'A', 'a', 'Synthetic');
  INSERT INTO submission (id, competition_id, category_id, application_code, project_title)
    VALUES ('s-a', 'c-a', 'cat-a', 'A-1', 'Proje');
`);

assert.throws(
  () =>
    database
      .prepare(
        "INSERT INTO template_version (id, competition_id, version_number, label, storage_key) VALUES (?, 'c-a', 1, 'v1', 'k')",
      )
      .run("t-partial"),
  /CHECK constraint failed/,
  "a partial file (storage_key without sha256/filename/mime/size/uploaded_at) must be rejected",
);
database
  .prepare(
    `INSERT INTO template_version (
       id, competition_id, version_number, label, storage_key, sha256, original_filename,
       mime_type, size_bytes, file_uploaded_at
     ) VALUES (?, 'c-a', 1, 'v1', 'key', ?, 'sablon.pdf', 'application/pdf', 10, 1)`,
  )
  .run("t-full", sha("a"));
assert.equal(
  database.prepare("SELECT storage_key FROM template_version WHERE id = 't-full'").get()
    .storage_key,
  "key",
  "a fully-populated file row must be accepted",
);

// --- submission_participant: composite ownership -----------------------------------------------

const insertParticipant = database.prepare(
  "INSERT INTO submission_participant (id, competition_id, submission_id, user_id) VALUES (?, ?, ?, ?)",
);
assert.throws(
  () => insertParticipant.run("p-cross", "c-b", "s-a", "u-outsider"),
  /FOREIGN KEY constraint failed/,
  "a submission from another competition must be rejected at the database boundary",
);
assert.throws(
  () => insertParticipant.run("p-foreign-user", "c-a", "s-a", "u-outsider"),
  /FOREIGN KEY constraint failed/,
  "a user who is not a member of this competition must be rejected at the database boundary",
);
insertParticipant.run("p-ok", "c-a", "s-a", "u-contestant");
assert.throws(
  () => insertParticipant.run("p-dup", "c-a", "s-a", "u-contestant"),
  /UNIQUE constraint failed/,
  "the same (submission, user) pair must be rejected a second time",
);

// --- contestant_feedback: composite ownership, one-per-submission, publication invariant -------

database.exec(`
  INSERT INTO template_version (id, competition_id, version_number, label, status, storage_key, sha256, original_filename, mime_type, size_bytes, file_uploaded_at)
    VALUES ('t-active', 'c-a', 2, 'v2', 'ACTIVE', 'key2', '${sha("b")}', 'sablon.pdf', 'application/pdf', 10, 1);
  INSERT INTO rubric_version (id, competition_id, version_number, label, status) VALUES ('rub-a', 'c-a', 1, 'v1', 'ACTIVE');
  INSERT INTO criterion (id, rubric_version_id, code, title, description, max_score, weight_basis_points)
    VALUES ('crit-a', 'rub-a', 'quality', 'Kalite', 'Synthetic', 10, 10000);
  INSERT INTO analysis_run (
    id, submission_id, category_id, template_version_id, rubric_version_id, source_sha256,
    status, stage, workflow_instance_id, document_artifact_key, page_count, character_count,
    extraction_warnings, created_at, started_at, completed_at
  ) VALUES ('run-a', 's-a', 'cat-a', 't-active', 'rub-a', '${sha("c")}', 'SUCCEEDED', 'RUBRIC_EVALUATION', 'run-a', 'a.json', 4, 100, '[]', 1, 1, 2);
  INSERT INTO reviewer_assignment (id, competition_id, submission_id, reviewer_user_id, assigned_by_user_id)
    VALUES ('assign-a', 'c-a', 's-a', 'u-reviewer', 'u-mgr');
  INSERT INTO reviewer_evaluation (id, assignment_id, submission_id, analysis_run_id, rubric_version_id, status, submitted_at)
    VALUES ('eval-a', 'assign-a', 's-a', 'run-a', 'rub-a', 'SUBMITTED', 5);
`);

const insertFeedback = database.prepare(
  `INSERT INTO contestant_feedback (id, competition_id, submission_id, source_reviewer_evaluation_id, created_by_user_id)
   VALUES (?, ?, ?, ?, 'u-mgr')`,
);
assert.throws(
  () => insertFeedback.run("f-cross", "c-a", "s-a", "does-not-exist"),
  /FOREIGN KEY constraint failed/,
  "a source evaluation that does not belong to this submission must be rejected",
);
insertFeedback.run("f-a", "c-a", "s-a", "eval-a");
assert.throws(
  () => insertFeedback.run("f-a-second", "c-a", "s-a", "eval-a"),
  /UNIQUE constraint failed/,
  "a second ContestantFeedback for the same submission must be rejected: one per submission",
);
assert.throws(
  () =>
    database.prepare("UPDATE contestant_feedback SET status = 'PUBLISHED' WHERE id = 'f-a'").run(),
  /CHECK constraint failed/,
  "PUBLISHED without published_at/published_by_user_id must be rejected",
);
database
  .prepare(
    "UPDATE contestant_feedback SET status = 'PUBLISHED', published_at = 10, published_by_user_id = 'u-mgr' WHERE id = 'f-a'",
  )
  .run();
assert.equal(
  database.prepare("SELECT status FROM contestant_feedback WHERE id = 'f-a'").get().status,
  "PUBLISHED",
  "a fully-populated publication must be accepted",
);

assert.deepEqual(
  database.prepare("PRAGMA foreign_key_check").all(),
  [],
  "no dangling foreign keys after all scenarios",
);
database.close();

console.log(
  "P6.5A schema invariants verified: clean chain, checkpoint upgrade, template file gating, participant/feedback ownership",
);
