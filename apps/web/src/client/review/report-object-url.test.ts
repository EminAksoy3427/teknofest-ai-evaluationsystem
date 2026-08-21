import { describe, expect, it, vi } from "vitest";

import { loadReportObjectUrl } from "./report-object-url";

function fakeUrlApi() {
  let counter = 0;
  const revoked: string[] = [];
  return {
    revoked,
    api: {
      createObjectURL: vi.fn(() => `blob:fake-${counter++}`),
      revokeObjectURL: vi.fn((url: string) => revoked.push(url)),
    },
  };
}

function okResponse(blob: unknown) {
  return { ok: true, blob: () => Promise.resolve(blob) } as unknown as Response;
}

describe("report object URL lifecycle", () => {
  it("creates one object URL from the fetched blob and hands it to the caller", async () => {
    const { api } = fakeUrlApi();
    const blob = { synthetic: "pdf-bytes" };
    const onUrl = vi.fn();
    const fetchImpl = vi.fn().mockResolvedValue(okResponse(blob));

    loadReportObjectUrl("/report", { onUrl, onError: vi.fn() }, api, fetchImpl);
    await vi.waitFor(() => expect(onUrl).toHaveBeenCalledTimes(1));

    expect(fetchImpl).toHaveBeenCalledWith("/report");
    expect(api.createObjectURL).toHaveBeenCalledWith(blob);
    expect(onUrl).toHaveBeenCalledWith("blob:fake-0");
  });

  it("revokes the created URL on teardown, and never before then", async () => {
    const { api, revoked } = fakeUrlApi();
    const fetchImpl = vi.fn().mockResolvedValue(okResponse({}));
    const onUrl = vi.fn();

    const teardown = loadReportObjectUrl("/report", { onUrl, onError: vi.fn() }, api, fetchImpl);
    await vi.waitFor(() => expect(onUrl).toHaveBeenCalledTimes(1));

    // Not revoked while the viewer is still using it.
    expect(api.revokeObjectURL).not.toHaveBeenCalled();

    teardown();
    expect(revoked).toEqual(["blob:fake-0"]);
  });

  it("never creates a URL for a response that arrives after teardown (component unmounted / path replaced)", async () => {
    const { api } = fakeUrlApi();
    let resolveBlob: (response: Response) => void = () => undefined;
    const fetchImpl = vi.fn().mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveBlob = resolve;
      }),
    );
    const onUrl = vi.fn();

    const teardown = loadReportObjectUrl("/report", { onUrl, onError: vi.fn() }, api, fetchImpl);
    // The report is replaced (or the component unmounts) before the fetch resolves.
    teardown();

    resolveBlob(okResponse({}));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(api.createObjectURL).not.toHaveBeenCalled();
    expect(api.revokeObjectURL).not.toHaveBeenCalled();
    expect(onUrl).not.toHaveBeenCalled();
  });

  it("revokes the old URL and creates an independent new one when the report is replaced", async () => {
    const { api, revoked } = fakeUrlApi();
    const firstFetch = vi.fn().mockResolvedValue(okResponse({ first: true }));
    const onUrlA = vi.fn();
    const teardownA = loadReportObjectUrl(
      "/report-a",
      { onUrl: onUrlA, onError: vi.fn() },
      api,
      firstFetch,
    );
    await vi.waitFor(() => expect(onUrlA).toHaveBeenCalledTimes(1));

    // React's effect cleanup runs before the next effect body when `reportPath` changes.
    teardownA();
    expect(revoked).toEqual(["blob:fake-0"]);

    const secondFetch = vi.fn().mockResolvedValue(okResponse({ second: true }));
    const onUrlB = vi.fn();
    loadReportObjectUrl("/report-b", { onUrl: onUrlB, onError: vi.fn() }, api, secondFetch);
    await vi.waitFor(() => expect(onUrlB).toHaveBeenCalledTimes(1));

    expect(onUrlB).toHaveBeenCalledWith("blob:fake-1");
    expect(secondFetch).toHaveBeenCalledWith("/report-b");
  });

  it("reports an error and creates no URL when the fetch itself fails", async () => {
    const { api } = fakeUrlApi();
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ağ hatası"));
    const onError = vi.fn();

    loadReportObjectUrl("/report", { onUrl: vi.fn(), onError }, api, fetchImpl);
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));

    expect(onError).toHaveBeenCalledWith("ağ hatası");
    expect(api.createObjectURL).not.toHaveBeenCalled();
  });

  it("does not report an error for a fetch that fails after teardown", async () => {
    const { api } = fakeUrlApi();
    let rejectFetch: (error: Error) => void = () => undefined;
    const fetchImpl = vi.fn().mockReturnValue(
      new Promise<Response>((_, reject) => {
        rejectFetch = reject;
      }),
    );
    const onError = vi.fn();

    const teardown = loadReportObjectUrl("/report", { onUrl: vi.fn(), onError }, api, fetchImpl);
    teardown();
    rejectFetch(new Error("çok geç"));
    await Promise.resolve();
    await Promise.resolve();

    expect(onError).not.toHaveBeenCalled();
  });
});
