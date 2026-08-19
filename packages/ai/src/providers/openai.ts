import OpenAI, { APIConnectionTimeoutError, APIError, RateLimitError } from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { ZodError, type ZodType } from "zod";

import {
  type AICategoryFitOutput,
  AICategoryFitOutputSchema,
  type AIProvider,
  AIProviderError,
  type AISectionContentOutput,
  AISectionContentOutputSchema,
  type CategoryFitAnalysisInput,
  type SectionContentAnalysisInput,
} from "../contracts";
import { getSemanticPromptBundle } from "../prompts";

export const OPENAI_PROVIDER_ID = "OPENAI";
export const DEFAULT_OPENAI_TIMEOUT_MS = 60_000;

interface ParsedResponse<T> {
  status: string;
  output_parsed: T | null;
  output?: Array<{ type?: string; content?: Array<{ type?: string }> }>;
}

interface ResponsesClient {
  parse<T>(body: unknown): Promise<ParsedResponse<T>>;
}

export interface OpenAIProviderOptions {
  apiKey: string;
  modelId: string;
  promptBundleVersion: string;
  timeoutMs?: number;
  maxRetries?: number;
  responsesClient?: ResponsesClient;
}

function hasRefusal(response: ParsedResponse<unknown>): boolean {
  return (
    response.output?.some((item) => item.content?.some((content) => content.type === "refusal")) ??
    false
  );
}

function mapProviderError(error: unknown): never {
  if (error instanceof AIProviderError) throw error;
  if (error instanceof RateLimitError || (error instanceof APIError && error.status === 429)) {
    throw new AIProviderError("RATE_LIMITED", "Yapay zekâ sağlayıcısı geçici olarak yoğun.", true);
  }
  if (error instanceof APIConnectionTimeoutError) {
    throw new AIProviderError("TIMEOUT", "Yapay zekâ sağlayıcısı zaman aşımına uğradı.", true);
  }
  if (error instanceof ZodError) {
    throw new AIProviderError(
      "OUTPUT_VALIDATION_FAILED",
      "Yapay zekâ çıktısı uygulama şemasıyla doğrulanamadı.",
    );
  }
  if (error instanceof SyntaxError) {
    throw new AIProviderError(
      "STRUCTURED_OUTPUT_PARSE_FAILED",
      "Yapay zekâ yapılandırılmış çıktısı ayrıştırılamadı.",
    );
  }
  throw new AIProviderError("NETWORK_ERROR", "Yapay zekâ sağlayıcısına erişilemedi.", true);
}

export class OpenAIProvider implements AIProvider {
  readonly modelId: string;
  readonly promptBundleVersion: string;
  private readonly responses: ResponsesClient;

  constructor(options: OpenAIProviderOptions) {
    this.modelId = options.modelId.trim();
    this.promptBundleVersion = options.promptBundleVersion;
    if (!options.apiKey.trim() || !this.modelId) {
      throw new Error("OpenAI sağlayıcı yapılandırması eksik.");
    }
    this.responses =
      options.responsesClient ??
      (new OpenAI({
        apiKey: options.apiKey,
        timeout: options.timeoutMs ?? DEFAULT_OPENAI_TIMEOUT_MS,
        maxRetries: options.maxRetries ?? 2,
      }).responses as unknown as ResponsesClient);
  }

  private async request<T>(
    instructions: string,
    input: unknown,
    schema: ZodType<T>,
    schemaName: string,
  ): Promise<T> {
    try {
      const response = await this.responses.parse<T>({
        model: this.modelId,
        instructions,
        input: JSON.stringify(input),
        store: false,
        text: { format: zodTextFormat(schema, schemaName) },
      });
      if (response.status === "incomplete") {
        throw new AIProviderError(
          "INCOMPLETE_RESPONSE",
          "Yapay zekâ yanıtı tamamlanmadan kesildi.",
          true,
        );
      }
      if (response.status === "failed") {
        throw new AIProviderError(
          "NETWORK_ERROR",
          "Yapay zekâ sağlayıcısı yanıtı tamamlayamadı.",
          true,
        );
      }
      if (hasRefusal(response)) {
        throw new AIProviderError("REFUSAL", "Yapay zekâ sağlayıcısı isteği yanıtlamadı.");
      }
      if (!response.output_parsed) {
        throw new AIProviderError(
          "STRUCTURED_OUTPUT_PARSE_FAILED",
          "Yapay zekâ yapılandırılmış çıktısı ayrıştırılamadı.",
        );
      }
      return schema.parse(response.output_parsed);
    } catch (error) {
      return mapProviderError(error);
    }
  }

  async analyzeSectionContent(input: SectionContentAnalysisInput): Promise<AISectionContentOutput> {
    const prompts = getSemanticPromptBundle(this.promptBundleVersion);
    return this.request(
      prompts.sectionContentInstructions,
      input,
      AISectionContentOutputSchema,
      "section_content_result",
    );
  }

  async analyzeCategoryFit(input: CategoryFitAnalysisInput): Promise<AICategoryFitOutput> {
    const prompts = getSemanticPromptBundle(this.promptBundleVersion);
    return this.request(
      prompts.categoryFitInstructions,
      input,
      AICategoryFitOutputSchema,
      "category_fit_result",
    );
  }
}
