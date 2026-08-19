import { fileURLToPath } from "node:url";

import { assertBuildOutputSafe } from "./build-output-security.mjs";

const outputDirectory = fileURLToPath(new URL("../dist", import.meta.url));
const result = await assertBuildOutputSafe(outputDirectory);

console.log(
  `Build output safety check passed (${result.checkedFileCount} files, ${result.checkedClientAssetCount} client assets checked).`,
);
