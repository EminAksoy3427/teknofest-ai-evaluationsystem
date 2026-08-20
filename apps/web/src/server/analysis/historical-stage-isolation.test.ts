import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Read as text so the wrapper contract can be asserted without Node typings in this package.
import smokeSource from "../../../scripts/historical-stage-smoke.mjs?raw";

import { readAIConfiguration } from "../ai/env";
import { ambientEnvironment, ambientOpenAIConfigured } from "../test-fixtures/ambient-environment";
import {
  createForbiddenAIProvider,
  runExtractionStageHarness,
  runStructuralStageHarness,
  SEMANTIC_STAGE_MARKERS,
} from "../test-fixtures/milestone-stage-harness";
import {
  openAINetworkAttemptCount,
  openAINetworkAttemptHosts,
  resetOpenAINetworkGuard,
} from "../test-fixtures/openai-network-guard";

// Regression test for the historical smoke isolation defect: `smoke:p2-03` and `smoke:p3-01` used
// to fail merely because the developer had valid local OpenAI credentials configured. The correct
// invariant is that these milestone stages do not USE OpenAI, not that the machine must not HAVE
// OpenAI configuration. Synthetic placeholder values are used below; no real credential is read.

const SYNTHETIC_API_KEY = "test-only-synthetic-key-not-a-credential";
const SYNTHETIC_MODEL = "gpt-5-test";

type AmbientState = "present" | "absent";

function applyAmbient(state: AmbientState) {
  if (state === "present") {
    ambientEnvironment.OPENAI_API_KEY = SYNTHETIC_API_KEY;
    ambientEnvironment.OPENAI_MODEL = SYNTHETIC_MODEL;
    return;
  }
  delete ambientEnvironment.OPENAI_API_KEY;
  delete ambientEnvironment.OPENAI_MODEL;
}

describe.each(["present", "absent"] as const)(
  "historical milestone stage isolation with ambient OpenAI configuration %s",
  (state: AmbientState) => {
    const originalKey = ambientEnvironment.OPENAI_API_KEY;
    const originalModel = ambientEnvironment.OPENAI_MODEL;

    beforeEach(() => {
      resetOpenAINetworkGuard();
      applyAmbient(state);
    });

    afterEach(() => {
      if (originalKey === undefined) delete ambientEnvironment.OPENAI_API_KEY;
      else ambientEnvironment.OPENAI_API_KEY = originalKey;
      if (originalModel === undefined) delete ambientEnvironment.OPENAI_MODEL;
      else ambientEnvironment.OPENAI_MODEL = originalModel;
    });

    it("reports the ambient configuration state the test intends to simulate", () => {
      expect(ambientOpenAIConfigured()).toBe(state === "present");
    });

    it("P2-03 extraction stage succeeds without touching the semantic provider or the network", async () => {
      const forbidden = createForbiddenAIProvider();
      const record = await runExtractionStageHarness();

      // The P2-03 milestone contract.
      expect(record.extraction?.documentArtifactKey).toBe(
        "derived/submission-a/run-a/document.json",
      );
      expect(record.extraction?.pageCount).toBe(2);
      expect(record.artifactPageNumbers).toEqual([1, 2]);
      expect(record.sourceSha256).toHaveLength(64);
      expect(record.artifactKeys).toEqual(["derived/submission-a/run-a/document.json"]);

      // Isolation.
      expect(forbidden.callCount()).toBe(0);
      expect(forbidden.calledMethods()).toEqual([]);
      expect(openAINetworkAttemptCount()).toBe(0);
      expect(openAINetworkAttemptHosts()).toEqual([]);
      for (const marker of SEMANTIC_STAGE_MARKERS) {
        expect(record.repositoryCalls).not.toContain(marker);
      }
      expect(record.checks).toEqual([]);
    });

    it("P2-03 extraction stage is retry-idempotent on the derived artifact key", async () => {
      const first = await runExtractionStageHarness();
      const second = await runExtractionStageHarness();
      expect(second.extraction).toEqual(first.extraction);
      expect(second.artifactKeys).toEqual(first.artifactKeys);
      expect(openAINetworkAttemptCount()).toBe(0);
    });

    it("P3-01 structural stage succeeds without touching the semantic provider or the network", async () => {
      const forbidden = createForbiddenAIProvider();
      const record = await runStructuralStageHarness();

      // The P3-01 milestone contract: exactly the three deterministic prechecks, from the pinned
      // template profile, and never a semantic check type.
      expect(record.checks.map((check) => check.type)).toEqual([
        "LANGUAGE",
        "TEMPLATE_STRUCTURE",
        "SECTION_PRESENCE",
      ]);
      expect(record.checks.map((check) => check.type)).not.toContain("SECTION_CONTENT");
      expect(record.checks.map((check) => check.type)).not.toContain("CATEGORY_FIT");
      expect(record.artifactPageNumbers).toEqual([1, 2]);

      // A negative deterministic finding must not prevent the stage from completing.
      expect(record.checks.every((check) => ["PASS", "WARN", "FAIL"].includes(check.status))).toBe(
        true,
      );

      // Isolation.
      expect(forbidden.callCount()).toBe(0);
      expect(openAINetworkAttemptCount()).toBe(0);
      expect(openAINetworkAttemptHosts()).toEqual([]);
      for (const marker of SEMANTIC_STAGE_MARKERS) {
        expect(record.repositoryCalls).not.toContain(marker);
      }
    });

    it("P3-01 structural stage reconciles the same checks on retry", async () => {
      const first = await runStructuralStageHarness();
      const second = await runStructuralStageHarness();
      expect(second.checks.map((check) => check.type)).toEqual(
        first.checks.map((check) => check.type),
      );
      expect(openAINetworkAttemptCount()).toBe(0);
    });
  },
);

