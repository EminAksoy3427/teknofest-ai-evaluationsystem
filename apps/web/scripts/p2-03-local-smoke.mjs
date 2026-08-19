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

import { createSyntheticTextPdf } from "./synthetic-pdf.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const webDirectory = resolve(scriptDirectory, "..");
const temporaryDirectory = mkdtempSync(resolve(webDirectory, ".tmp-p2-03-local-smoke-"));
assert.ok(temporaryDirectory.startsWith(`${webDirectory}${sep}`));

const wrangler = join(webDirectory, "node_modules", "wrangler", "bin", "wrangler.js");
const vite = join(webDirectory, "node_modules", "vite", "bin", "vite.js");
const bucket = "teknofest-ai-evaluationsystem-documents";
const runSuffix = `${Date.now()}-${crypto.randomUUID()}`;
const userId = `p203-user-${runSuffix}`;
const sessionId = `p203-session-${runSuffix}`;
const sessionToken = `p203-token-${runSuffix}`;
const competitionId = `p203-competition-${runSuffix}`;
const categoryId = `p203-category-${runSuffix}`;
const templateV1Id = `p203-template-v1-${runSuffix}`;
const rubricV1Id = `p203-rubric-v1-${runSuffix}`;
const baseUrl = "http://127.0.0.1:5173";
const pageTexts = [
  "Proje Özeti\nBu sentetik proje yenilikçi ve sürdürülebilir bir teknoloji çözümü geliştirmektedir.\nKullanıcı ihtiyaçları araştırılmış ve güvenli bir yöntem tasarlanmıştır.",
  "Problem Tanımı\nMevcut süreçlerde verimlilik ve erişilebilirlik sorunları bulunmaktadır.\nÇözüm Yaklaşımı\nÖnerilen sistem ölçülebilir ve açıklanabilir sonuçlar üretir.\nKaynakça\nYalnız sentetik kaynak.",
];
const englishPageTexts = [
  "Proje Özeti\nThis synthetic project develops an innovative and sustainable technology solution.\nUser needs were researched and a secure method was designed for reliable outcomes.",
  "Çözüm Yaklaşımı\nThe proposed system produces measurable explainable and accessible results.\nThis fixture contains no real submission data.",
];
const sourcePdf = createSyntheticTextPdf(pageTexts);
const storageKeys = [];
const artifactKeys = [];
const artifactExpectations = new Map();
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
  return result.stdout;
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
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/v1/health`);
      if (response.ok) return;
    } catch {
      // Local workerd is still starting.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  throw new Error("Local Worker did not become ready for P2-03 smoke");
}

async function stopServer() {
  if (server?.exitCode !== null) return;
  server.kill("SIGTERM");
  await Promise.race([
    new Promise((resolvePromise) => server.once("exit", resolvePromise)),
    new Promise((resolvePromise) => setTimeout(resolvePromise, 5_000)),
  ]);
  if (server.exitCode === null) server.kill("SIGKILL");
}

async function json(response) {
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`Unexpected API ${response.status}: ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function jsonRequest(cookie, path, method = "GET", body) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      cookie,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function upload(cookie, applicationCode, bytes) {
  const form = new FormData();
  form.set("applicationCode", applicationCode);
  form.set("projectTitle", `Synthetic ${applicationCode}`);
  form.set("categoryId", categoryId);
  form.set("report", new File([bytes], `${applicationCode}.pdf`, { type: "application/pdf" }));
  const submission = await json(
    await fetch(`${baseUrl}/api/v1/competitions/${competitionId}/submissions`, {
      method: "POST",
      headers: { cookie },
      body: form,
    }),
  );
  storageKeys.push(
    `competitions/${competitionId}/submissions/${submission.id}/${submission.file.id}/report.pdf`,
  );
  return submission;
}

