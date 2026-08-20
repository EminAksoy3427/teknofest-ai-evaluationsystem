// P4-01B remote verification smoke. NOT part of the CI/local quality gates: it makes real,
// billable Workers AI and Vectorize calls against the `teknofest-similarity-dev` development
// index. Run manually and rarely: `npx tsx scripts/p4-01b-remote-smoke.ts`.
//
// It exercises the real production provider classes (WorkersAIEmbeddingProvider,
// VectorizeSimilarityVectorProvider) and the real hybrid-scoring functions
// (lexicalSimilarity, hybridSimilarityScore, similarityLevel) through thin REST-backed binding
// shims that satisfy the exact same narrow interfaces the Cloudflare Worker bindings expose. No
// application code is modified or mocked; only the transport underneath the binding interface is
// swapped from `env.AI` / `env.VECTORIZE` to the Cloudflare REST API, because this repository does
// not deploy the Worker as part of this task.
import fs from "node:fs";

import type { SimilaritySectionCandidate } from "@teknofest-ai/shared";

import { readEmbeddingConfiguration } from "../src/server/ai/embedding-env";
import {
  type WorkersAIBinding,
  WorkersAIEmbeddingProvider,
} from "../src/server/analysis/embedding-provider";
import {
  hybridSimilarityScore,
  lexicalSimilarity,
  similarityLevel,
} from "../src/server/analysis/similarity";
import {
  type SimilarityVectorizeBinding,
  VectorizeSimilarityVectorProvider,
} from "../src/server/analysis/vectorize-similarity-vector-provider";

function requireAccountId(): string {
  const value = process.env.CF_ACCOUNT_ID;
  if (!value)
    throw new Error("Set CF_ACCOUNT_ID (the Cloudflare account id) before running this smoke.");
  return value;
}

const INDEX_NAME = process.env.CF_VECTORIZE_INDEX ?? "teknofest-similarity-dev";

function readApiToken(): string {
  if (process.env.CLOUDFLARE_API_TOKEN) return process.env.CLOUDFLARE_API_TOKEN;
  const tomlPath = process.env.WRANGLER_OAUTH_TOML;
  if (!tomlPath) {
    throw new Error(
      "Set CLOUDFLARE_API_TOKEN or WRANGLER_OAUTH_TOML (path to wrangler's default.toml) before running this smoke.",
    );
  }
  const toml = fs.readFileSync(tomlPath, "utf8");
  const match = toml.match(/oauth_token = "([^"]+)"/);
  if (!match) throw new Error("No oauth_token found in the given wrangler config file.");
  return match[1];
}

const callCounts = { ai: 0, vectorizeUpsert: 0, vectorizeQuery: 0 };

class RestWorkersAI implements WorkersAIBinding {
  constructor(
    private readonly token: string,
    private readonly accountId: string,
  ) {}

  async run(model: string, input: { text: string[] }): Promise<unknown> {
    callCounts.ai += 1;
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run/${model}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
        body: JSON.stringify(input),
      },
    );
    const json = (await response.json()) as { success: boolean; result: unknown; errors: unknown };
    if (!json.success)
      throw new Error(`Workers AI REST call failed: ${JSON.stringify(json.errors)}`);
    return json.result;
  }
}

class RestVectorize implements SimilarityVectorizeBinding {
  private readonly base: string;
  readonly mutationIds: string[] = [];

  constructor(
    private readonly token: string,
    accountId: string,
    indexName: string,
  ) {
    this.base = `https://api.cloudflare.com/client/v4/accounts/${accountId}/vectorize/v2/indexes/${indexName}`;
  }

