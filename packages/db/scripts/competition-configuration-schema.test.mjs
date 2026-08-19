import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const packageDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const migrationDirectory = join(packageDirectory, "migrations");
const database = new DatabaseSync(":memory:");

database.exec("PRAGMA foreign_keys = ON");

for (const filename of readdirSync(migrationDirectory)
  .filter((candidate) => candidate.endsWith(".sql"))
  .sort()) {
  database.exec(readFileSync(join(migrationDirectory, filename), "utf8"));
}

assert.equal(database.prepare("PRAGMA foreign_keys").get().foreign_keys, 1);

const now = Date.now();
const insertUser = database.prepare(
  "INSERT INTO user (id, name, email, email_verified, updated_at) VALUES (?, ?, ?, 1, ?)",
);
const insertCompetition = database.prepare(
  "INSERT INTO competition (id, name, slug, description) VALUES (?, ?, ?, ?)",
);
const insertMembership = database.prepare(
  "INSERT INTO competition_member (id, competition_id, user_id, role) VALUES (?, ?, ?, ?)",
);

insertUser.run("manager-a", "Yönetici A", "manager-a@example.com", now);
insertUser.run("manager-b", "Yönetici B", "manager-b@example.com", now);

database.exec("BEGIN");
try {
  insertCompetition.run("competition-a", "Yarışma A", "yarisma-a", "Açıklama A");
  insertMembership.run("membership-a", "competition-a", "manager-a", "COMPETITION_MANAGER");
  database.exec("COMMIT");
} catch (error) {
  database.exec("ROLLBACK");
  throw error;
}

assert.equal(
  database
    .prepare(
      "SELECT count(*) AS count FROM competition_member WHERE competition_id = ? AND user_id = ? AND role = ?",
    )
    .get("competition-a", "manager-a", "COMPETITION_MANAGER").count,
  1,
  "Competition bootstrap must persist the creator manager membership",
);

