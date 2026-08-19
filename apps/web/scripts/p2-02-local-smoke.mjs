import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { makeSignature } from "better-auth/crypto";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const webDirectory = resolve(scriptDirectory, "..");
const temporaryDirectory = mkdtempSync(resolve(webDirectory, ".tmp-p2-02-local-smoke-"));
assert.ok(temporaryDirectory.startsWith(`${webDirectory}${sep}`));

const wrangler = join(webDirectory, "node_modules", "wrangler", "bin", "wrangler.js");
const vite = join(webDirectory, "node_modules", "vite", "bin", "vite.js");
const runId = `${Date.now()}-${crypto.randomUUID()}`;
const userId = `smoke-user-${runId}`;
const sessionId = `smoke-session-${runId}`;
const sessionToken = `smoke-token-${runId}`;
const competitionId = `smoke-competition-${runId}`;
const categoryId = `smoke-category-${runId}`;
const baseUrl = "http://127.0.0.1:5173";
const pdf = new TextEncoder().encode("%PDF-1.4\nsynthetic P2-02 local API smoke\n%%EOF\n");
const storageKeys = [];
let server;

function sql(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function runWrangler(arguments_) {
  const result = spawnSync(process.execPath, [wrangler, ...arguments_], {
    cwd: webDirectory,
    encoding: "utf8",
    env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
  });
  if (result.status !== 0) {
    throw new Error(`Local Wrangler command failed: ${result.stderr || result.stdout}`);
  }
}

function readDevVariable(name) {
  const file = readFileSync(join(webDirectory, ".dev.vars"), "utf8");
  for (const line of file.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match?.[1] !== name) continue;
    const raw = match[2]?.trim() ?? "";
    return raw.replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/, (_whole, double, single) =>
      double === undefined ? single : double,
    );
  }
  throw new Error(`${name} is required in .dev.vars for the local smoke`);
}

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/v1/health`);
      if (response.ok) return;
    } catch {
      // The local Worker is still starting.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  throw new Error("Local Worker did not become ready for P2-02 smoke");
}

async function json(response) {
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`Unexpected API ${response.status}: ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function upload(cookie, applicationCode, bytes = pdf) {
  const form = new FormData();
  form.set("applicationCode", applicationCode);
  form.set("projectTitle", `Sentetik Proje ${applicationCode}`);
  form.set("categoryId", categoryId);
  form.set("report", new File([bytes], `${applicationCode}.pdf`, { type: "application/pdf" }));
  return fetch(`${baseUrl}/api/v1/competitions/${competitionId}/submissions`, {
    method: "POST",
    headers: { cookie },
    body: form,
  });
}

