export interface EmbeddingBindings {
  SIMILARITY_EMBEDDING_MODEL: string;
  SIMILARITY_EMBEDDING_DIMENSIONS: string;
}

export interface EmbeddingConfiguration {
  provider: "WORKERS_AI";
  modelId: string;
  dimensions: number;
}

/**
 * Provider-specific identifiers live here, never in similarity domain scoring logic. The default
 * is the multilingual BGE-M3 Workers AI model; the Vectorize index must be provisioned with the
 * matching dimension and the cosine metric, because both are immutable after index creation.
 */
export const DEFAULT_EMBEDDING_MODEL = "@cf/baai/bge-m3";
export const DEFAULT_EMBEDDING_DIMENSIONS = 1024;
export const EMBEDDING_DISTANCE_METRIC = "cosine";

const MAX_SUPPORTED_DIMENSIONS = 1536;

export function readEmbeddingConfiguration(
  environment: Partial<EmbeddingBindings>,
): EmbeddingConfiguration {
  const modelId = environment.SIMILARITY_EMBEDDING_MODEL?.trim() || DEFAULT_EMBEDDING_MODEL;
  if (modelId.length > 200 || modelId === "replace_me") {
    throw new Error("SIMILARITY_EMBEDDING_MODEL yapılandırması geçersiz.");
  }
  const rawDimensions = environment.SIMILARITY_EMBEDDING_DIMENSIONS?.trim();
  const dimensions = rawDimensions ? Number(rawDimensions) : DEFAULT_EMBEDDING_DIMENSIONS;
  if (!Number.isInteger(dimensions) || dimensions <= 0 || dimensions > MAX_SUPPORTED_DIMENSIONS) {
    throw new Error("SIMILARITY_EMBEDDING_DIMENSIONS pozitif bir tam sayı olmalıdır.");
  }
  return { provider: "WORKERS_AI", modelId, dimensions };
}
