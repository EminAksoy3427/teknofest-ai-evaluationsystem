import { type EmbeddingBindings, readEmbeddingConfiguration } from "../ai/embedding-env";
import { type WorkersAIBinding, WorkersAIEmbeddingProvider } from "./embedding-provider";
import type { SimilarityVectorProvider } from "./similarity-vector-provider";
import {
  type SimilarityVectorizeBinding,
  VectorizeSimilarityVectorProvider,
} from "./vectorize-similarity-vector-provider";

export interface SimilarityVectorBindings extends Partial<EmbeddingBindings> {
  AI?: WorkersAIBinding;
  SIMILARITY_VECTORS?: SimilarityVectorizeBinding;
}

/**
 * Production composition of the semantic similarity provider.
 *
 * Returns `null` when the Workers AI or Vectorize bindings are absent. That is the deliberate
 * P4-01A deployment shape: similarity then runs lexical-only and the check reports
 * `semanticStatus: "DISABLED"`. No fake or synthetic provider is ever substituted in production.
 *
 * When the bindings are present but the embedding configuration is invalid, this throws rather than
 * degrading silently: that is an operator misconfiguration, and a silently wrong embedding
 * dimension would otherwise disable semantic analysis forever without anyone noticing. Runtime
 * provider or index failures are handled separately and degrade to lexical-only.
 */
export function createSimilarityVectorProvider(
  environment: SimilarityVectorBindings,
): SimilarityVectorProvider | null {
  if (!environment.AI || !environment.SIMILARITY_VECTORS) return null;
  const configuration = readEmbeddingConfiguration(environment);
  return new VectorizeSimilarityVectorProvider(
    environment.SIMILARITY_VECTORS,
    new WorkersAIEmbeddingProvider(environment.AI, configuration),
  );
}