  async describe(): Promise<{ processedUpToMutation?: string }> {
    const response = await fetch(`${this.base}/info`, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    const json = (await response.json()) as {
      success: boolean;
      result: { processedUpToMutation?: string };
    };
    if (!json.success) throw new Error("Vectorize info REST call failed.");
    return json.result;
  }

  async waitForConsistency(maxAttempts = 15, intervalMs = 3_000): Promise<void> {
    const target = this.mutationIds.at(-1);
    if (!target) return;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const info = await this.describe();
      if (info.processedUpToMutation === target) return;
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    console.warn(
      `Vectorize did not confirm consistency for mutation ${target} within the poll budget.`,
    );
  }

  async upsert(vectors: VectorizeVector[]): Promise<unknown> {
    callCounts.vectorizeUpsert += 1;
    const ndjson = `${vectors.map((vector) => JSON.stringify(vector)).join("\n")}\n`;
    const response = await fetch(`${this.base}/upsert`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/x-ndjson" },
      body: ndjson,
    });
    const json = (await response.json()) as {
      success: boolean;
      result: { mutationId?: string };
      errors: unknown;
    };
    if (!json.success)
      throw new Error(`Vectorize upsert REST call failed: ${JSON.stringify(json.errors)}`);
    if (json.result.mutationId) this.mutationIds.push(json.result.mutationId);
    return json.result;
  }

