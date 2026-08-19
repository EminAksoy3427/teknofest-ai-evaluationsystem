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

const devVariables = readDevVariableNames();
assert.ok(!configured(process.env.OPENAI_API_KEY), `${milestone} must run without OPENAI_API_KEY`);
assert.ok(!configured(process.env.OPENAI_MODEL), `${milestone} must run without OPENAI_MODEL`);
assert.ok(!devVariables.has("OPENAI_API_KEY"), `${milestone} .dev.vars must not configure OpenAI`);
assert.ok(!devVariables.has("OPENAI_MODEL"), `${milestone} .dev.vars must not configure OpenAI`);

function run(command, arguments_, cwd = webDirectory) {
  const environment = { ...process.env, WRANGLER_SEND_METRICS: "false" };
  delete environment.OPENAI_API_KEY;
  delete environment.OPENAI_MODEL;
  const result = spawnSync(command, arguments_, {
    cwd,
    env: environment,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${command} ${arguments_.join(" ")} failed`);
}

const nodeCommand = process.execPath;
const pnpmEntryPoint = process.env.npm_execpath;
assert.ok(pnpmEntryPoint, "pnpm entry point is required");

if (milestone === "p2-03") {
  run(nodeCommand, [
    pnpmEntryPoint,
    "test",
    "src/server/analysis/document-extraction.test.ts",
    "src/server/analysis/process-analysis-run.test.ts",
  ]);
  run(nodeCommand, [join(scriptDirectory, "p2-02-r2-smoke.mjs")]);
  run(nodeCommand, [join(scriptDirectory, "p2-02-local-smoke.mjs")]);
  run(nodeCommand, [join(repositoryDirectory, "packages/db/scripts/analysis-run-schema.test.mjs")]);
  console.log("P2-03 isolated extraction-stage smoke (no semantic checks): PASS");
} else {
  run(nodeCommand, [
    pnpmEntryPoint,
    "test",
    "src/server/analysis/document-extraction.test.ts",
    "src/server/analysis/process-analysis-run.test.ts",
    "src/server/analysis/structural-checks.test.ts",
  ]);
  run(nodeCommand, [join(repositoryDirectory, "packages/db/scripts/analysis-run-schema.test.mjs")]);
  console.log("P3-01 isolated extraction + structural-stage smoke (no semantic checks): PASS");
}
