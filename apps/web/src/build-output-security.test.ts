import { describe, expect, it } from "vitest";

import { isSecretBearingFilePath } from "../scripts/build-output-security.mjs";

describe("build output secret file guard", () => {
  it.each([
    ".dev.vars",
    ".dev.vars.local",
    ".dev.vars.example",
    ".env",
    ".env.production",
    ".env.example",
    "nested/credentials.json",
    "nested/secrets.local",
    "certificates/worker.pem",
    "certificates/worker.key",
    ".npmrc",
    ".yarnrc.yml",
  ])("rejects %s from build output", (filePath) => {
    expect(isSecretBearingFilePath(filePath)).toBe(true);
  });

  it.each([
    "client/index.html",
    "client/robots.txt",
    "worker/index.js",
    "worker/wrangler.json",
    "client/.assetsignore",
  ])("allows expected build artifact %s", (filePath) => {
    expect(isSecretBearingFilePath(filePath)).toBe(false);
  });
});
