import { APIConnectionTimeoutError, RateLimitError } from "openai";
import { describe, expect, it, vi } from "vitest";

import { OpenAIProvider } from "./openai";

function provider(parse: (body: unknown) => Promise<unknown>) {
  return new OpenAIProvider({
    apiKey: "synthetic-test-key",
    modelId: "gpt-5-test",
    promptBundleVersion: "semantic-checks/v1",
    responsesClient: { parse } as never,
  });
}

/** Rubric evaluation only exists in the v2 bundle; v1 runs stay rubric-free by construction. */
function rubricProvider(parse: (body: unknown) => Promise<unknown>) {
  return new OpenAIProvider({
    apiKey: "synthetic-test-key",
    modelId: "gpt-5-test",
    promptBundleVersion: "semantic-checks/v2",
    responsesClient: { parse } as never,
  });
}

const sectionOutput = {
  sections: [
    {
      sectionKey: "problem",
      assessment: "SUPPORTED",
      reason: "Beklenen problem bilgisi mevcut.",
      evidenceStrength: "HIGH",
      evidence: [{ page: 2, excerpt: "Hedef kullanıcılar öğrenciler." }],
      missingExpectations: [],
    },
  ],
};

describe("OpenAI Responses provider", () => {
  it("pins the configured model, disables storage and tools, and enables strict Structured Outputs", async () => {
    const parse = vi.fn(async (_body: unknown) => ({
      status: "completed",
      output_parsed: sectionOutput,
      output: [],
    }));
    const result = await provider(parse).analyzeSectionContent({
      sections: [
        {
          sectionKey: "problem",
          title: "Problem",
          description: "Problemi açıklar.",
          required: true,
          sourceCoverage: "FULL",
          pages: [{ page: 2, text: "Hedef kullanıcılar öğrenciler." }],
        },
      ],
    });
    expect(result).toEqual(sectionOutput);
    const request = parse.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(request.model).toBe("gpt-5-test");
    expect(request.store).toBe(false);
    expect(request).not.toHaveProperty("tools");
    expect(request).not.toHaveProperty("previous_response_id");
    expect(request).not.toHaveProperty("background");
    expect(request.text).toMatchObject({
      format: { type: "json_schema", strict: true },
    });
    expect(String(request.instructions)).toContain("güvenilmeyen VERİDİR");
    expect(JSON.stringify(request)).not.toContain("synthetic-test-key");
  });

  it.each([
    [
      "refusal",
      { status: "completed", output_parsed: null, output: [{ content: [{ type: "refusal" }] }] },
      "REFUSAL",
    ],
    [
      "incomplete",
      { status: "incomplete", output_parsed: null, output: [] },
      "INCOMPLETE_RESPONSE",
    ],
    [
      "missing parsed output",
      { status: "completed", output_parsed: null, output: [] },
      "STRUCTURED_OUTPUT_PARSE_FAILED",
    ],
    ["failed response", { status: "failed", output_parsed: null, output: [] }, "NETWORK_ERROR"],
  ])("maps %s safely", async (_name, response, code) => {
    await expect(
      provider(async () => response).analyzeSectionContent({ sections: [] }),
    ).rejects.toMatchObject({
      code,
    });
  });

  it("rejects output that fails application Zod validation", async () => {
    await expect(
      provider(async () => ({
        status: "completed",
        output_parsed: { sections: [{ ...sectionOutput.sections[0], assessment: "CERTAIN" }] },
        output: [],
      })).analyzeSectionContent({ sections: [] }),
    ).rejects.toMatchObject({ code: "OUTPUT_VALIDATION_FAILED" });
  });

  it.each([
    [Object.create(APIConnectionTimeoutError.prototype), "TIMEOUT", true],
    [Object.create(RateLimitError.prototype), "RATE_LIMITED", true],
    [new Error("secret provider response body"), "NETWORK_ERROR", true],
  ])("maps provider failures without leaking raw bodies", async (failure, code, retryable) => {
    const request = provider(async () => {
      throw failure;
    }).analyzeSectionContent({ sections: [] });
    await expect(request).rejects.toMatchObject({ code, retryable });
    await expect(request).rejects.not.toThrow("secret provider response body");
  });

  it("sends each pinned criterion's authoritative maxScore as rubric input context", async () => {
    // Without maxScore the model cannot know whether a criterion is scored out of 5, 10 or 20, so
    // its suggestedScore would be meaningless. The scale must reach the provider as input.
    const parse = vi.fn(async (_body: unknown) => ({
      status: "completed",
      output_parsed: { criteria: [] },
      output: [],
    }));
    await rubricProvider(parse).evaluateRubric({
      criteria: [
        {
          code: "quality",
          title: "Kalite",
          description: "Teknik kalite.",
          evidenceExpectation: "Ölçüm sonucu.",
          maxScore: 5,
        },
        {
          code: "impact",
          title: "Etki",
          description: "Toplumsal etki.",
          evidenceExpectation: "Etki verisi.",
          maxScore: 20,
        },
      ],
      sourceCoverage: "FULL",
      pages: [{ page: 1, text: "Sentetik rapor." }],
    });
    const request = parse.mock.calls[0]?.[0] as Record<string, unknown>;
    const sent = JSON.parse(String(request.input)) as {
      criteria: Array<{ code: string; maxScore: number }>;
    };
    expect(sent.criteria.map((criterion) => [criterion.code, criterion.maxScore])).toEqual([
      ["quality", 5],
      ["impact", 20],
    ]);
    expect(request.store).toBe(false);
    expect(request.tools).toBeUndefined();
  });

  it("rejects a rubric output that echoes or redefines maxScore, keeping the scale server-side", async () => {
    // Seeing the scale is not the same as defining it: `maxScore` is absent from the strict output
    // schema, so a model that tries to hand one back is rejected instead of trusted.
    const request = rubricProvider(async () => ({
      status: "completed",
      output_parsed: {
        criteria: [
          {
            criterionCode: "quality",
            suggestedScore: 5,
            maxScore: 999,
            reason: "Ölçeği yeniden tanımlama denemesi.",
            evidenceStrength: "HIGH",
            evidence: [],
            missingPoints: [],
          },
        ],
      },
      output: [],
    })).evaluateRubric({
      criteria: [
        {
          code: "quality",
          title: "Kalite",
          description: "Teknik kalite.",
          evidenceExpectation: "",
          maxScore: 5,
        },
      ],
      sourceCoverage: "FULL",
      pages: [{ page: 1, text: "Sentetik rapor." }],
    });
    await expect(request).rejects.toMatchObject({ code: "OUTPUT_VALIDATION_FAILED" });
  });

  it("refuses rubric evaluation when the run pinned a prompt bundle without rubric instructions", async () => {
    await expect(
      provider(async () => ({
        status: "completed",
        output_parsed: { criteria: [] },
        output: [],
      })).evaluateRubric({ criteria: [], sourceCoverage: "FULL", pages: [] }),
    ).rejects.toMatchObject({ code: "OUTPUT_VALIDATION_FAILED" });
  });

  it("uses the category-fit schema independently", async () => {
    const output = {
      assessment: "REVIEW",
      reason: "Kanıt sınırlı.",
      evidenceStrength: "LOW",
      evidence: [],
      alignmentSignals: [],
      mismatchSignals: [],
    };
    await expect(
      provider(async () => ({
        status: "completed",
        output_parsed: output,
        output: [],
      })).analyzeCategoryFit({
        category: {
          id: "category-a",
          name: "Yapay Zekâ",
          code: "yapay-zeka",
          description: "Yapay zekâ projeleri.",
          guidance: "Sentetik kapsam.",
        },
        projectTitle: "Sentetik proje",
        sourceCoverage: "FULL",
        pages: [{ page: 1, text: "Sentetik rapor." }],
      }),
    ).resolves.toEqual(output);
  });
});
