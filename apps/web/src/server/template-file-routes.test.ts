import { ApiErrorResponseSchema, TemplateVersionResponseSchema } from "@teknofest-ai/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createFullTestApp, type FullTestApp } from "./test-fixtures/full-app";
import type { LocalD1 } from "./test-fixtures/local-d1";
import {
  createMemoryDocumentStorage,
  type MemoryDocumentStorage,
} from "./test-fixtures/memory-document-storage";
import { createP65World, P65 } from "./test-fixtures/p65a-world-seed";
import { createSyntheticTextPdf } from "./test-fixtures/synthetic-pdf";

// The app is composed with the REAL repositories, the REAL membership lookup and a REAL
// read-your-writes in-memory R2 stand-in, so every authorization decision, every storage-key
// choice and every activation gate asserted below is the production decision.

let local: LocalD1;
let memory: MemoryDocumentStorage;
let harness: FullTestApp;

const TEMPLATE_PDF_WITH_HEADINGS = createSyntheticTextPdf(["Proje Özeti\n\nYöntem\n\nMetin"]);
const TEMPLATE_PDF_MISSING_METHOD = createSyntheticTextPdf(["Proje Özeti\n\nMetin"]);
const NON_PDF_BYTES = new TextEncoder().encode("not a pdf");
const SPOOFED_MIME_BYTES = new TextEncoder().encode("<html>fake</html>");

beforeEach(() => {
  local = createP65World();
  memory = createMemoryDocumentStorage();
  harness = createFullTestApp(local, memory.storage);
});

afterEach(() => {
  local.close();
});

async function createDraftTemplate(competitionId: string, label = "Taslak") {
  const response = await harness.request(
    P65.manager,
    `/api/v1/competitions/${competitionId}/templates`,
    {
      method: "POST",
      body: {
        label,
        structuralProfile: {
          expectedLanguage: "tr",
          sections: [
            { key: "summary", title: "Proje Özeti", description: "", required: true, order: 1 },
            { key: "method", title: "Yöntem", description: "", required: true, order: 2 },
          ],
        },
      },
    },
  );
  expect(response.status).toBe(201);
  return TemplateVersionResponseSchema.parse(await response.json());
}

function filePath(competitionId: string, templateVersionId: string) {
  return `/api/v1/competitions/${competitionId}/templates/${templateVersionId}/file`;
}

async function uploadFile(
  userId: string | null,
  competitionId: string,
  templateVersionId: string,
  bytes: Uint8Array,
  headers: Record<string, string> = { "content-type": "application/pdf" },
) {
  return harness.request(userId, filePath(competitionId, templateVersionId), {
    method: "PUT",
    rawBody: bytes,
    headers,
  });
}

describe("official template file: upload authorization", () => {
  it("rejects an unauthenticated upload", async () => {
    const draft = await createDraftTemplate(P65.competitionA);
    const response = await uploadFile(null, P65.competitionA, draft.id, TEMPLATE_PDF_WITH_HEADINGS);
    expect(response.status).toBe(401);
  });

  it("denies a reviewer", async () => {
    const draft = await createDraftTemplate(P65.competitionA);
    const response = await uploadFile(
      P65.reviewerOne,
      P65.competitionA,
      draft.id,
      TEMPLATE_PDF_WITH_HEADINGS,
    );
    expect(response.status).toBe(403);
  });

  it("denies a contestant", async () => {
    const draft = await createDraftTemplate(P65.competitionA);
    const response = await uploadFile(
      P65.contestantOne,
      P65.competitionA,
      draft.id,
      TEMPLATE_PDF_WITH_HEADINGS,
    );
    expect(response.status).toBe(403);
  });

  it("denies an evaluation manager", async () => {
    const draft = await createDraftTemplate(P65.competitionA);
    const response = await uploadFile(
      P65.evaluationManager,
      P65.competitionA,
      draft.id,
      TEMPLATE_PDF_WITH_HEADINGS,
    );
    expect(response.status).toBe(403);
  });

  it("does not let a manager of another competition mutate this template", async () => {
    const draft = await createDraftTemplate(P65.competitionA);
    const response = await uploadFile(
      P65.foreignManager,
      P65.competitionA,
      draft.id,
      TEMPLATE_PDF_WITH_HEADINGS,
    );
    expect(response.status).toBe(403);
  });
});

