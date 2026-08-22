import {
  AnalysisRunResponseSchema,
  ApiErrorResponseSchema,
  CompetitionConfigurationResponseSchema,
  TemplateVersionResponseSchema,
} from "@teknofest-ai/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createFullTestApp, type FullTestApp } from "./test-fixtures/full-app";
import {
  applyRemainingMigrations,
  createLocalD1,
  type LocalD1,
  migrationChain,
} from "./test-fixtures/local-d1";
import { createMemoryDocumentStorage } from "./test-fixtures/memory-document-storage";
import { createSyntheticTextPdf } from "./test-fixtures/synthetic-pdf";

/**
 * A pre-P6.5A competition can hold an ACTIVE TemplateVersion that has no official file, because the
 * file requirement did not exist when it was activated. P6.5A deliberately preserves that row: the
 * migration neither deletes nor retires it, and the historical AnalysisRun pinned to it stays
 * readable. What it must NOT do is act as valid CURRENT configuration — readiness must report the
 * competition as not ready, and no NEW AnalysisRun may be pinned to it.
 *
 * The world below is seeded against the migration state BEFORE P6.5A and then upgraded, so the
 * legacy row is genuinely produced by the upgrade path rather than hand-written into the new schema.
 */

const PRE_P65A_MIGRATION_COUNT = migrationChain.length - 2;

const LEGACY = {
  competition: "legacy-competition",
  category: "legacy-category",
  templateV1: "legacy-template-v1",
  rubricV1: "legacy-rubric-v1",
  criterion: "legacy-criterion",
  manager: "legacy-user-manager",
  submission: "legacy-submission",
  runOne: "legacy-run-1",
} as const;

const STRUCTURAL_PROFILE = JSON.stringify({
  expectedLanguage: "tr",
  sections: [
    { key: "summary", title: "Proje Özeti", description: "", required: true, order: 1 },
    { key: "method", title: "Yöntem", description: "", required: true, order: 2 },
  ],
});

const SOURCE_SHA = "a".repeat(64);
const TEMPLATE_PDF_WITH_HEADINGS = createSyntheticTextPdf(["Proje Özeti\n\nYöntem\n\nMetin"]);

// Non-secret placeholders: the run below never leaves QUEUED, so no provider is ever contacted.
const AI_BINDINGS = {
  OPENAI_API_KEY: "test-key-not-a-real-credential",
  OPENAI_MODEL: "gpt-5-test",
  SUBMISSION_ANALYSIS: {
    create: async ({ id }: { id: string }) => ({ id }),
  } as unknown as Workflow,
};

let local: LocalD1;
let harness: FullTestApp;

function createLegacyWorld(): LocalD1 {
  const database = createLocalD1(PRE_P65A_MIGRATION_COUNT);
  database.exec(`
    INSERT INTO "user" (id, name, email) VALUES
      ('${LEGACY.manager}', 'Eski Yönetici', 'legacy-mgr@example.com');

    INSERT INTO competition (id, name, slug, description) VALUES
      ('${LEGACY.competition}', 'Eski Yarışma', 'eski-yarisma', 'Sentetik');

    INSERT INTO competition_member (id, competition_id, user_id, role) VALUES
      ('legacy-member-mgr', '${LEGACY.competition}', '${LEGACY.manager}', 'COMPETITION_MANAGER');

    INSERT INTO category (id, competition_id, name, code, description) VALUES
      ('${LEGACY.category}', '${LEGACY.competition}', 'Tarım', 'tarim', 'Sentetik');

    INSERT INTO template_version (id, competition_id, version_number, label, status, structural_profile) VALUES
      ('${LEGACY.templateV1}', '${LEGACY.competition}', 1, 'v1', 'ACTIVE', '${STRUCTURAL_PROFILE}');

    INSERT INTO rubric_version (id, competition_id, version_number, label, status) VALUES
      ('${LEGACY.rubricV1}', '${LEGACY.competition}', 1, 'Rubrik v1', 'ACTIVE');

    INSERT INTO criterion (
      id, rubric_version_id, code, title, description, evidence_expectation, max_score,
      weight_basis_points, sort_order
    ) VALUES
      ('${LEGACY.criterion}', '${LEGACY.rubricV1}', 'quality', 'Teknik Kalite', 'Sentetik', 'Sayfa alıntısı', 10, 10000, 1);

    INSERT INTO submission (id, competition_id, category_id, application_code, project_title) VALUES
      ('${LEGACY.submission}', '${LEGACY.competition}', '${LEGACY.category}', 'LEGACY-1', 'Eski Proje');

    INSERT INTO submission_file (
      id, submission_id, storage_key, original_filename, mime_type, size_bytes, sha256
    ) VALUES
      ('legacy-file-1', '${LEGACY.submission}', 'competitions/${LEGACY.competition}/submissions/${LEGACY.submission}/file/report.pdf', 'rapor.pdf', 'application/pdf', 2048, '${SOURCE_SHA}');

    INSERT INTO analysis_run (
      id, submission_id, category_id, template_version_id, rubric_version_id, source_sha256,
      status, stage, workflow_instance_id, document_artifact_key, page_count, character_count,
      extraction_warnings, created_at, started_at, completed_at
    ) VALUES (
      '${LEGACY.runOne}', '${LEGACY.submission}', '${LEGACY.category}', '${LEGACY.templateV1}',
      '${LEGACY.rubricV1}', '${SOURCE_SHA}', 'SUCCEEDED', 'RUBRIC_EVALUATION', '${LEGACY.runOne}',
      'legacy-1.json', 8, 4000, '[]', 100, 100, 200
    );
  `);
  applyRemainingMigrations(database, PRE_P65A_MIGRATION_COUNT);
  return database;
}