async function waitForTerminalRun(cookie, submissionId, analysisRunId) {
  const statuses = new Set();
  for (let attempt = 0; attempt < 160; attempt += 1) {
    const run = await json(
      await jsonRequest(
        cookie,
        `/api/v1/competitions/${competitionId}/submissions/${submissionId}/analysis-runs/${analysisRunId}`,
      ),
    );
    statuses.add(run.status);
    if (run.status === "SUCCEEDED" || run.status === "FAILED") return { run, statuses };
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  throw new Error(`AnalysisRun ${analysisRunId} did not reach a terminal state`);
}

try {
  const now = Date.now();
  const seedPath = join(temporaryDirectory, "seed.sql");
  writeFileSync(
    seedPath,
    [
      `INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES (${sql(userId)}, 'P2-03 Smoke Manager', ${sql(`${userId}@example.com`)}, 1, ${now}, ${now});`,
      `INSERT INTO session (id, expires_at, token, created_at, updated_at, user_id) VALUES (${sql(sessionId)}, ${now + 3_600_000}, ${sql(sessionToken)}, ${now}, ${now}, ${sql(userId)});`,
      `INSERT INTO competition (id, name, slug, description) VALUES (${sql(competitionId)}, 'P2-03 Synthetic Competition', ${sql(`p203-${runSuffix}`)}, 'Synthetic smoke only');`,
      `INSERT INTO competition_member (id, competition_id, user_id, role) VALUES (${sql(`p203-member-${runSuffix}`)}, ${sql(competitionId)}, ${sql(userId)}, 'COMPETITION_MANAGER');`,
      `INSERT INTO category (id, competition_id, name, code, description) VALUES (${sql(categoryId)}, ${sql(competitionId)}, 'Synthetic Category', 'synthetic', 'Synthetic only');`,
      `INSERT INTO template_version (id, competition_id, version_number, label, status, structural_profile) VALUES (${sql(templateV1Id)}, ${sql(competitionId)}, 1, 'v1', 'ACTIVE', '{"expectedLanguage":"tr","sections":[{"key":"summary","title":"Proje Özeti","description":"","required":true,"order":1},{"key":"problem","title":"Problem Tanımı","description":"","required":true,"order":2},{"key":"solution","title":"Çözüm Yaklaşımı","description":"","required":true,"order":3},{"key":"references","title":"Kaynakça","description":"","required":false,"order":4}]}');`,
      `INSERT INTO rubric_version (id, competition_id, version_number, label, status) VALUES (${sql(rubricV1Id)}, ${sql(competitionId)}, 1, 'v1', 'ACTIVE');`,
      `INSERT INTO criterion (id, rubric_version_id, code, title, description, evidence_expectation, max_score, weight_basis_points, sort_order) VALUES (${sql(`p203-criterion-v1-${runSuffix}`)}, ${sql(rubricV1Id)}, 'quality', 'Quality', 'Synthetic only', 'Synthetic evidence', 10, 10000, 1);`,
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
  const submission = await upload(cookie, "P203-001", sourcePdf);
  const privateWithoutSession = await fetch(
    `${baseUrl}/api/v1/competitions/${competitionId}/submissions/${submission.id}/report`,
  );
  assert.equal(privateWithoutSession.status, 401);

  const startedR1 = await json(
    await jsonRequest(
      cookie,
      `/api/v1/competitions/${competitionId}/submissions/${submission.id}/analysis-runs`,
      "POST",
    ),
  );
  assert.equal(startedR1.templateVersionId, templateV1Id);
  assert.equal(startedR1.rubricVersionId, rubricV1Id);
  assert.equal(startedR1.sourceSha256, submission.file.sha256);
  assert.ok(!("documentArtifactKey" in startedR1));
  const terminalR1 = await waitForTerminalRun(cookie, submission.id, startedR1.id);
  assert.equal(terminalR1.run.status, "SUCCEEDED");
  assert.equal(terminalR1.run.extraction.pageCount, 2);
  assert.ok(terminalR1.run.extraction.characterCount > 100);
  assert.equal(terminalR1.run.stage, "STRUCTURAL_CHECKS");
  assert.deepEqual(
    Object.fromEntries(terminalR1.run.checks.map((check) => [check.type, check.status])),
    { LANGUAGE: "PASS", SECTION_PRESENCE: "PASS", TEMPLATE_STRUCTURE: "PASS" },
  );
  const sectionCheckR1 = terminalR1.run.checks.find((check) => check.type === "SECTION_PRESENCE");
  assert.deepEqual(
    sectionCheckR1.details.sections.map((section) => [section.sectionKey, section.pageNumber]),
    [
      ["summary", 1],
      ["problem", 2],
      ["solution", 2],
      ["references", 2],
    ],
  );
  assert.ok(!JSON.stringify(terminalR1.run).includes(pageTexts[0]));
  const r1ArtifactKey = `derived/${submission.id}/${startedR1.id}/document.json`;
  artifactKeys.push(r1ArtifactKey);
  artifactExpectations.set(r1ArtifactKey, {
    sourceSha256: submission.file.sha256,
    pageTexts,
  });
  const r1Checks = JSON.stringify(terminalR1.run.checks);

  const englishSubmission = await upload(
    cookie,
    "P301-ENGLISH-MISSING",
    createSyntheticTextPdf(englishPageTexts),
  );
  const englishStarted = await json(
    await jsonRequest(
      cookie,
      `/api/v1/competitions/${competitionId}/submissions/${englishSubmission.id}/analysis-runs`,
      "POST",
    ),
  );
  const englishTerminal = await waitForTerminalRun(cookie, englishSubmission.id, englishStarted.id);
  assert.equal(englishTerminal.run.status, "SUCCEEDED");
  assert.deepEqual(
    Object.fromEntries(englishTerminal.run.checks.map((check) => [check.type, check.status])),
    { LANGUAGE: "FAIL", SECTION_PRESENCE: "FAIL", TEMPLATE_STRUCTURE: "FAIL" },
  );
  const englishArtifactKey = `derived/${englishSubmission.id}/${englishStarted.id}/document.json`;
  artifactKeys.push(englishArtifactKey);
  artifactExpectations.set(englishArtifactKey, {
    sourceSha256: englishSubmission.file.sha256,
    pageTexts: englishPageTexts,
  });

  const sparsePageTexts = ["Kısa sentetik metin."];
  const sparseSubmission = await upload(
    cookie,
    "P301-SPARSE",
    createSyntheticTextPdf(sparsePageTexts),
  );
  const sparseStarted = await json(
    await jsonRequest(
      cookie,
      `/api/v1/competitions/${competitionId}/submissions/${sparseSubmission.id}/analysis-runs`,
      "POST",
    ),
  );
  const sparseTerminal = await waitForTerminalRun(cookie, sparseSubmission.id, sparseStarted.id);
  assert.equal(sparseTerminal.run.status, "SUCCEEDED");
  assert.equal(
    sparseTerminal.run.checks.find((check) => check.type === "LANGUAGE")?.status,
    "WARN",
  );
  const sparseArtifactKey = `derived/${sparseSubmission.id}/${sparseStarted.id}/document.json`;
  artifactKeys.push(sparseArtifactKey);
  artifactExpectations.set(sparseArtifactKey, {
    sourceSha256: sparseSubmission.file.sha256,
    pageTexts: sparsePageTexts,
  });

  const templateV2 = await json(
    await jsonRequest(cookie, `/api/v1/competitions/${competitionId}/templates`, "POST", {
      label: "v2",
      structuralProfile: {
        expectedLanguage: "en",
        sections: [
          { key: "summary", title: "Proje Özeti", description: "", required: true, order: 1 },
          { key: "problem", title: "Problem Tanımı", description: "", required: true, order: 2 },
          { key: "solution", title: "Çözüm Yaklaşımı", description: "", required: true, order: 3 },
          { key: "plan", title: "Uygulama Planı", description: "", required: true, order: 4 },
        ],
      },
    }),
  );
  await json(
    await jsonRequest(
      cookie,
      `/api/v1/competitions/${competitionId}/templates/${templateV2.id}/activate`,
      "POST",
    ),
  );
  const rubricV2 = await json(
    await jsonRequest(cookie, `/api/v1/competitions/${competitionId}/rubrics`, "POST", {
      label: "v2",
    }),
  );
  await json(
    await jsonRequest(
      cookie,
      `/api/v1/competitions/${competitionId}/rubrics/${rubricV2.id}/criteria`,
      "PUT",
      {
        criteria: [
          {
            code: "impact",
            name: "Impact",
            description: "Synthetic only",
            maxScore: 10,
            weight: 100,
            evidenceExpectation: "Synthetic evidence",
            order: 1,
          },
        ],
      },
    ),
  );
  await json(
    await jsonRequest(
      cookie,
      `/api/v1/competitions/${competitionId}/rubrics/${rubricV2.id}/activate`,
      "POST",
    ),
  );

  const historicalR1 = await json(
    await jsonRequest(
      cookie,
      `/api/v1/competitions/${competitionId}/submissions/${submission.id}/analysis-runs/${startedR1.id}`,
    ),
  );
  assert.equal(historicalR1.templateVersionId, templateV1Id);
  assert.equal(historicalR1.rubricVersionId, rubricV1Id);
  assert.equal(JSON.stringify(historicalR1.checks), r1Checks);

  const startedR2 = await json(
    await jsonRequest(
      cookie,
      `/api/v1/competitions/${competitionId}/submissions/${submission.id}/analysis-runs`,
      "POST",
    ),
  );
  assert.equal(startedR2.templateVersionId, templateV2.id);
  assert.equal(startedR2.rubricVersionId, rubricV2.id);
  const terminalR2 = await waitForTerminalRun(cookie, submission.id, startedR2.id);
  assert.equal(terminalR2.run.status, "SUCCEEDED");
  assert.deepEqual(
    Object.fromEntries(terminalR2.run.checks.map((check) => [check.type, check.status])),
    { LANGUAGE: "FAIL", SECTION_PRESENCE: "FAIL", TEMPLATE_STRUCTURE: "FAIL" },
  );
  const r2ArtifactKey = `derived/${submission.id}/${startedR2.id}/document.json`;
  artifactKeys.push(r2ArtifactKey);
  artifactExpectations.set(r2ArtifactKey, {
    sourceSha256: submission.file.sha256,
    pageTexts,
  });

  const malformedSubmission = await upload(
    cookie,
    "P203-MALFORMED",
    new TextEncoder().encode("%PDF-1.4\nsynthetic malformed body"),
  );
  const malformedStart = await json(
    await jsonRequest(
      cookie,
      `/api/v1/competitions/${competitionId}/submissions/${malformedSubmission.id}/analysis-runs`,
      "POST",
    ),
  );
  const malformedTerminal = await waitForTerminalRun(
    cookie,
    malformedSubmission.id,
    malformedStart.id,
  );
  assert.equal(malformedTerminal.run.status, "FAILED");
  assert.equal(malformedTerminal.run.error.code, "PDF_PARSE_FAILED");
  assert.ok(!JSON.stringify(malformedTerminal.run).toLowerCase().includes("xref"));

  const history = await json(
    await jsonRequest(
      cookie,
      `/api/v1/competitions/${competitionId}/submissions/${submission.id}/analysis-runs`,
    ),
  );
  assert.deepEqual(
    history.runHistory.map((item) => item.id),
    [startedR2.id, startedR1.id],
  );
  assert.ok(history.runHistory.every((item) => !("documentArtifactKey" in item)));

  await stopServer();
  for (const [index, artifactKey] of artifactKeys.entries()) {
    const artifactPath = join(temporaryDirectory, `artifact-${index}.json`);
    runWrangler([
      "r2",
      "object",
      "get",
      `${bucket}/${artifactKey}`,
      "--file",
      artifactPath,
      "--local",
    ]);
    const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
    const expectation = artifactExpectations.get(artifactKey);
    assert.ok(expectation);
    assert.equal(artifact.schemaVersion, "document-extraction/v1");
    assert.equal(artifact.sourceSha256, expectation.sourceSha256);
    assert.equal(artifact.pageCount, expectation.pageTexts.length);
    assert.deepEqual(
      artifact.pages.map((page) => [page.pageNumber, page.text]),
      expectation.pageTexts.map((text, pageIndex) => [pageIndex + 1, text]),
    );
    assert.ok(!("userId" in artifact));
    assert.ok(!("email" in artifact));
  }

  console.log("P3-01 local Worker + D1 + R2 + Workflow + unpdf golden smoke: PASS");
} finally {
  await stopServer();
  for (const storageKey of [...artifactKeys, ...storageKeys]) {
    runWrangler(["r2", "object", "delete", `${bucket}/${storageKey}`, "--local", "--force"]);
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
