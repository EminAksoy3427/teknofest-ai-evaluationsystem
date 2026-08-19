import { type SubmissionRepository, SubmissionRepositoryError } from "@teknofest-ai/db";
import {
  ApiErrorResponseSchema,
  MAX_SUBMISSION_PDF_BYTES,
  SubmissionListResponseSchema,
  SubmissionResponseSchema,
} from "@teknofest-ai/shared";
import { describe, expect, it, vi } from "vitest";

import type { AuthRuntimeBindings } from "./auth/auth";
import { createApp } from "./index";
import type { DocumentStorage } from "./storage/documents";

const environment = {
  DB: {} as D1Database,
  DOCUMENTS: {} as R2Bucket,
} as AuthRuntimeBindings;
const pdfBytes = new TextEncoder().encode("%PDF-1.4\nsynthetic test report\n%%EOF");
const now = 1_787_000_000_000;

const submission = {
  id: "submission-a",
  competitionId: "competition-a",
  applicationCode: "APP-001",
  projectTitle: "Sentetik Proje",
  category: { id: "category-a", code: "ai", name: "Yapay Zekâ" },
  file: {
    id: "file-a",
    originalFilename: "rapor.pdf",
    mimeType: "application/pdf" as const,
    sizeBytes: pdfBytes.byteLength,
    sha256: "a".repeat(64),
    createdAt: now,
  },
  exactDuplicate: false,
  matchingSubmissionCount: 0,
  createdAt: now,
  updatedAt: now,
};

function repositoryStub(overrides: Partial<SubmissionRepository> = {}): SubmissionRepository {
  return {
    categoryBelongsToCompetition: async (_binding, competitionId, categoryId) =>
      competitionId === "competition-a" && categoryId === "category-a",
    countCompetitionFilesBySha256: async () => 0,
    createSubmissionWithFileMetadata: async () => undefined,
    getCompetitionSubmission: async (_binding, competitionId, submissionId) =>
      competitionId === "competition-a" && submissionId === "submission-a" ? submission : null,
    getCompetitionSubmissionFileMetadata: async (_binding, competitionId, submissionId) =>
      competitionId === "competition-a" && submissionId === "submission-a"
        ? {
            id: "file-a",
            submissionId: "submission-a",
            competitionId: "competition-a",
            storageKey: "competitions/competition-a/submissions/submission-a/file-a/report.pdf",
            originalFilename: "rapor.pdf",
            mimeType: "application/pdf",
            sizeBytes: pdfBytes.byteLength,
            sha256: "a".repeat(64),
            etag: "etag-a",
          }
        : null,
    listCompetitionSubmissions: async (_binding, competitionId) =>
      competitionId === "competition-a" ? [submission] : [],
    ...overrides,
  };
}

function r2Object(bytes = pdfBytes): R2ObjectBody {
  return {
    body: new Blob([bytes]).stream(),
    size: bytes.byteLength,
    httpEtag: '"etag-a"',
  } as R2ObjectBody;
}

function storageStub(overrides: Partial<DocumentStorage> = {}): DocumentStorage {
  return {
    putSubmissionReport: async () => ({ etag: "etag-a" }),
    getSubmissionReport: async () => r2Object(),
    deleteSubmissionReport: async () => undefined,
    headSubmissionReport: async () => null,
    putDocumentArtifact: async () => ({ etag: "artifact-etag" }),
    getDocumentArtifact: async () => null,
    headDocumentArtifact: async () => null,
    ...overrides,
  };
}

type Role = "COMPETITION_MANAGER" | "EVALUATION_MANAGER" | "REVIEWER" | "CONTESTANT";

function authenticatedApp(
  role: Role,
  repository: SubmissionRepository = repositoryStub(),
  storage: DocumentStorage = storageStub(),
) {
  return createApp({
    resolveSession: async () => ({
      user: { id: "user-a", name: "Kullanıcı", email: "user-a@example.com", image: null },
    }),
    findMembership: async (_binding, userId, competitionId) =>
      userId === "user-a" && competitionId === "competition-a"
        ? { userId, competitionId, role }
        : null,
    submissionRepository: repository,
    documentStorage: storage,
  });
}

function formData(
  options: {
    bytes?: Uint8Array;
    filename?: string;
    mimeType?: string;
    applicationCode?: string;
    categoryId?: string;
    includeClientSecurityState?: boolean;
  } = {},
) {
  const data = new FormData();
  const sourceBytes = options.bytes ?? pdfBytes;
  const fileBytes = new Uint8Array(new ArrayBuffer(sourceBytes.byteLength));
  fileBytes.set(sourceBytes);
  data.set("applicationCode", options.applicationCode ?? "APP-001");
  data.set("projectTitle", "Sentetik Proje");
  data.set("categoryId", options.categoryId ?? "category-a");
  data.set(
    "report",
    new File([fileBytes.buffer], options.filename ?? "rapor.pdf", {
      type: options.mimeType ?? "application/pdf",
    }),
  );
  if (options.includeClientSecurityState) {
    data.set("sha256", "0".repeat(64));
    data.set("storageKey", "attacker/chosen.pdf");
    data.set("sizeBytes", "1");
  }
  return data;
}

