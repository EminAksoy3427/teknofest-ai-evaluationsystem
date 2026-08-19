import { readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";

const LOCAL_SECRET_FILE_PATTERN =
  /^(?:\.dev\.vars(?:\..+)?|\.env(?:\..+)?|credentials?(?:\..+)?|secrets?(?:\..+)?)$/i;
const PRIVATE_KEY_FILE_PATTERN = /\.(?:crt|jks|key|p12|p8|pem|pfx)$/i;
const LOCAL_PACKAGE_CONFIG_PATTERN = /^(?:\.npmrc|\.yarnrc(?:\.yml)?)$/i;

const SERVER_CONFIGURATION_KEYS = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
];

function normalizeOutputPath(filePath) {
  return filePath.replaceAll("\\", "/");
}

export function isSecretBearingFilePath(filePath) {
  const baseName = path.posix.basename(normalizeOutputPath(filePath));

  return (
    LOCAL_SECRET_FILE_PATTERN.test(baseName) ||
    PRIVATE_KEY_FILE_PATTERN.test(baseName) ||
    LOCAL_PACKAGE_CONFIG_PATTERN.test(baseName)
  );
}

export function secretBuildSafetyPlugin() {
  return {
    name: "teknofest-secret-build-safety",
    apply: "build",
    enforce: "post",
    generateBundle(_outputOptions, bundle) {
      for (const fileName of Object.keys(bundle)) {
        if (isSecretBearingFilePath(fileName)) {
          delete bundle[fileName];
        }
      }
    },
  };
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await listFiles(entryPath)));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }

  return files;
}

export async function assertBuildOutputSafe(outputDirectory) {
  const outputFiles = await listFiles(outputDirectory);
  const forbiddenFiles = outputFiles.filter(isSecretBearingFilePath);

  if (forbiddenFiles.length > 0) {
    await Promise.all(forbiddenFiles.map((filePath) => rm(filePath, { force: true })));

    const relativePaths = forbiddenFiles.map((filePath) =>
      path.relative(outputDirectory, filePath),
    );
    throw new Error(
      `Build output contained forbidden local configuration files: ${relativePaths.join(", ")}`,
    );
  }

  const clientDirectory = path.join(outputDirectory, "client");
  const clientFiles = outputFiles.filter((filePath) =>
    filePath.startsWith(`${clientDirectory}${path.sep}`),
  );
  const exposedCredentials = [];

  for (const filePath of clientFiles) {
    const source = await readFile(filePath, "utf8");

    for (const configurationKey of SERVER_CONFIGURATION_KEYS) {
      const valueAssignmentPattern = new RegExp(`${configurationKey}["']?\\s*[:=]`);

      if (valueAssignmentPattern.test(source)) {
        exposedCredentials.push(`${path.relative(outputDirectory, filePath)}:${configurationKey}`);
      }
    }
  }

  if (exposedCredentials.length > 0) {
    throw new Error(
      `Client build exposed server credential assignments: ${exposedCredentials.join(", ")}`,
    );
  }

  return {
    checkedFileCount: outputFiles.length,
    checkedClientAssetCount: clientFiles.length,
  };
}
