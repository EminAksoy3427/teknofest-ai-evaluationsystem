import type { EmbeddingConfiguration } from "../ai/embedding-env";

export class EmbeddingProviderError extends Error {
  readonly code:
    | "EMBEDDING_REQUEST_FAILED"
    | "EMBEDDING_RESPONSE_INVALID"
    | "EMBEDDING_DIMENSION_MISMATCH"
    | "EMBEDDING_EMPTY";

  constructor(code: EmbeddingProviderError["code"], message: string) {
    super(message);
    this.name = "EmbeddingProviderError";
    this.code = code;
  }
}

/**
 * Minimal embedding boundary. Only the normalized section body text crosses it; no identifiers,
 * secrets or personal data are sent, and the input is never logged.
 */
export interface EmbeddingProvider {
  readonly dimensions: number;
  embed(texts: readonly string[]): Promise<number[][]>;
}

/** The subset of the Workers AI binding this adapter uses. */
export interface WorkersAIBinding {
  run(model: string, input: { text: string[] }): Promise<unknown>;
}

function isFiniteNumberArray(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.every((entry) => typeof entry === "number" && Number.isFinite(entry))
  );
}

/**
 * Reads the embedding vectors out of a Workers AI response without trusting its shape. The
 * documented response is `{ shape: number[], data: number[][] }`; anything else is rejected rather
 * than coerced, so a malformed provider reply can never become a fabricated semantic score.
 */
export function parseEmbeddingResponse(response: unknown, expected: number): number[][] {
  if (typeof response !== "object" || response === null) {
    throw new EmbeddingProviderError(
      "EMBEDDING_RESPONSE_INVALID",
      "Gömme sağlayıcısı beklenen yanıt yapısını döndürmedi.",
    );
  }
  const data = (response as { data?: unknown }).data;
  if (!Array.isArray(data) || data.length === 0) {
    throw new EmbeddingProviderError(
      "EMBEDDING_RESPONSE_INVALID",
      "Gömme sağlayıcısı vektör verisi döndürmedi.",
    );
  }
  const vectors: number[][] = [];
  for (const entry of data) {
    if (!isFiniteNumberArray(entry)) {
      throw new EmbeddingProviderError(
        "EMBEDDING_RESPONSE_INVALID",
        "Gömme sağlayıcısı geçersiz vektör değeri döndürdü.",
      );
    }
    if (entry.length !== expected) {
      throw new EmbeddingProviderError(
        "EMBEDDING_DIMENSION_MISMATCH",
        "Gömme vektör boyutu yapılandırılmış boyutla eşleşmiyor.",
      );
    }
    vectors.push(entry);
  }
  return vectors;
}

export class WorkersAIEmbeddingProvider implements EmbeddingProvider {
  readonly #binding: WorkersAIBinding;
  readonly #configuration: EmbeddingConfiguration;

  constructor(binding: WorkersAIBinding, configuration: EmbeddingConfiguration) {
    this.#binding = binding;
    this.#configuration = configuration;
  }

  get dimensions(): number {
    return this.#configuration.dimensions;
  }

  async embed(texts: readonly string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    let response: unknown;
    try {
      response = await this.#binding.run(this.#configuration.modelId, { text: [...texts] });
    } catch {
      // The provider error is intentionally not propagated: it may carry request content.
      throw new EmbeddingProviderError(
        "EMBEDDING_REQUEST_FAILED",
        "Gömme sağlayıcısına erişilemedi.",
      );
    }
    const vectors = parseEmbeddingResponse(response, this.#configuration.dimensions);
    if (vectors.length !== texts.length) {
      throw new EmbeddingProviderError(
        "EMBEDDING_RESPONSE_INVALID",
        "Gömme sağlayıcısı istenen sayıda vektör döndürmedi.",
      );
    }
    return vectors;
  }
}