describe("historical stage isolation guardrails", () => {
  afterEach(() => resetOpenAINetworkGuard());

  it("proves the forbidden provider spy would actually observe a semantic call", async () => {
    const forbidden = createForbiddenAIProvider();
    await expect(forbidden.provider.analyzeSectionContent({ sections: [] })).rejects.toThrow(
      /semantic provider/u,
    );
    expect(forbidden.callCount()).toBe(1);
    expect(forbidden.calledMethods()).toEqual(["analyzeSectionContent"]);
  });

  it("proves the network guard actually blocks and counts an OpenAI request", async () => {
    resetOpenAINetworkGuard();
    await expect(fetch("https://api.openai.com/v1/responses")).rejects.toThrow(
      /network guard blocked/u,
    );
    expect(openAINetworkAttemptCount()).toBe(1);
    expect(openAINetworkAttemptHosts()).toEqual(["api.openai.com"]);
    resetOpenAINetworkGuard();
    expect(openAINetworkAttemptCount()).toBe(0);
  });

  it("leaves production AI configuration validation unchanged", () => {
    // Production still demands a real pinned GPT-5 configuration; nothing was relaxed.
    expect(() => readAIConfiguration({})).toThrow(/OPENAI_API_KEY/u);
    expect(() => readAIConfiguration({ OPENAI_API_KEY: "replace_me" })).toThrow(/OPENAI_API_KEY/u);
    expect(() =>
      readAIConfiguration({ OPENAI_API_KEY: SYNTHETIC_API_KEY, OPENAI_MODEL: "gpt-4o" }),
    ).toThrow(/GPT-5/u);
    expect(
      readAIConfiguration({ OPENAI_API_KEY: SYNTHETIC_API_KEY, OPENAI_MODEL: SYNTHETIC_MODEL }),
    ).toEqual({ provider: "OPENAI", apiKey: SYNTHETIC_API_KEY, modelId: SYNTHETIC_MODEL });
  });
});

describe("historical smoke wrapper never gates on ambient OpenAI configuration", () => {
  // Regression guard for the exact checkpoint blocker: the wrapper previously asserted that
  // OPENAI_API_KEY / OPENAI_MODEL were absent from process.env and from apps/web/.dev.vars, which
  // forced developers to delete valid local credentials.
  const assertionLines = smokeSource
    .split(/\r?\n/)
    .filter((line) => /\bassert\b/.test(line) && !line.trimStart().startsWith("//"));

  it("contains no assertion that requires OpenAI configuration to be absent", () => {
    const offending = assertionLines.filter((line) => /OPENAI_(API_KEY|MODEL)/.test(line));
    expect(offending).toEqual([]);
  });

  it("does not read .dev.vars values, only configured variable names", () => {
    expect(smokeSource).not.toMatch(/must not configure OpenAI/u);
    expect(smokeSource).toMatch(/Values are never read or printed/u);
  });

  it("reports ambient configuration as a boolean only", () => {
    expect(smokeSource).toMatch(
      /ambient OpenAI configuration present: \$\{[^}]*\? "YES" : "NO"\}/u,
    );
  });

  it("still strips OpenAI configuration from every child process environment", () => {
    expect(smokeSource).toMatch(/delete environment\.OPENAI_API_KEY/u);
    expect(smokeSource).toMatch(/delete environment\.OPENAI_MODEL/u);
  });

  it("refuses to run a semantic or similarity stage file inside a historical slice", () => {
    expect(smokeSource).toMatch(/FORBIDDEN_SLICE_PATTERNS/u);
    for (const pattern of ["semantic", "similarity", "category-fit"]) {
      expect(smokeSource).toContain(`"${pattern}"`);
    }
    expect(smokeSource).toMatch(/assertHistoricalSlice\(slice\)/u);
  });

  it("proves the P2-03 live Worker path created no AnalysisRun, so SEMANTIC_CHECKS is unreachable", () => {
    expect(smokeSource).toMatch(/must not create an AnalysisRun/u);
    expect(smokeSource).toMatch(/runsAfter - runsBefore/u);
  });
});
