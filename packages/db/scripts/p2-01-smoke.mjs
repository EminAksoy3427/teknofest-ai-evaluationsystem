import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const packageDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const database = new DatabaseSync(":memory:");
database.exec("PRAGMA foreign_keys = ON");

for (const filename of readdirSync(join(packageDirectory, "migrations"))
  .filter((candidate) => candidate.endsWith(".sql"))
  .sort()) {
  database.exec(readFileSync(join(packageDirectory, "migrations", filename), "utf8"));
}

const now = Date.now();
const insertUser = database.prepare(
  "INSERT INTO user (id, name, email, email_verified, updated_at) VALUES (?, ?, ?, 1, ?)",
);
const insertCompetition = database.prepare(
  "INSERT INTO competition (id, name, slug, description) VALUES (?, ?, ?, ?)",
);
const insertMember = database.prepare(
  "INSERT INTO competition_member (id, competition_id, user_id, role) VALUES (?, ?, ?, ?)",
);

insertUser.run("smoke-manager", "Yönetici A", "smoke-manager@example.com", now);
insertUser.run("smoke-reviewer", "Hakem", "smoke-reviewer@example.com", now);
insertCompetition.run("smoke-competition-a", "Yarışma A", "smoke-yarisma-a", "Smoke A");
insertCompetition.run("smoke-competition-b", "Yarışma B", "smoke-yarisma-b", "Smoke B");
insertMember.run(
  "smoke-manager-membership",
  "smoke-competition-a",
  "smoke-manager",
  "COMPETITION_MANAGER",
);
insertMember.run("smoke-reviewer-membership", "smoke-competition-a", "smoke-reviewer", "REVIEWER");

const roleFor = database.prepare(
  "SELECT role FROM competition_member WHERE user_id = ? AND competition_id = ?",
);
assert.equal(roleFor.get("smoke-manager", "smoke-competition-a").role, "COMPETITION_MANAGER");
assert.equal(roleFor.get("smoke-manager", "smoke-competition-b"), undefined);
assert.equal(roleFor.get("smoke-reviewer", "smoke-competition-a").role, "REVIEWER");

database
  .prepare(
    "INSERT INTO category (id, competition_id, name, code, description, guidance, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)",
  )
  .run(
    "smoke-category",
    "smoke-competition-a",
    "Yapay Zekâ",
    "yapay-zeka",
    "Yapay zekâ odaklı projeler",
    "Somut model kullanımı kapsam içidir.",
    1,
  );

const templateProfile = JSON.stringify({
  expectedLanguage: "tr",
  sections: [
    { key: "proje-ozeti", title: "Proje Özeti", description: "", required: true, order: 1 },
    { key: "problem-tanimi", title: "Problem Tanımı", description: "", required: true, order: 2 },
    { key: "cozum-yaklasimi", title: "Çözüm Yaklaşımı", description: "", required: true, order: 3 },
  ],
});
const insertTemplate = database.prepare(
  "INSERT INTO template_version (id, competition_id, version_number, label, status, structural_profile) VALUES (?, ?, ?, ?, ?, ?)",
);
insertTemplate.run(
  "smoke-template-v1",
  "smoke-competition-a",
  1,
  "Şablon v1",
  "ACTIVE",
  templateProfile,
);
insertTemplate.run(
  "smoke-template-v2",
  "smoke-competition-a",
  2,
  "Şablon v2",
  "DRAFT",
  templateProfile,
);

const insertRubric = database.prepare(
  "INSERT INTO rubric_version (id, competition_id, version_number, label, status) VALUES (?, ?, ?, ?, ?)",
);
insertRubric.run("smoke-rubric-v1", "smoke-competition-a", 1, "Rubrik v1", "ACTIVE");
insertRubric.run("smoke-rubric-v2", "smoke-competition-a", 2, "Rubrik v2", "DRAFT");

