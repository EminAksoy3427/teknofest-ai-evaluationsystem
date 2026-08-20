import type { AIProvider } from "@teknofest-ai/ai";
import type {
  AnalysisCheckRepository,
  AnalysisCheckWriteInput,
  AnalysisRunRepository,
} from "@teknofest-ai/db";
import {
  type DocumentExtractionArtifact,
  DocumentExtractionArtifactSchema,
  type TemplateStructuralProfile,
} from "@teknofest-ai/shared";

import { processAnalysisRun } from "../analysis/process-analysis-run";
import { processStructuralChecks } from "../analysis/structural-checks";
import type { DocumentStorage } from "../storage/documents";

// Test-only milestone stage harness. It drives the real production stage functions
// (`processAnalysisRun`, `processStructuralChecks`) over a synthetic in-memory D1/R2 world so that
// historical milestone regressions can be validated per stage. No implementation logic is
// duplicated here; the harness only composes the production seams the Workflow composes.

const SOURCE_BYTES = new TextEncoder().encode(
  "%PDF-1.4\nsynthetic historical milestone stage fixture\n%%EOF",
);

const STRUCTURAL_PROFILE: TemplateStructuralProfile = {
  expectedLanguage: "tr",
  sections: [
    { key: "summary", title: "Proje Özeti", description: "", required: true, order: 1 },
    { key: "problem", title: "Problem Tanımı", description: "", required: true, order: 2 },
  ],
};

const PAGES = [
  { pageNumber: 1, text: "Proje Özeti\nSentetik tarımsal izleme projesinin kısa özeti buradadır." },
  {
    pageNumber: 2,
    text: "Problem Tanımı\nÜreticiler hastalığı geç fark ettiği için ürün kaybı oluşur.",
  },
];

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy.buffer);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export interface StageHarnessRecord {
  /** Repository transition methods the stage path actually invoked, in order. */
  repositoryCalls: string[];
  /** AnalysisCheck rows the stage path persisted. */
  checks: AnalysisCheckWriteInput[];
  /** Private R2 keys the stage path wrote. */
  artifactKeys: string[];
  extraction: {
    documentArtifactKey: string;
    pageCount: number;
    characterCount: number;
    warnings: string[];
  } | null;
  /** Page numbers preserved in the derived artifact. */
  artifactPageNumbers: number[];
  sourceSha256: string;
}

/**
 * An AIProvider that must never be reached. Historical P2-03/P3-01 stages have no semantic step,
 * so any call here is a defect: the call is recorded and then rejected.
 */
export function createForbiddenAIProvider(): {
  provider: AIProvider;
  callCount(): number;
  calledMethods(): readonly string[];
} {
  const calls: string[] = [];
  const reject = (method: string) => {
    calls.push(method);
    return Promise.reject(
      new Error(`Historical stage harness reached the semantic provider via ${method}.`),
    );
  };
  return {
    provider: {
      analyzeSectionContent: () => reject("analyzeSectionContent"),
      analyzeCategoryFit: () => reject("analyzeCategoryFit"),
    } as unknown as AIProvider,
    callCount: () => calls.length,
    calledMethods: () => [...calls],
  };
}

interface HarnessWorld {
  database: D1Database;
  bucket: R2Bucket;
  record: StageHarnessRecord;
  runRepository: AnalysisRunRepository;
  checkRepository: AnalysisCheckRepository;
  storage: DocumentStorage;
  extractor: (input: {
    bytes: Uint8Array;
    submissionId: string;
    analysisRunId: string;
    sourceSha256: string;
  }) => Promise<DocumentExtractionArtifact>;
}

