import { CompetitionResponseSchema } from "@teknofest-ai/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import { apiRequest, ClientApiError } from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("client API boundary", () => {
  it("parses a successful response with the shared runtime contract", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          id: "competition-a",
          name: "Yarışma A",
          slug: "yarisma-a",
          description: "Açıklama",
          createdAt: 1,
          updatedAt: 1,
        }),
      ),
    );

    await expect(
      apiRequest("/api/v1/competitions/competition-a", CompetitionResponseSchema),
    ).resolves.toMatchObject({
      id: "competition-a",
      slug: "yarisma-a",
    });
  });

  it("surfaces a forbidden product state without exposing internals", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { code: "FORBIDDEN", message: "Bu yarışma için erişim yetkiniz yok." },
          { status: 403 },
        ),
      ),
    );

    const promise = apiRequest("/api/v1/competitions/competition-b", CompetitionResponseSchema);

    await expect(promise).rejects.toBeInstanceOf(ClientApiError);
    await expect(promise).rejects.toMatchObject({
      status: 403,
      payload: { code: "FORBIDDEN" },
    });
  });

  it("rejects an invalid successful payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ id: "incomplete" })),
    );

    await expect(
      apiRequest("/api/v1/competitions/incomplete", CompetitionResponseSchema),
    ).rejects.toThrow();
  });
});