describe("official template file: upload validation", () => {
  it("rejects a non-PDF body", async () => {
    const draft = await createDraftTemplate(P65.competitionA);
    const response = await uploadFile(P65.manager, P65.competitionA, draft.id, NON_PDF_BYTES);
    expect(response.status).toBe(400);
  });

  it("rejects a spoofed body even with an application/pdf content-type header", async () => {
    const draft = await createDraftTemplate(P65.competitionA);
    const response = await uploadFile(P65.manager, P65.competitionA, draft.id, SPOOFED_MIME_BYTES, {
      "content-type": "application/pdf",
    });
    expect(response.status).toBe(400);
    expect(ApiErrorResponseSchema.parse(await response.json()).code).toBe("VALIDATION_ERROR");
  });

  it("rejects an oversized declared Content-Length before reading the body", async () => {
    const draft = await createDraftTemplate(P65.competitionA);
    const response = await harness.request(P65.manager, filePath(P65.competitionA, draft.id), {
      method: "PUT",
      rawBody: TEMPLATE_PDF_WITH_HEADINGS,
      headers: {
        "content-type": "application/pdf",
        "content-length": String(30 * 1024 * 1024),
      },
    });
    expect(response.status).toBe(413);
  });

  it("computes the SHA-256 server-side regardless of what the client would have claimed", async () => {
    const draft = await createDraftTemplate(P65.competitionA);
    const response = await uploadFile(
      P65.manager,
      P65.competitionA,
      draft.id,
      TEMPLATE_PDF_WITH_HEADINGS,
    );
    expect(response.status).toBe(200);
    const updated = TemplateVersionResponseSchema.parse(await response.json());
    expect(updated.file?.sha256).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("official template file: storage key and privacy", () => {
  it("never exposes the R2 storage key in the normal API response", async () => {
    const draft = await createDraftTemplate(P65.competitionA);
    const response = await uploadFile(
      P65.manager,
      P65.competitionA,
      draft.id,
      TEMPLATE_PDF_WITH_HEADINGS,
    );
    const body = await response.text();
    // The response legitimately carries the display filename ("sablon.pdf") but never the R2
    // object path, which always has this exact shape.
    expect(body).not.toContain("competitions/");
    expect(body).not.toContain("template-versions/");
    expect(body).not.toMatch(/\/template\.pdf/);
  });

  it("generates a fresh, server-only storage key rather than accepting a client-controlled one", async () => {
    const draft = await createDraftTemplate(P65.competitionA);
    await uploadFile(P65.manager, P65.competitionA, draft.id, TEMPLATE_PDF_WITH_HEADINGS);
    expect(memory.putKeys).toHaveLength(1);
    expect(memory.putKeys[0]).toContain(P65.competitionA);
    expect(memory.putKeys[0]).toContain(draft.id);
  });

  it("is not publicly addressable: only the protected route can read it back", async () => {
    const draft = await createDraftTemplate(P65.competitionA);
    await uploadFile(P65.manager, P65.competitionA, draft.id, TEMPLATE_PDF_WITH_HEADINGS);
    const unauthenticated = await harness.request(null, filePath(P65.competitionA, draft.id));
    expect(unauthenticated.status).toBe(401);
    const asReviewer = await harness.request(P65.reviewerOne, filePath(P65.competitionA, draft.id));
    expect(asReviewer.status).toBe(403);
  });

  it("streams the stored bytes back to the manager on GET", async () => {
    const draft = await createDraftTemplate(P65.competitionA);
    await uploadFile(P65.manager, P65.competitionA, draft.id, TEMPLATE_PDF_WITH_HEADINGS);
    const response = await harness.request(P65.manager, filePath(P65.competitionA, draft.id));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(bytes).toEqual(TEMPLATE_PDF_WITH_HEADINGS);
  });
});

describe("official template file: replace semantics", () => {
  it("keeps the old object until the new metadata write succeeds, then deletes only the old one", async () => {
    const draft = await createDraftTemplate(P65.competitionA);
    const first = await uploadFile(
      P65.manager,
      P65.competitionA,
      draft.id,
      TEMPLATE_PDF_WITH_HEADINGS,
    );
    const firstTemplate = TemplateVersionResponseSchema.parse(await first.json());
    expect(memory.objects.size).toBe(1);

    const second = await uploadFile(
      P65.manager,
      P65.competitionA,
      draft.id,
      TEMPLATE_PDF_MISSING_METHOD,
    );
    expect(second.status).toBe(200);
    const secondTemplate = TemplateVersionResponseSchema.parse(await second.json());

    // A fresh key was used for the replacement, the old key is gone, and exactly one object
    // remains: the new one.
    expect(memory.putKeys).toHaveLength(2);
    expect(memory.putKeys[0]).not.toBe(memory.putKeys[1]);
    expect(memory.deletedKeys).toHaveLength(1);
    expect(memory.objects.size).toBe(1);
    expect(secondTemplate.file?.sha256).not.toBe(firstTemplate.file?.sha256);
  });

  it("denies replacing a template's file once it is not DRAFT", async () => {
    // template A1 in the seed is already ACTIVE with a file.
    const response = await uploadFile(
      P65.manager,
      P65.competitionA,
      P65.templateA1,
      TEMPLATE_PDF_WITH_HEADINGS,
    );
    expect(response.status).toBe(409);
  });
});

describe("activation requires the official file and its headings", () => {
  it("rejects activation when no file has been uploaded yet", async () => {
    const draft = await createDraftTemplate(P65.competitionA);
    const response = await harness.request(
      P65.manager,
      `/api/v1/competitions/${P65.competitionA}/templates/${draft.id}/activate`,
      { method: "POST" },
    );
    expect(response.status).toBe(409);
  });

  it("rejects activation when the official file is missing a configured required heading", async () => {
    const draft = await createDraftTemplate(P65.competitionA);
    await uploadFile(P65.manager, P65.competitionA, draft.id, TEMPLATE_PDF_MISSING_METHOD);
    const response = await harness.request(
      P65.manager,
      `/api/v1/competitions/${P65.competitionA}/templates/${draft.id}/activate`,
      { method: "POST" },
    );
    expect(response.status).toBe(400);
    const body = ApiErrorResponseSchema.parse(await response.json());
    expect(body.message).toContain("Yöntem");
  });

  it("activates once the file and the configured headings both match, retiring the prior ACTIVE version", async () => {
    const draft = await createDraftTemplate(P65.competitionA);
    await uploadFile(P65.manager, P65.competitionA, draft.id, TEMPLATE_PDF_WITH_HEADINGS);
    const response = await harness.request(
      P65.manager,
      `/api/v1/competitions/${P65.competitionA}/templates/${draft.id}/activate`,
      { method: "POST" },
    );
    expect(response.status).toBe(200);
    const activated = TemplateVersionResponseSchema.parse(await response.json());
    expect(activated.status).toBe("ACTIVE");
    expect(activated.file).not.toBeNull();

    const previouslyActive = local.query(
      "SELECT status FROM template_version WHERE id = ?",
      P65.templateA1,
    ) as { status: string }[];
    expect(previouslyActive[0]?.status).toBe("RETIRED");
  });

  it("RETIRED templates remain immutable: the file cannot be replaced after retirement", async () => {
    const draft = await createDraftTemplate(P65.competitionA);
    await uploadFile(P65.manager, P65.competitionA, draft.id, TEMPLATE_PDF_WITH_HEADINGS);
    await harness.request(
      P65.manager,
      `/api/v1/competitions/${P65.competitionA}/templates/${draft.id}/activate`,
      { method: "POST" },
    );
    // template A1 was retired by the activation above.
    const response = await uploadFile(
      P65.manager,
      P65.competitionA,
      P65.templateA1,
      TEMPLATE_PDF_WITH_HEADINGS,
    );
    expect(response.status).toBe(409);
  });
});