function analysisRunPath(suffix = "") {
  return `/api/v1/competitions/${LEGACY.competition}/submissions/${LEGACY.submission}/analysis-runs${suffix}`;
}

async function readConfiguration() {
  const response = await harness.request(
    LEGACY.manager,
    `/api/v1/competitions/${LEGACY.competition}/configuration`,
  );
  expect(response.status).toBe(200);
  return CompetitionConfigurationResponseSchema.parse(await response.json());
}

/** Creates, uploads a matching official file to, and activates a fresh TemplateVersion. */
async function activateTemplateWithOfficialFile(label: string) {
  const created = await harness.request(
    LEGACY.manager,
    `/api/v1/competitions/${LEGACY.competition}/templates`,
    { method: "POST", body: { label, structuralProfile: JSON.parse(STRUCTURAL_PROFILE) } },
  );
  expect(created.status).toBe(201);
  const draft = TemplateVersionResponseSchema.parse(await created.json());

  const uploaded = await harness.request(
    LEGACY.manager,
    `/api/v1/competitions/${LEGACY.competition}/templates/${draft.id}/file`,
    {
      method: "PUT",
      rawBody: TEMPLATE_PDF_WITH_HEADINGS,
      headers: { "content-type": "application/pdf" },
    },
  );
  expect(uploaded.status).toBe(200);

  const activated = await harness.request(
    LEGACY.manager,
    `/api/v1/competitions/${LEGACY.competition}/templates/${draft.id}/activate`,
    { method: "POST" },
  );
  expect(activated.status).toBe(200);
  return TemplateVersionResponseSchema.parse(await activated.json());
}

beforeEach(() => {
  local = createLegacyWorld();
  harness = createFullTestApp(local, createMemoryDocumentStorage().storage, AI_BINDINGS);
});

afterEach(() => {
  local.close();
});

describe("a legacy file-less ACTIVE TemplateVersion is preserved as history", () => {
  it("survives the P6.5A migration untouched, still ACTIVE and still without a file", () => {
    const rows = local.query(
      "SELECT status, storage_key, sha256, original_filename FROM template_version WHERE id = ?",
      LEGACY.templateV1,
    ) as { status: string; storage_key: string | null; sha256: string | null }[];

    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("ACTIVE");
    expect(rows[0]?.storage_key).toBeNull();
    expect(rows[0]?.sha256).toBeNull();
  });

  it("keeps the old AnalysisRun readable and pinned to that legacy template", async () => {
    const response = await harness.request(LEGACY.manager, analysisRunPath(`/${LEGACY.runOne}`));
    expect(response.status).toBe(200);
    const run = AnalysisRunResponseSchema.parse(await response.json());
    expect(run.templateVersionId).toBe(LEGACY.templateV1);
    expect(run.status).toBe("SUCCEEDED");
  });
});

describe("a legacy file-less ACTIVE TemplateVersion is not valid configuration for new work", () => {
  it("reports the competition as NOT ready while the active template has no official file", async () => {
    const configuration = await readConfiguration();

    // The active template genuinely exists — that fact is reported truthfully — but its missing
    // official file is what blocks readiness.
    expect(configuration.readiness.activeTemplate).toBe(true);
    expect(configuration.readiness.activeTemplateFile).toBe(false);
    expect(configuration.readiness.ready).toBe(false);
  });

  it("rejects creating a NEW AnalysisRun against the file-less active template", async () => {
    const response = await harness.request(LEGACY.manager, analysisRunPath(), { method: "POST" });
    expect(response.status).toBe(409);
    expect(ApiErrorResponseSchema.parse(await response.json()).code).toBe("CONFLICT");

    // Nothing was written: the submission still has exactly its one historical run.
    const runs = local.query(
      "SELECT id FROM analysis_run WHERE submission_id = ?",
      LEGACY.submission,
    );
    expect(runs).toHaveLength(1);
  });
});

describe("activating a file-backed v2 restores current configuration", () => {
  it("makes the competition ready, pins a new run to v2 and leaves the old run on v1", async () => {
    const templateV2 = await activateTemplateWithOfficialFile("v2");
    expect(templateV2.file).not.toBeNull();

    const configuration = await readConfiguration();
    expect(configuration.readiness.activeTemplateFile).toBe(true);
    expect(configuration.readiness.ready).toBe(true);

    const created = await harness.request(LEGACY.manager, analysisRunPath(), { method: "POST" });
    expect(created.status).toBe(201);
    const runTwo = AnalysisRunResponseSchema.parse(await created.json());
    expect(runTwo.templateVersionId).toBe(templateV2.id);

    // The historical run never floats forward onto the new template.
    const runOne = AnalysisRunResponseSchema.parse(
      await (await harness.request(LEGACY.manager, analysisRunPath(`/${LEGACY.runOne}`))).json(),
    );
    expect(runOne.templateVersionId).toBe(LEGACY.templateV1);
    expect(runOne.id).not.toBe(runTwo.id);
  });
});
