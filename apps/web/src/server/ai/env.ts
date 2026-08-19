export interface AIBindings {
  OPENAI_API_KEY: string;
  OPENAI_MODEL: string;
}

export interface AIConfiguration {
  provider: "OPENAI";
  apiKey: string;
  modelId: string;
}

export function readAIConfiguration(environment: Partial<AIBindings>): AIConfiguration {
  const apiKey = environment.OPENAI_API_KEY?.trim() ?? "";
  const modelId = environment.OPENAI_MODEL?.trim() ?? "";
  if (!apiKey || apiKey === "replace_me") {
    throw new Error("OPENAI_API_KEY yapılandırması eksik.");
  }
  if (modelId.length > 200 || !/^gpt-5(?:[.-]|$)/i.test(modelId)) {
    throw new Error("OPENAI_MODEL bir GPT-5 ailesi model kimliği olmalıdır.");
  }
  return { provider: "OPENAI", apiKey, modelId };
}