database.exec("BEGIN");
assert.throws(() => {
  try {
    insertCompetition.run("partial-competition", "Eksik", "eksik", "");
    insertMembership.run(
      "partial-membership",
      "partial-competition",
      "missing-user",
      "COMPETITION_MANAGER",
    );
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}, /FOREIGN KEY constraint failed/);
assert.equal(
  database
    .prepare("SELECT count(*) AS count FROM competition WHERE id = ?")
    .get("partial-competition").count,
  0,
  "A failed membership write must roll back competition creation",
);

insertCompetition.run("competition-b", "Yarışma B", "yarisma-b", "Açıklama B");
insertMembership.run("membership-b", "competition-b", "manager-b", "COMPETITION_MANAGER");
assert.throws(
  () => insertCompetition.run("duplicate-slug", "Tekrar", "yarisma-a", ""),
  /UNIQUE constraint failed/,
);

const insertCategory = database.prepare(
  "INSERT INTO category (id, competition_id, name, code, description, guidance, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)",
);
insertCategory.run(
  "category-a",
  "competition-a",
  "Yapay Zekâ",
  "yapay-zeka",
  "Yapay zekâ projeleri",
  "Model kullanımı kapsam içidir.",
  1,
);
assert.throws(
  () =>
    insertCategory.run(
      "duplicate-category",
      "competition-a",
      "Tekrar",
      "yapay-zeka",
      "Açıklama",
      "",
      2,
    ),
  /UNIQUE constraint failed/,
);
insertCategory.run(
  "category-b",
  "competition-b",
  "Yapay Zekâ",
  "yapay-zeka",
  "Başka yarışmadaki aynı kod",
  "",
  1,
);

const profile = JSON.stringify({
  expectedLanguage: "tr",
  sections: [{ key: "ozet", title: "Proje Özeti", description: "", required: true, order: 1 }],
});
const insertTemplate = database.prepare(
  "INSERT INTO template_version (id, competition_id, version_number, label, status, structural_profile) VALUES (?, ?, ?, ?, ?, ?)",
);
insertTemplate.run("template-a1", "competition-a", 1, "v1", "ACTIVE", profile);
insertTemplate.run("template-a2", "competition-a", 2, "v2", "DRAFT", profile);
assert.throws(
  () => insertTemplate.run("template-a3", "competition-a", 3, "v3", "ACTIVE", profile),
  /UNIQUE constraint failed/,
  "Only one active template may exist per competition",
);
insertTemplate.run("template-b1", "competition-b", 1, "v1", "ACTIVE", profile);

database.exec("BEGIN");
database
  .prepare(
    "UPDATE template_version SET status = 'RETIRED' WHERE competition_id = ? AND status = 'ACTIVE'",
  )
  .run("competition-a");
database
  .prepare(
    "UPDATE template_version SET status = 'ACTIVE' WHERE id = ? AND competition_id = ? AND status = 'DRAFT'",
  )
  .run("template-a2", "competition-a");
database.exec("COMMIT");

database.exec("BEGIN");
database
  .prepare(
    "UPDATE template_version SET status = 'RETIRED' WHERE competition_id = ? AND status = 'ACTIVE' AND id <> ?",
  )
  .run("competition-a", "template-a2");
database
  .prepare(
    "UPDATE template_version SET status = 'ACTIVE' WHERE id = ? AND competition_id = ? AND status = 'DRAFT'",
  )
  .run("template-a2", "competition-a");
database.exec("COMMIT");
assert.equal(
  database
    .prepare(
      "SELECT count(*) AS count FROM template_version WHERE competition_id = ? AND status = 'ACTIVE'",
    )
    .get("competition-a").count,
  1,
  "Repeating a raced activation for the same target must not leave zero active templates",
);
assert.deepEqual(
  database
    .prepare(
      "SELECT id, status FROM template_version WHERE competition_id = ? ORDER BY version_number",
    )
    .all("competition-a")
    .map((row) => ({ ...row })),
  [
    { id: "template-a1", status: "RETIRED" },
    { id: "template-a2", status: "ACTIVE" },
  ],
);

insertTemplate.run("template-a3", "competition-a", 3, "v3", "DRAFT", profile);
database
  .prepare("UPDATE template_version SET structural_profile = ? WHERE id = ?")
  .run(JSON.stringify({ expectedLanguage: "tr", sections: [] }), "template-a3");
database.exec("BEGIN");
database
  .prepare(
    `UPDATE template_version
     SET status = 'RETIRED', updated_at = ?
     WHERE competition_id = ?
       AND status = 'ACTIVE'
       AND id <> ?
       AND EXISTS (
         SELECT 1
         FROM template_version AS target
         WHERE target.id = ?
           AND target.competition_id = ?
           AND target.status = 'DRAFT'
           AND EXISTS (
             SELECT 1
             FROM json_each(json_extract(target.structural_profile, '$.sections')) AS section
             WHERE json_extract(section.value, '$.required') = 1
           )
       )`,
  )
  .run(Date.now(), "competition-a", "template-a3", "template-a3", "competition-a");
const invalidTemplateActivation = database
  .prepare(
    `UPDATE template_version
     SET status = 'ACTIVE', updated_at = ?
     WHERE id = ?
       AND competition_id = ?
       AND status = 'DRAFT'
       AND EXISTS (
         SELECT 1
         FROM json_each(json_extract(structural_profile, '$.sections')) AS section
         WHERE json_extract(section.value, '$.required') = 1
       )`,
  )
  .run(Date.now(), "template-a3", "competition-a");
database.exec("COMMIT");
assert.equal(invalidTemplateActivation.changes, 0);
assert.deepEqual(
  database
    .prepare(
      "SELECT id, status FROM template_version WHERE competition_id = ? AND status = 'ACTIVE'",
    )
    .all("competition-a")
    .map((row) => ({ ...row })),
  [{ id: "template-a2", status: "ACTIVE" }],
  "An invalidated template target must not retire the current active version",
);

const insertRubric = database.prepare(
  "INSERT INTO rubric_version (id, competition_id, version_number, label, status) VALUES (?, ?, ?, ?, ?)",
);
insertRubric.run("rubric-a1", "competition-a", 1, "v1", "ACTIVE");
insertRubric.run("rubric-a2", "competition-a", 2, "v2", "DRAFT");
assert.throws(
  () => insertRubric.run("rubric-a3", "competition-a", 3, "v3", "ACTIVE"),
  /UNIQUE constraint failed/,
  "Only one active rubric may exist per competition",
);

const insertCriterion = database.prepare(
  "INSERT INTO criterion (id, rubric_version_id, code, title, description, evidence_expectation, max_score, weight_basis_points, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
);
insertCriterion.run(
  "criterion-old",
  "rubric-a2",
  "innovation",
  "Yenilik",
  "Yenilik düzeyi",
  "Somut farklılaşma kanıtı",
  10,
  3500,
  1,
);
assert.throws(
  () =>
    insertCriterion.run(
      "criterion-duplicate",
      "rubric-a2",
      "innovation",
      "Tekrar",
      "Açıklama",
      "Kanıt",
      10,
      1000,
      2,
    ),
  /UNIQUE constraint failed/,
);

database.exec("BEGIN");
assert.throws(() => {
  try {
    database.prepare("DELETE FROM criterion WHERE rubric_version_id = ?").run("rubric-a2");
    insertCriterion.run(
      "criterion-new",
      "rubric-a2",
      "impact",
      "Etki",
      "Etki düzeyi",
      "Ölçülebilir etki kanıtı",
      10,
      5000,
      1,
    );
    insertCriterion.run(
      "criterion-invalid",
      "rubric-a2",
      "invalid",
      "Geçersiz",
      "Açıklama",
      "Kanıt",
      0,
      5000,
      2,
    );
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}, /CHECK constraint failed/);
assert.deepEqual(
  database
    .prepare("SELECT id, code FROM criterion WHERE rubric_version_id = ? ORDER BY sort_order")
    .all("rubric-a2")
    .map((row) => ({ ...row })),
  [{ id: "criterion-old", code: "innovation" }],
  "A failed criteria replacement must preserve the previous complete list",
);

database.exec("BEGIN");
database
  .prepare(
    "UPDATE rubric_version SET status = 'RETIRED' WHERE competition_id = ? AND status = 'ACTIVE'",
  )
  .run("competition-a");
database
  .prepare(
    "UPDATE rubric_version SET status = 'ACTIVE' WHERE id = ? AND competition_id = ? AND status = 'DRAFT'",
  )
  .run("rubric-a2", "competition-a");
database.exec("COMMIT");
assert.equal(
  database
    .prepare(
      "SELECT count(*) AS count FROM rubric_version WHERE competition_id = ? AND status = 'ACTIVE'",
    )
    .get("competition-a").count,
  1,
);

database.exec("BEGIN");
database
  .prepare(
    `DELETE FROM criterion
     WHERE rubric_version_id = ?
       AND EXISTS (
         SELECT 1
         FROM rubric_version
         WHERE id = ?
           AND competition_id = ?
           AND status = 'DRAFT'
       )`,
  )
  .run("rubric-a2", "rubric-a2", "competition-a");
database
  .prepare(
    `INSERT INTO criterion (
       id,
       rubric_version_id,
       code,
       title,
       description,
       evidence_expectation,
       max_score,
       weight_basis_points,
       sort_order,
       created_at,
       updated_at
     )
     SELECT ?, id, ?, ?, ?, ?, ?, ?, ?, ?, ?
     FROM rubric_version
     WHERE id = ?
       AND competition_id = ?
       AND status = 'DRAFT'`,
  )
  .run(
    "criterion-raced",
    "raced",
    "Yarış durumu",
    "Etkinleşme sonrası yazılmamalı",
    "Kanıt",
    10,
    10_000,
    1,
    Date.now(),
    Date.now(),
    "rubric-a2",
    "competition-a",
  );
const racedTouch = database
  .prepare(
    `UPDATE rubric_version
     SET updated_at = ?
     WHERE id = ?
       AND competition_id = ?
       AND status = 'DRAFT'`,
  )
  .run(Date.now(), "rubric-a2", "competition-a");
database.exec("COMMIT");

assert.equal(racedTouch.changes, 0, "An activated rubric must reject a raced criteria replacement");
assert.deepEqual(
  database
    .prepare("SELECT id, code FROM criterion WHERE rubric_version_id = ? ORDER BY sort_order")
    .all("rubric-a2")
    .map((row) => ({ ...row })),
  [{ id: "criterion-old", code: "innovation" }],
  "A raced criteria replacement must not mutate an activated rubric",
);

insertRubric.run("rubric-a3", "competition-a", 3, "v3", "DRAFT");
insertCriterion.run(
  "criterion-before-race",
  "rubric-a3",
  "ready-before-race",
  "Hazır görünen kriter",
  "Aktivasyon öncesi silinecek",
  "Kanıt",
  10,
  10_000,
  1,
);
database.prepare("DELETE FROM criterion WHERE rubric_version_id = ?").run("rubric-a3");
database.exec("BEGIN");
database
  .prepare(
    `UPDATE rubric_version
     SET status = 'RETIRED', updated_at = ?
     WHERE competition_id = ?
       AND status = 'ACTIVE'
       AND id <> ?
       AND EXISTS (
         SELECT 1
         FROM rubric_version AS target
         WHERE target.id = ?
           AND target.competition_id = ?
           AND target.status = 'DRAFT'
           AND EXISTS (
             SELECT 1
             FROM criterion
             WHERE rubric_version_id = target.id
           )
       )`,
  )
  .run(Date.now(), "competition-a", "rubric-a3", "rubric-a3", "competition-a");
const emptyRubricActivation = database
  .prepare(
    `UPDATE rubric_version
     SET status = 'ACTIVE', updated_at = ?
     WHERE id = ?
       AND competition_id = ?
       AND status = 'DRAFT'
       AND EXISTS (
         SELECT 1
         FROM criterion
         WHERE rubric_version_id = rubric_version.id
       )`,
  )
  .run(Date.now(), "rubric-a3", "competition-a");
database.exec("COMMIT");
assert.equal(emptyRubricActivation.changes, 0);
assert.deepEqual(
  database
    .prepare("SELECT id, status FROM rubric_version WHERE competition_id = ? AND status = 'ACTIVE'")
    .all("competition-a")
    .map((row) => ({ ...row })),
  [{ id: "rubric-a2", status: "ACTIVE" }],
  "An emptied rubric target must not retire the current active version",
);

assert.throws(
  () => insertTemplate.run("missing-template-parent", "missing", 1, "v1", "DRAFT", profile),
  /FOREIGN KEY constraint failed/,
);
assert.throws(
  () => insertRubric.run("missing-rubric-parent", "missing", 1, "v1", "DRAFT"),
  /FOREIGN KEY constraint failed/,
);
assert.throws(
  () =>
    insertCriterion.run(
      "missing-criterion-parent",
      "missing",
      "missing",
      "Eksik",
      "Açıklama",
      "Kanıt",
      10,
      1000,
      1,
    ),
  /FOREIGN KEY constraint failed/,
);

database.close();
console.log("competition configuration schema integration: PASS");