function upload(
  application: ReturnType<typeof createApp>,
  data = formData(),
  competitionId = "competition-a",
) {
  return application.request(
    `http://localhost/api/v1/competitions/${competitionId}/submissions`,
    { method: "POST", body: data },
    environment,
  );
}

describe("submission upload authorization", () => {
  it("rejects unauthenticated uploads", async () => {
    const response = await upload(createApp());
    expect(response.status).toBe(401);
  });

  it.each(["REVIEWER", "EVALUATION_MANAGER", "CONTESTANT"] as const)(
    "rejects the %s role",
    async (role) => {
      const response = await upload(authenticatedApp(role));
      expect(response.status).toBe(403);
    },
  );

  it("does not let a manager of Competition A upload to Competition B", async () => {
    const response = await upload(
      authenticatedApp("COMPETITION_MANAGER"),
      formData(),
      "competition-b",
    );
    expect(response.status).toBe(403);
  });
});

describe("submission file security", () => {
  it("stores a validated PDF under a server-owned key and computes file facts", async () => {
    const put = vi.fn<DocumentStorage["putSubmissionReport"]>(async () => ({ etag: "etag-a" }));
    const create = vi.fn<SubmissionRepository["createSubmissionWithFileMetadata"]>(
      async () => undefined,
    );
    const created = { ...submission, id: "generated-submission" };
    const repository = repositoryStub({
      createSubmissionWithFileMetadata: create,
      getCompetitionSubmission: async (_binding, _competitionId, submissionId) => ({
        ...created,
        id: submissionId,
      }),
    });
    const response = await upload(
      authenticatedApp(
        "COMPETITION_MANAGER",
        repository,
        storageStub({ putSubmissionReport: put }),
      ),
      formData({
        filename: "../../secret.pdf",
        includeClientSecurityState: true,
      }),
    );

    expect(response.status).toBe(201);
    const payload = SubmissionResponseSchema.parse(await response.json());
    expect(payload).not.toHaveProperty("storageKey");
    expect(payload.file).not.toHaveProperty("storageKey");
    expect(put).toHaveBeenCalledOnce();
    const storageKey = put.mock.calls[0]?.[1];
    expect(storageKey).toMatch(
      /^competitions\/competition-a\/submissions\/[0-9a-f-]+\/[0-9a-f-]+\/report\.pdf$/,
    );
    expect(storageKey).not.toContain("secret");
    const persisted = create.mock.calls[0]?.[1];
    expect(persisted?.originalFilename).toBe("secret.pdf");
    expect(persisted?.sizeBytes).toBe(pdfBytes.byteLength);
    expect(persisted?.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(persisted?.sha256).not.toBe("0".repeat(64));
    expect(persisted?.storageKey).toBe(storageKey);
  });

  it("removes control characters from the display filename", async () => {
    const create = vi.fn<SubmissionRepository["createSubmissionWithFileMetadata"]>(
      async () => undefined,
    );
    const repository = repositoryStub({
      createSubmissionWithFileMetadata: create,
      getCompetitionSubmission: async (_binding, _competitionId, submissionId) => ({
        ...submission,
        id: submissionId,
      }),
    });
    const response = await upload(
      authenticatedApp("COMPETITION_MANAGER", repository),
      formData({ filename: "report.pdf\r\nContent-Type:text/html" }),
    );
    expect(response.status).toBe(201);
    const normalized = create.mock.calls[0]?.[1]?.originalFilename;
    expect(normalized).toBe("html");
    expect(normalized).not.toMatch(/[\r\n]/);
  });

  it("rejects a wrong declared MIME type", async () => {
    const response = await upload(
      authenticatedApp("COMPETITION_MANAGER"),
      formData({ mimeType: "application/octet-stream" }),
    );
    expect(response.status).toBe(415);
    expect(ApiErrorResponseSchema.parse(await response.json()).code).toBe("UNSUPPORTED_MEDIA_TYPE");
  });

  it("rejects .pdf filenames whose bytes lack the PDF signature", async () => {
    const response = await upload(
      authenticatedApp("COMPETITION_MANAGER"),
      formData({ bytes: new TextEncoder().encode("not a pdf"), filename: "fake.pdf" }),
    );
    expect(response.status).toBe(400);
  });

  it("accepts valid PDF bytes with a non-PDF extension because MIME and signature are authoritative", async () => {
    const repository = repositoryStub({
      getCompetitionSubmission: async (_binding, _competitionId, submissionId) => ({
        ...submission,
        id: submissionId,
        file: { ...submission.file, originalFilename: "report.bin" },
      }),
    });
    const response = await upload(
      authenticatedApp("COMPETITION_MANAGER", repository),
      formData({ filename: "report.bin" }),
    );
    expect(response.status).toBe(201);
  });

  it("rejects empty and oversized PDFs", async () => {
    const application = authenticatedApp("COMPETITION_MANAGER");
    const empty = await upload(application, formData({ bytes: new Uint8Array() }));
    expect(empty.status).toBe(400);

    const oversizedBytes = new Uint8Array(MAX_SUBMISSION_PDF_BYTES + 1);
    oversizedBytes.set(pdfBytes.subarray(0, 5));
    const oversized = await upload(application, formData({ bytes: oversizedBytes }));
    expect(oversized.status).toBe(413);
  });

  it("rejects a category belonging to another competition before R2 write", async () => {
    const put = vi.fn(async () => ({ etag: "etag-a" }));
    const response = await upload(
      authenticatedApp(
        "COMPETITION_MANAGER",
        repositoryStub(),
        storageStub({ putSubmissionReport: put }),
      ),
      formData({ categoryId: "category-b" }),
    );
    expect(response.status).toBe(404);
    expect(put).not.toHaveBeenCalled();
  });

  it("deletes the R2 object when atomic D1 metadata persistence fails", async () => {
    const remove = vi.fn(async () => undefined);
    const repository = repositoryStub({
      createSubmissionWithFileMetadata: async () => {
        throw new SubmissionRepositoryError("CONFLICT", "APPLICATION_CODE");
      },
    });
    const response = await upload(
      authenticatedApp(
        "COMPETITION_MANAGER",
        repository,
        storageStub({ deleteSubmissionReport: remove }),
      ),
    );
    expect(response.status).toBe(409);
    expect(remove).toHaveBeenCalledOnce();
  });
});

describe("submission reads and private report streaming", () => {
  it("lists only safe submission summaries for the authorized competition", async () => {
    const response = await authenticatedApp("COMPETITION_MANAGER").request(
      "http://localhost/api/v1/competitions/competition-a/submissions",
      undefined,
      environment,
    );
    expect(response.status).toBe(200);
    const payload = SubmissionListResponseSchema.parse(await response.json());
    expect(payload.submissions).toHaveLength(1);
    expect(payload.submissions[0]).not.toHaveProperty("storageKey");
  });

  it("returns a non-leaking 404 for a cross-competition nested submission id", async () => {
    const response = await authenticatedApp("COMPETITION_MANAGER").request(
      "http://localhost/api/v1/competitions/competition-a/submissions/submission-b",
      undefined,
      environment,
    );
    expect(response.status).toBe(404);
    expect(ApiErrorResponseSchema.parse(await response.json()).code).toBe("NOT_FOUND");
  });

  it("streams the exact private PDF bytes with safe headers", async () => {
    const repository = repositoryStub({
      getCompetitionSubmissionFileMetadata: async () => ({
        id: "file-a",
        submissionId: "submission-a",
        competitionId: "competition-a",
        storageKey: "private/server/key",
        originalFilename: "rapor.pdf\r\nX-Injected: yes",
        mimeType: "application/pdf",
        sizeBytes: pdfBytes.byteLength,
        sha256: "a".repeat(64),
        etag: "etag-a",
      }),
    });
    const response = await authenticatedApp("COMPETITION_MANAGER", repository).request(
      "http://localhost/api/v1/competitions/competition-a/submissions/submission-a/report",
      undefined,
      environment,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).not.toContain("\r");
    expect(response.headers.get("content-disposition")).not.toContain("\n");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(pdfBytes);
  });

  it("denies report access to non-manager roles", async () => {
    const response = await authenticatedApp("REVIEWER").request(
      "http://localhost/api/v1/competitions/competition-a/submissions/submission-a/report",
      undefined,
      environment,
    );
    expect(response.status).toBe(403);
  });

  it("returns a controlled storage error when D1 metadata points to a missing object", async () => {
    const response = await authenticatedApp(
      "COMPETITION_MANAGER",
      repositoryStub(),
      storageStub({ getSubmissionReport: async () => null }),
    ).request(
      "http://localhost/api/v1/competitions/competition-a/submissions/submission-a/report",
      undefined,
      environment,
    );
    expect(response.status).toBe(500);
    const payload = ApiErrorResponseSchema.parse(await response.json());
    expect(payload.code).toBe("STORAGE_ERROR");
    expect(payload.message).not.toContain("competitions/");
  });

  it("preserves the neutral exact-duplicate signal", async () => {
    const repository = repositoryStub({
      getCompetitionSubmission: async (_binding, _competitionId, submissionId) => ({
        ...submission,
        id: submissionId,
        exactDuplicate: true,
        matchingSubmissionCount: 1,
      }),
    });
    const response = await upload(authenticatedApp("COMPETITION_MANAGER", repository));
    const payload = SubmissionResponseSchema.parse(await response.json());
    expect(payload).toMatchObject({ exactDuplicate: true, matchingSubmissionCount: 1 });
  });
});