async function createWorld(): Promise<HarnessWorld> {
  const sourceSha256 = await sha256Hex(SOURCE_BYTES);
  const record: StageHarnessRecord = {
    repositoryCalls: [],
    checks: [],
    artifactKeys: [],
    extraction: null,
    artifactPageNumbers: [],
    sourceSha256,
  };
  const objects = new Map<string, string>();
  let documentArtifactKey: string | null = null;

  const context = () => ({
    id: "run-a",
    submissionId: "submission-a",
    status: "PROCESSING" as const,
    sourceSha256,
    sourceStorageKey: "private/submission-a/source.pdf",
    documentArtifactKey,
    templateVersionId: "template-v1",
    templateStructuralProfile: STRUCTURAL_PROFILE,
    projectTitle: "Sentetik tarımsal izleme",
    // Pinned AI configuration stays on the run exactly as production stores it. The historical
    // stages must still never use it.
    aiProvider: "OPENAI",
    modelId: "gpt-5-test",
    promptBundleVersion: "semantic-checks/v1",
    categorySnapshot: {
      id: "category-a",
      name: "Yapay Zekâ",
      code: "yapay-zeka",
      description: "Sentetik açıklama.",
      guidance: "",
    },
  });

  const runRepository = {
    getAnalysisRunExecutionContext: async () => {
      record.repositoryCalls.push("getAnalysisRunExecutionContext");
      return context();
    },
    markAnalysisRunProcessing: async () => {
      record.repositoryCalls.push("markAnalysisRunProcessing");
    },
    markAnalysisRunStructuralChecks: async (
      _binding: D1Database,
      _analysisRunId: string,
      extraction: { documentArtifactKey: string },
    ) => {
      record.repositoryCalls.push("markAnalysisRunStructuralChecks");
      documentArtifactKey = extraction.documentArtifactKey;
    },
    markAnalysisRunSemanticChecks: async () => {
      record.repositoryCalls.push("markAnalysisRunSemanticChecks");
    },
    markAnalysisRunSimilarityChecks: async () => {
      record.repositoryCalls.push("markAnalysisRunSimilarityChecks");
    },
    markAnalysisRunSucceeded: async () => {
      record.repositoryCalls.push("markAnalysisRunSucceeded");
    },
    markAnalysisRunFailed: async () => {
      record.repositoryCalls.push("markAnalysisRunFailed");
    },
  } as unknown as AnalysisRunRepository;

  const checkRepository = {
    upsertAnalysisChecks: async (
      _binding: D1Database,
      _analysisRunId: string,
      inputs: readonly AnalysisCheckWriteInput[],
    ) => {
      record.repositoryCalls.push("upsertAnalysisChecks");
      record.checks = [...inputs];
    },
  } as unknown as AnalysisCheckRepository;

  const storage = {
    getSubmissionReport: async () =>
      ({ arrayBuffer: async () => new Uint8Array(SOURCE_BYTES).buffer }) as R2ObjectBody,
    putDocumentArtifact: async (_bucket: R2Bucket, key: string, body: string) => {
      record.artifactKeys.push(key);
      objects.set(key, body);
      return { etag: "artifact-etag" };
    },
    getDocumentArtifact: async (_bucket: R2Bucket, key: string) => {
      const body = objects.get(key);
      return body ? ({ text: async () => body } as R2ObjectBody) : null;
    },
  } as unknown as DocumentStorage;

  const extractor = async (input: {
    submissionId: string;
    analysisRunId: string;
    sourceSha256: string;
  }) => {
    const pages = PAGES.map((page) => ({ ...page, characterCount: page.text.length }));
    return DocumentExtractionArtifactSchema.parse({
      schemaVersion: "document-extraction/v1",
      submissionId: input.submissionId,
      analysisRunId: input.analysisRunId,
      sourceSha256: input.sourceSha256,
      pageCount: pages.length,
      characterCount: pages.reduce((total, page) => total + page.characterCount, 0),
      pages,
      warnings: [],
    });
  };

  return {
    database: {} as D1Database,
    bucket: {} as R2Bucket,
    record,
    runRepository,
    checkRepository,
    storage,
    extractor,
  };
}

function readArtifactPages(world: HarnessWorld, key: string): Promise<number[]> {
  return world.storage.getDocumentArtifact(world.bucket, key).then(async (object) => {
    if (!object) return [];
    const artifact = DocumentExtractionArtifactSchema.parse(JSON.parse(await object.text()));
    return artifact.pages.map((page) => page.pageNumber);
  });
}

/**
 * P2-03 slice: extraction only. Mirrors the Workflow's `ingest-and-extract` step and stops there.
 * Source SHA verification, page preservation and the derived private artifact key all come from
 * production code.
 */
export async function runExtractionStageHarness(): Promise<StageHarnessRecord> {
  const world = await createWorld();
  const extraction = await processAnalysisRun(world.database, world.bucket, "run-a", {
    repository: world.runRepository,
    storage: world.storage,
    extractor: world.extractor,
  });
  world.record.extraction = {
    documentArtifactKey: extraction.documentArtifactKey,
    pageCount: extraction.pageCount,
    characterCount: extraction.characterCount,
    warnings: [...extraction.warnings],
  };
  world.record.artifactPageNumbers = await readArtifactPages(world, extraction.documentArtifactKey);
  return world.record;
}

/**
 * P3-01 slice: extraction followed by STRUCTURAL_CHECKS, exactly as the Workflow sequences them.
 * Stops before SEMANTIC_CHECKS.
 */
export async function runStructuralStageHarness(): Promise<StageHarnessRecord> {
  const world = await createWorld();
  const extraction = await processAnalysisRun(world.database, world.bucket, "run-a", {
    repository: world.runRepository,
    storage: world.storage,
    extractor: world.extractor,
  });
  world.record.extraction = {
    documentArtifactKey: extraction.documentArtifactKey,
    pageCount: extraction.pageCount,
    characterCount: extraction.characterCount,
    warnings: [...extraction.warnings],
  };
  await world.runRepository.markAnalysisRunStructuralChecks(
    world.database,
    "run-a",
    extraction as Parameters<AnalysisRunRepository["markAnalysisRunStructuralChecks"]>[2],
  );
  await processStructuralChecks(world.database, world.bucket, "run-a", {
    runRepository: world.runRepository,
    checkRepository: world.checkRepository,
    storage: world.storage,
    detector: () => "tur",
  });
  world.record.artifactPageNumbers = await readArtifactPages(world, extraction.documentArtifactKey);
  return world.record;
}

/** Stage transition names that only the semantic milestone may produce. */
export const SEMANTIC_STAGE_MARKERS = [
  "markAnalysisRunSemanticChecks",
  "markAnalysisRunSimilarityChecks",
] as const;