try {
  const now = Date.now();
  const seedPath = join(temporaryDirectory, "seed.sql");
  writeFileSync(
    seedPath,
    [
      `INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES (${sql(userId)}, 'Smoke Manager', ${sql(`${userId}@example.com`)}, 1, ${now}, ${now});`,
      `INSERT INTO session (id, expires_at, token, created_at, updated_at, user_id) VALUES (${sql(sessionId)}, ${now + 3_600_000}, ${sql(sessionToken)}, ${now}, ${now}, ${sql(userId)});`,
      `INSERT INTO competition (id, name, slug, description) VALUES (${sql(competitionId)}, 'Smoke Competition', ${sql(`smoke-${runId}`)}, 'Synthetic smoke only');`,
      `INSERT INTO competition_member (id, competition_id, user_id, role) VALUES (${sql(`smoke-member-${runId}`)}, ${sql(competitionId)}, ${sql(userId)}, 'COMPETITION_MANAGER');`,
      `INSERT INTO category (id, competition_id, name, code, description) VALUES (${sql(categoryId)}, ${sql(competitionId)}, 'Yapay Zekâ', 'ai', 'Synthetic category');`,
    ].join("\n"),
  );
  runWrangler([
    "d1",
    "execute",
    "DB",
    "--local",
    "--experimental-provision=false",
    "--experimental-auto-create=false",
    "--file",
    seedPath,
  ]);

  server = spawn(process.execPath, [vite, "--host", "127.0.0.1"], {
    cwd: webDirectory,
    env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
    stdio: "ignore",
  });
  await waitForServer();

  const health = await fetch(`${baseUrl}/api/v1/health`);
  const databaseHealth = await fetch(`${baseUrl}/api/v1/health/db`);
  const frontend = await fetch(baseUrl);
  assert.equal(health.status, 200);
  assert.equal(databaseHealth.status, 200);
  assert.equal(frontend.status, 200);
  assert.ok((await frontend.text()).includes('id="root"'));

  const secret = readDevVariable("BETTER_AUTH_SECRET");
  const cookie = `better-auth.session_token=${sessionToken}.${await makeSignature(sessionToken, secret)}`;
  const firstResponse = await upload(cookie, "SMOKE-001");
  assert.equal(firstResponse.status, 201);
  const first = await json(firstResponse);
  assert.equal(first.exactDuplicate, false);
  storageKeys.push(
    `competitions/${competitionId}/submissions/${first.id}/${first.file.id}/report.pdf`,
  );

  const secondResponse = await upload(cookie, "SMOKE-002");
  assert.equal(secondResponse.status, 201);
  const second = await json(secondResponse);
  assert.equal(second.exactDuplicate, true);
  assert.equal(second.matchingSubmissionCount, 1);
  storageKeys.push(
    `competitions/${competitionId}/submissions/${second.id}/${second.file.id}/report.pdf`,
  );

  const list = await json(
    await fetch(`${baseUrl}/api/v1/competitions/${competitionId}/submissions`, {
      headers: { cookie },
    }),
  );
  assert.equal(list.submissions.length, 2);
  assert.ok(list.submissions.every((submission) => !("storageKey" in submission)));
  const reportResponse = await fetch(
    `${baseUrl}/api/v1/competitions/${competitionId}/submissions/${first.id}/report`,
    { headers: { cookie } },
  );
  assert.equal(reportResponse.status, 200);
  assert.equal(reportResponse.headers.get("content-type"), "application/pdf");
  assert.deepEqual(new Uint8Array(await reportResponse.arrayBuffer()), pdf);

  const malformed = await upload(cookie, "SMOKE-003", new TextEncoder().encode("not a PDF"));
  assert.equal(malformed.status, 400);
  console.log("P2-02 authenticated local D1 + simulated R2 API smoke: PASS");
} finally {
  if (server?.exitCode === null) {
    server.kill("SIGTERM");
    await Promise.race([
      new Promise((resolvePromise) => server.once("exit", resolvePromise)),
      new Promise((resolvePromise) => setTimeout(resolvePromise, 5_000)),
    ]);
    if (server.exitCode === null) server.kill("SIGKILL");
  }
  for (const storageKey of storageKeys) {
    runWrangler([
      "r2",
      "object",
      "delete",
      `teknofest-ai-evaluationsystem-documents/${storageKey}`,
      "--local",
      "--force",
    ]);
  }
  const cleanupPath = join(temporaryDirectory, "cleanup.sql");
  writeFileSync(
    cleanupPath,
    `DELETE FROM competition WHERE id = ${sql(competitionId)};\nDELETE FROM user WHERE id = ${sql(userId)};\n`,
  );
  runWrangler([
    "d1",
    "execute",
    "DB",
    "--local",
    "--experimental-provision=false",
    "--experimental-auto-create=false",
    "--file",
    cleanupPath,
  ]);
  if (existsSync(temporaryDirectory)) {
    const resolvedTemporaryDirectory = realpathSync(temporaryDirectory);
    assert.ok(resolvedTemporaryDirectory.startsWith(`${webDirectory}${sep}`));
    rmSync(resolvedTemporaryDirectory, { recursive: true, force: true });
  }
}