  async query(
    vector: number[] | VectorFloatArray,
    options?: VectorizeQueryOptions,
  ): Promise<VectorizeMatches> {
    callCounts.vectorizeQuery += 1;
    const response = await fetch(`${this.base}/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ vector: Array.from(vector as ArrayLike<number>), ...options }),
    });
    const json = (await response.json()) as {
      success: boolean;
      result: VectorizeMatches;
      errors: unknown;
    };
    if (!json.success)
      throw new Error(`Vectorize query REST call failed: ${JSON.stringify(json.errors)}`);
    return json.result;
  }
}

function section(
  competitionId: string,
  submissionId: string,
  analysisRunId: string,
  text: string,
): SimilaritySectionCandidate {
  return {
    metadata: {
      competitionId,
      submissionId,
      analysisRunId,
      sectionKey: "yontem",
      sectionTitle: "Yöntem",
      pageStart: 3,
      pageEnd: 4,
    },
    text,
  };
}

const TEXT_A =
  "Bu çalışmada insansız hava aracıyla toplanan tarım arazisi görüntüleri üzerinde evrişimli " +
  "sinir ağı tabanlı bir segmentasyon modeli eğitilmiştir. Model, ekili alan sınırlarını ve " +
  "yabani ot yoğunluğunu piksel düzeyinde ayırt ederek hakemin gözden geçirebileceği bir " +
  "risk haritası üretir. Eğitim verisi farklı mevsimlerde çekilen görüntülerle çoğaltılmış, " +
  "doğrulama seti ayrı parsellerden oluşturulmuştur.";

const TEXT_B =
  "Tarım arazilerinin İHA ile taranmasında, çekilen görüntüler derin öğrenme tabanlı bir " +
  "segmentasyon ağına verilerek ekili bölge ile yabani bitki örtüsü piksel bazında " +
  "ayrıştırılmaktadır. Elde edilen çıktı, uzmanın inceleyebileceği bir uyarı haritasına " +
  "dönüştürülür. Veri kümesi çeşitli mevsim görüntüleriyle genişletilmiş, doğrulama farklı " +
  "parsellerden sağlanmıştır.";

const TEXT_C =
  "Bu bölümde elektrikli araç şarj istasyonlarının yük dengeleme algoritması anlatılmaktadır. " +
  "Şebeke üzerindeki anlık talep, istasyon başına ayrılan güç bütçesine göre dinamik olarak " +
  "yeniden dağıtılır ve aşırı yüklenme durumunda öncelik sırasına göre şarj hızı kısıtlanır. " +
  "Test ortamı gerçek sayaç verileriyle beslenmiştir.";

async function main() {
  const token = readApiToken();
  const accountId = requireAccountId();
  const embeddingConfig = readEmbeddingConfiguration({});
  console.log("Embedding configuration:", embeddingConfig);

  const aiBinding = new RestWorkersAI(token, accountId);
  const embedder = new WorkersAIEmbeddingProvider(aiBinding, embeddingConfig);

  const vectorizeA = new RestVectorize(token, accountId, INDEX_NAME);
  const providerA = new VectorizeSimilarityVectorProvider(vectorizeA, embedder);

  const COMPETITION_A = "smoke-competition-a";
  const COMPETITION_B = "smoke-competition-b";

  const secA = section(COMPETITION_A, "smoke-submission-a", "smoke-run-a1", TEXT_A);
  const secB = section(COMPETITION_A, "smoke-submission-b", "smoke-run-b1", TEXT_B);
  const secC = section(COMPETITION_A, "smoke-submission-c", "smoke-run-c1", TEXT_C);
  const secX = section(COMPETITION_B, "smoke-submission-x", "smoke-run-x1", TEXT_A);

  console.log("Indexing Competition A sections (A, B, C)...");
  await providerA.indexSections(COMPETITION_A, [secA, secB, secC]);
  console.log("Indexing Competition B section (X, near-identical to A)...");
  await providerA.indexSections(COMPETITION_B, [secX]);

  console.log("Waiting for Vectorize eventual consistency...");
  await vectorizeA.waitForConsistency();

  console.log(
    "Querying from Competition A, source=A, candidates=[B,C] (historical D1 candidate contract shape)...",
  );
  const restrictedMatches = await providerA.findSimilarSections({
    competitionId: COMPETITION_A,
    query: secA,
    topK: 5,
    analysisRunIds: ["smoke-run-b1", "smoke-run-c1"],
  });

  console.log(
    "Querying from Competition A, source=A, no allow-list restriction (isolation defense-in-depth check)...",
  );
  const unrestrictedMatches = await providerA.findSimilarSections({
    competitionId: COMPETITION_A,
    query: secA,
    topK: 5,
  });

  const semanticAB =
    restrictedMatches.find((m) => m.metadata.submissionId === "smoke-submission-b")?.score ?? null;
  const semanticAC =
    restrictedMatches.find((m) => m.metadata.submissionId === "smoke-submission-c")?.score ?? null;
  const xLeaked = unrestrictedMatches.some((m) => m.metadata.submissionId === "smoke-submission-x");

  const lexicalAB = lexicalSimilarity(TEXT_A, TEXT_B);
  const lexicalAC = lexicalSimilarity(TEXT_A, TEXT_C);

  const combinedAB = semanticAB === null ? lexicalAB : hybridSimilarityScore(lexicalAB, semanticAB);
  const combinedAC = semanticAC === null ? lexicalAC : hybridSimilarityScore(lexicalAC, semanticAC);

  const report = {
    embeddingConfiguration: embeddingConfig,
    restrictedMatches,
    unrestrictedMatches,
    crossCompetitionLeak: xLeaked,
    hybrid: {
      AB: {
        lexicalScore: lexicalAB,
        semanticScore: semanticAB,
        mode: semanticAB === null ? "LEXICAL_ONLY" : "HYBRID",
        combinedScore: combinedAB,
        level: similarityLevel(combinedAB),
      },
      AC: {
        lexicalScore: lexicalAC,
        semanticScore: semanticAC,
        mode: semanticAC === null ? "LEXICAL_ONLY" : "HYBRID",
        combinedScore: combinedAC,
        level: similarityLevel(combinedAC),
      },
    },
    callCounts,
  };

  console.log(JSON.stringify(report, null, 2));

  console.log("Cleaning up smoke vectors...");
  const ids = await Promise.all(
    [secA, secB, secC, secX].map((candidate) =>
      import("../src/server/analysis/vectorize-similarity-vector-provider").then((mod) =>
        mod.similarityVectorId(candidate.metadata),
      ),
    ),
  );
  const cleanupResponse = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/vectorize/v2/indexes/${INDEX_NAME}/delete_by_ids`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    },
  );
  console.log("Cleanup status:", cleanupResponse.status, await cleanupResponse.text());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
