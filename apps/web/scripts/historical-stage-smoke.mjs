import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const webDirectory = resolve(scriptDirectory, "..");
const repositoryDirectory = resolve(webDirectory, "../..");
const milestone = process.argv[2];
assert.ok(milestone === "p2-03" || milestone === "p3-01", "Unknown historical smoke milestone");

function configured(value) {
  return typeof value === "string" && value.trim().length > 0;
}

// Reads only the NAMES of configured local variables. Values are never read or printed.
function readDevVariableNames() {
  const path = join(webDirectory, ".dev.vars");
  if (!existsSync(path)) return new Set();
  return new Set(
    readFileSync(path, "utf8")
      .split(/\r?\n/)
      .map((line) => line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/))
      .filter((match) => match && configured(match[2]))
      .map((match) => match[1]),
  );
}

// A developer may legitimately hold valid local OpenAI credentials once the P3-02A live provider
// smoke has been completed. Historical milestone smokes must therefore be isolated from the
// semantic stage regardless of ambient configuration. The correct invariant is that P2-03 and
// P3-01 do not USE OpenAI, not that the machine must not HAVE OpenAI configuration. Ambient state
// is reported as a boolean only, never asserted and never printed as a value.
const devVariables = readDevVariableNames();
const ambientOpenAIConfiguration =
  configured(process.env.OPENAI_API_KEY) ||
  configured(process.env.OPENAI_MODEL) ||
  devVariables.has("OPENAI_API_KEY") ||
  devVariables.has("OPENAI_MODEL");
console.log(
  `${milestone} ambient OpenAI configuration present: ${ambientOpenAIConfiguration ? "YES" : "NO"}`,
);
console.log(`${milestone} historical stage isolation does not depend on ambient configuration.`);

// The historical slices must never include a semantic or similarity stage test file.
const FORBIDDEN_SLICE_PATTERNS = ["semantic", "similarity", "category-fit"];
function assertHistoricalSlice(files) {
  for (const file of files) {
    for (const pattern of FORBIDDEN_SLICE_PATTERNS) {
      assert.ok(
        !file.toLowerCase().includes(pattern),
        `${milestone} slice must not include the non-historical stage file ${file}`,
      );
    }
  }
}

function childEnvironment() {
  const environment = { ...process.env, WRANGLER_SEND_METRICS: "false" };
  // Defense in depth: the historical stage children never receive OpenAI configuration through
  // the process environment. The developer's own .dev.vars file is left untouched.
  delete environment.OPENAI_API_KEY;
  delete environment.OPENAI_MODEL;
  return environment;
}

function run(command, arguments_, cwd = webDirectory) {
  const result = spawnSync(command, arguments_, {
    cwd,
    env: childEnvironment(),
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${command} ${arguments_.join(" ")} failed`);
}

const wrangler = join(webDirectory, "node_modules", "wrangler", "bin", "wrangler.js");

// Enforced (not assumed) evidence that the live local Worker path never entered the analysis
// pipeline, and therefore never entered SEMANTIC_CHECKS.
function localAnalysisRunCount() {
  const result = spawnSync(
    process.execPath,
    [
      wrangler,
      "d1",
      "execute",
      "DB",
      "--local",
      "--experimental-provision=false",
      "--experimental-auto-create=false",
      "--json",
      "--command",
      "SELECT count(*) AS analysis_run_count FROM analysis_run;",
    ],
    { cwd: webDirectory, env: childEnvironment(), encoding: "utf8" },
  );
  assert.equal(result.status, 0, "local D1 analysis_run count query failed");
  const output = result.stdout ?? "";
  const start = output.indexOf("[");
  const end = output.lastIndexOf("]");
  assert.ok(start >= 0 && end > start, "local D1 count query returned no parseable JSON");
  const parsed = JSON.parse(output.slice(start, end + 1));
  const count = parsed?.[0]?.results?.[0]?.analysis_run_count;
  assert.equal(typeof count, "number", "local D1 count query returned no numeric count");
  return count;
}

const nodeCommand = process.execPath;
const pnpmEntryPoint = process.env.npm_execpath;
assert.ok(pnpmEntryPoint, "pnpm entry point is required");

const ISOLATION_TEST = "src/server/analysis/historical-stage-isolation.test.ts";

if (milestone === "p2-03") {
  const slice = [
    "src/server/analysis/document-extraction.test.ts",
    "src/server/analysis/process-analysis-run.test.ts",
    ISOLATION_TEST,
  ];
  assertHistoricalSlice(slice);
  run(nodeCommand, [pnpmEntryPoint, "test", ...slice]);
  const runsBefore = localAnalysisRunCount();
  run(nodeCommand, [join(scriptDirectory, "p2-02-r2-smoke.mjs")]);
  run(nodeCommand, [join(scriptDirectory, "p2-02-local-smoke.mjs")]);
  const runsAfter = localAnalysisRunCount();
  assert.equal(
    runsAfter - runsBefore,
    0,
    "P2-03 smoke must not create an AnalysisRun, so SEMANTIC_CHECKS is never entered",
  );
  run(nodeCommand, [join(repositoryDirectory, "packages/db/scripts/analysis-run-schema.test.mjs")]);
  console.log(
    "P2-03 isolated extraction-stage smoke (no semantic checks, no OpenAI request): PASS",
  );
} else {
  const slice = [
    "src/server/analysis/document-extraction.test.ts",
    "src/server/analysis/process-analysis-run.test.ts",
    "src/server/analysis/structural-checks.test.ts",
    ISOLATION_TEST,
  ];
  assertHistoricalSlice(slice);
  run(nodeCommand, [pnpmEntryPoint, "test", ...slice]);
  run(nodeCommand, [join(repositoryDirectory, "packages/db/scripts/analysis-run-schema.test.mjs")]);
  console.log(
    "P3-01 isolated extraction + structural-stage smoke (no semantic checks, no OpenAI request): PASS",
  );
}
