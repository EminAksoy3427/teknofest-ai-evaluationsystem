import type { Plugin } from "vite";

export interface BuildOutputSafetyResult {
  checkedFileCount: number;
  checkedClientAssetCount: number;
}

export function isSecretBearingFilePath(filePath: string): boolean;
export function secretBuildSafetyPlugin(): Plugin;
export function assertBuildOutputSafe(outputDirectory: string): Promise<BuildOutputSafetyResult>;
