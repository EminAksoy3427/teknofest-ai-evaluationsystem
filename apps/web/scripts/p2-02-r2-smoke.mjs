import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
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

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const webDirectory = resolve(scriptDirectory, "..");
const temporaryDirectory = mkdtempSync(resolve(webDirectory, ".tmp-p2-02-r2-smoke-"));
assert.ok(
  temporaryDirectory.startsWith(`${webDirectory}${sep}`),
  "Smoke cleanup target must stay inside apps/web",
);

const sourcePath = join(temporaryDirectory, "synthetic-report.pdf");
const downloadedPath = join(temporaryDirectory, "downloaded-report.pdf");
const bucket = "teknofest-ai-evaluationsystem-documents";
const key = "competitions/smoke/submissions/synthetic/file/report.pdf";
const objectPath = `${bucket}/${key}`;
const wrangler = join(webDirectory, "node_modules", "wrangler", "bin", "wrangler.js");
const pdf = Buffer.from(
  "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Count 0 /Kids [] >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n",
  "utf8",
);

function wranglerRun(arguments_) {
  const result = spawnSync(process.execPath, [wrangler, ...arguments_], {
    cwd: webDirectory,
    encoding: "utf8",
    env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
  });
  if (result.status !== 0) {
    throw new Error(`Wrangler local R2 command failed: ${result.stderr || result.stdout}`);
  }
}

try {
  writeFileSync(sourcePath, pdf);
  wranglerRun([
    "r2",
    "object",
    "put",
    objectPath,
    "--file",
    sourcePath,
    "--content-type",
    "application/pdf",
    "--local",
    "--force",
  ]);
  wranglerRun(["r2", "object", "get", objectPath, "--file", downloadedPath, "--local"]);
  assert.ok(existsSync(downloadedPath));
  const downloaded = readFileSync(downloadedPath);
  assert.equal(downloaded.subarray(0, 5).toString("ascii"), "%PDF-");
  assert.equal(
    createHash("sha256").update(downloaded).digest("hex"),
    createHash("sha256").update(pdf).digest("hex"),
    "Local R2 must return byte-identical PDF content",
  );
  wranglerRun(["r2", "object", "delete", objectPath, "--local", "--force"]);
  console.log("P2-02 local simulated R2 byte-integrity smoke: PASS");
} finally {
  if (existsSync(temporaryDirectory)) {
    const resolvedTemporaryDirectory = realpathSync(temporaryDirectory);
    assert.ok(
      resolvedTemporaryDirectory.startsWith(`${webDirectory}${sep}`),
      "Resolved smoke cleanup target must stay inside apps/web",
    );
    rmSync(resolvedTemporaryDirectory, { recursive: true, force: true });
  }
}
