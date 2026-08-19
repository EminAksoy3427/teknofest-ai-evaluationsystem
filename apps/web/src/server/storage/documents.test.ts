import { describe, expect, it, vi } from "vitest";

import { documentStorage } from "./documents";

describe("private submission document storage boundary", () => {
  it("writes exact bytes with PDF HTTP metadata", async () => {
    const bytes = new TextEncoder().encode("%PDF-synthetic");
    const put = vi.fn(async () => ({ etag: "etag-a" }) as R2Object);
    const bucket = { put } as unknown as R2Bucket;

    await expect(
      documentStorage.putSubmissionReport(bucket, "server-owned/report.pdf", bytes),
    ).resolves.toEqual({ etag: "etag-a" });
    expect(put).toHaveBeenCalledWith("server-owned/report.pdf", bytes, {
      httpMetadata: { contentType: "application/pdf" },
    });
  });

  it("delegates private reads, heads, and deletes only through the binding", async () => {
    const object = { etag: "etag-a" } as R2ObjectBody;
    const get = vi.fn(async () => object);
    const head = vi.fn(async () => object as R2Object);
    const remove = vi.fn(async () => undefined);
    const bucket = { get, head, delete: remove } as unknown as R2Bucket;

    await expect(documentStorage.getSubmissionReport(bucket, "key-a")).resolves.toBe(object);
    await expect(documentStorage.headSubmissionReport(bucket, "key-a")).resolves.toBe(object);
    await expect(documentStorage.deleteSubmissionReport(bucket, "key-a")).resolves.toBeUndefined();
    expect(get).toHaveBeenCalledWith("key-a");
    expect(head).toHaveBeenCalledWith("key-a");
    expect(remove).toHaveBeenCalledWith("key-a");
  });
});