const insertCriterion = database.prepare(
  "INSERT INTO criterion (id, rubric_version_id, code, title, description, evidence_expectation, max_score, weight_basis_points, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
);
for (const [id, code, title, expectation, order] of [
  ["innovation", "innovation", "Yenilik", "Somut farklılaşma kanıtı", 1],
  ["feasibility", "feasibility", "Uygulanabilirlik", "Teknik doğrulama kanıtı", 2],
  ["impact", "impact", "Etki", "Ölçülebilir etki kanıtı", 3],
]) {
  insertCriterion.run(
    `smoke-v1-${id}`,
    "smoke-rubric-v1",
    code,
    title,
    `${title} açıklaması`,
    expectation,
    10,
    3333,
    order,
  );
  insertCriterion.run(
    `smoke-v2-${id}`,
    "smoke-rubric-v2",
    code,
    title,
    `${title} açıklaması`,
    expectation,
    10,
    3333,
    order,
  );
}

const readiness = database
  .prepare(
    `SELECT
      EXISTS(SELECT 1 FROM competition WHERE id = ?) AS competition,
      EXISTS(SELECT 1 FROM category WHERE competition_id = ?) AS categories,
      EXISTS(SELECT 1 FROM template_version WHERE competition_id = ? AND status = 'ACTIVE') AS active_template,
      EXISTS(SELECT 1 FROM rubric_version WHERE competition_id = ? AND status = 'ACTIVE') AS active_rubric,
      EXISTS(
        SELECT 1 FROM criterion c
        JOIN rubric_version r ON r.id = c.rubric_version_id
        WHERE r.competition_id = ? AND r.status = 'ACTIVE'
      ) AS rubric_has_criteria`,
  )
  .get(
    "smoke-competition-a",
    "smoke-competition-a",
    "smoke-competition-a",
    "smoke-competition-a",
    "smoke-competition-a",
  );
assert.deepEqual([...Object.values(readiness)], [1, 1, 1, 1, 1]);

database.exec("BEGIN");
database
  .prepare(
    "UPDATE template_version SET status = 'RETIRED' WHERE competition_id = ? AND status = 'ACTIVE' AND id <> ?",
  )
  .run("smoke-competition-a", "smoke-template-v2");
database
  .prepare(
    "UPDATE template_version SET status = 'ACTIVE' WHERE competition_id = ? AND id = ? AND status = 'DRAFT'",
  )
  .run("smoke-competition-a", "smoke-template-v2");
database.exec("COMMIT");

database.exec("BEGIN");
database
  .prepare(
    "UPDATE rubric_version SET status = 'RETIRED' WHERE competition_id = ? AND status = 'ACTIVE' AND id <> ?",
  )
  .run("smoke-competition-a", "smoke-rubric-v2");
database
  .prepare(
    "UPDATE rubric_version SET status = 'ACTIVE' WHERE competition_id = ? AND id = ? AND status = 'DRAFT'",
  )
  .run("smoke-competition-a", "smoke-rubric-v2");
database.exec("COMMIT");

assert.deepEqual(
  database
    .prepare("SELECT id FROM template_version WHERE competition_id = ? AND status = 'ACTIVE'")
    .get("smoke-competition-a"),
  Object.assign(Object.create(null), { id: "smoke-template-v2" }),
);
assert.deepEqual(
  database
    .prepare("SELECT id FROM rubric_version WHERE competition_id = ? AND status = 'ACTIVE'")
    .get("smoke-competition-a"),
  Object.assign(Object.create(null), { id: "smoke-rubric-v2" }),
);

database
  .prepare("DELETE FROM competition WHERE id IN (?, ?)")
  .run("smoke-competition-a", "smoke-competition-b");
database.prepare("DELETE FROM user WHERE id IN (?, ?)").run("smoke-manager", "smoke-reviewer");
for (const table of [
  "competition",
  "competition_member",
  "category",
  "template_version",
  "rubric_version",
  "criterion",
  "user",
]) {
  assert.equal(database.prepare(`SELECT count(*) AS count FROM ${table}`).get().count, 0);
}

database.close();
console.log("P2-01 deterministic local configuration smoke: PASS");
