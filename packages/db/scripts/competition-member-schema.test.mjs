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

const insertUser = database.prepare(
  "INSERT INTO user (id, name, email, email_verified, updated_at) VALUES (?, ?, ?, 1, ?)",
);
const insertCompetition = database.prepare(
  "INSERT INTO competition (id, name, slug) VALUES (?, ?, ?)",
);
const insertMembership = database.prepare(
  "INSERT INTO competition_member (id, competition_id, user_id, role) VALUES (?, ?, ?, ?)",
);

insertUser.run("user-a", "Kullanıcı A", "user-a@example.com", Date.now());
insertUser.run("user-b", "Kullanıcı B", "user-b@example.com", Date.now());
insertCompetition.run("competition-a", "Yarışma A", "yarisma-a");
insertCompetition.run("competition-b", "Yarışma B", "yarisma-b");
insertMembership.run("membership-a", "competition-a", "user-a", "REVIEWER");

assert.throws(
  () =>
    insertMembership.run("duplicate-membership", "competition-a", "user-a", "COMPETITION_MANAGER"),
  /UNIQUE constraint failed/,
  "A user must have only one membership per competition",
);

assert.throws(
  () => insertMembership.run("invalid-role", "competition-b", "user-b", "ADMIN"),
  /CHECK constraint failed/,
  "Unsupported roles must be rejected",
);

assert.throws(
  () => insertMembership.run("missing-user", "competition-b", "missing-user", "CONTESTANT"),
  /FOREIGN KEY constraint failed/,
  "Memberships must reference an existing auth user",
);

insertMembership.run("membership-b", "competition-b", "user-b", "COMPETITION_MANAGER");
database.prepare("DELETE FROM competition WHERE id = ?").run("competition-a");

assert.equal(
  database
    .prepare("SELECT count(*) AS count FROM competition_member WHERE id = ?")
    .get("membership-a").count,
  0,
  "Deleting a competition must cascade its memberships",
);

database.prepare("DELETE FROM user WHERE id = ?").run("user-b");

assert.equal(
  database
    .prepare("SELECT count(*) AS count FROM competition_member WHERE id = ?")
    .get("membership-b").count,
  0,
  "Deleting an auth user must cascade their memberships",
);

database.close();
console.log("competition_member schema integration: PASS");
