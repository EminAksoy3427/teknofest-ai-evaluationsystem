import type { CompetitionMembershipLookup, SubmissionRepository } from "@teknofest-ai/db";
import {
  MAX_SUBMISSION_PDF_BYTES,
  SubmissionCreateMetadataSchema,
  SubmissionListResponseSchema,
  SubmissionResponseSchema,
} from "@teknofest-ai/shared";
import type { Hono } from "hono";

import { ApiApplicationError } from "./api-error";
import type { AuthRuntimeBindings } from "./auth/auth";
import type { SessionResolver } from "./auth/session";
import { requireCompetitionPermission } from "./authorization/membership";
import { requireAuthenticatedUser } from "./authorization/require-auth";
import type { DocumentStorage } from "./storage/documents";

export interface SubmissionRouteDependencies {
  resolveSession: SessionResolver;
  findMembership: CompetitionMembershipLookup;
  submissionRepository: SubmissionRepository;
  documentStorage: DocumentStorage;
}

function requiredParameter(value: string | undefined, name: string): string {
  if (!value) {
    throw new ApiApplicationError(
      { code: "VALIDATION_ERROR", message: `${name} parametresi gereklidir.` },
      400,
    );
  }
  return value;
}

async function requireSubmissionPermission(
  context: {
    req: { raw: Request; param(name: string): string | undefined };
    env: AuthRuntimeBindings;
  },
  dependencies: SubmissionRouteDependencies,
) {
  const user = await requireAuthenticatedUser(
    context.req.raw,
    context.env,
    dependencies.resolveSession,
  );
  const competitionId = requiredParameter(context.req.param("competitionId"), "competitionId");
  await requireCompetitionPermission(
    context.env,
    user.id,
    competitionId,
    "competition:configure",
    dependencies.findMembership,
  );
  return competitionId;
}

function validationError(message: string, issues?: { path: string; message: string }[]) {
  return new ApiApplicationError(
    { code: "VALIDATION_ERROR", message, ...(issues ? { issues } : {}) },
    400,
  );
}

function normalizeDisplayFilename(value: string): string {
  const basename = value.replaceAll("\\", "/").split("/").at(-1) ?? "";
  const normalized = [...basename]
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint >= 32 && !(codePoint >= 127 && codePoint <= 159);
    })
    .slice(0, 180)
    .join("")
    .trim();
  return normalized === "" || normalized === "." || normalized === ".." ? "rapor.pdf" : normalized;
}

function contentDisposition(filename: string): string {
  const safeFilename = normalizeDisplayFilename(filename);
  const ascii =
    safeFilename
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9._ -]/g, "_")
      .replace(/["\\]/g, "_")
      .slice(0, 120) || "rapor.pdf";
  const encoded = encodeURIComponent(safeFilename).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `inline; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

function hasPdfSignature(bytes: Uint8Array): boolean {
  const signature = [0x25, 0x50, 0x44, 0x46, 0x2d];
  return signature.every((byte, index) => bytes[index] === byte);
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digestInput = new Uint8Array(new ArrayBuffer(bytes.byteLength));
  digestInput.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", digestInput.buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function parseBoundedMultipartBody(request: Request): Promise<FormData> {
  const maximumRequestBytes = MAX_SUBMISSION_PDF_BYTES + 128 * 1024;
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const contentLength = Number(declaredLength);
    if (!Number.isFinite(contentLength) || contentLength < 0) {
      throw validationError("Content-Length başlığı geçersizdir.");
    }
    if (contentLength > maximumRequestBytes) {
      throw new ApiApplicationError(
        { code: "PAYLOAD_TOO_LARGE", message: "PDF dosyası en fazla 20 MiB olabilir." },
        413,
      );
    }
  }

  if (!request.body) {
    throw validationError("Çok parçalı istek gövdesi gereklidir.");
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    totalBytes += chunk.value.byteLength;
    if (totalBytes > maximumRequestBytes) {
      await reader.cancel();
      throw new ApiApplicationError(
        { code: "PAYLOAD_TOO_LARGE", message: "PDF dosyası en fazla 20 MiB olabilir." },
        413,
      );
    }
    chunks.push(chunk.value);
  }

  const body = new Uint8Array(new ArrayBuffer(totalBytes));
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: body.buffer,
  }).formData();
}

async function parseSubmissionUpload(request: Request) {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("multipart/form-data;")) {
    throw new ApiApplicationError(
      { code: "UNSUPPORTED_MEDIA_TYPE", message: "Başvuru multipart/form-data olmalıdır." },
      415,
    );
  }

  let formData: FormData;
  try {
    formData = await parseBoundedMultipartBody(request);
  } catch (error) {
    if (error instanceof ApiApplicationError) throw error;
    throw validationError("Çok parçalı istek gövdesi okunamadı.");
  }

  const scalar = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : "";
  };
  const metadataResult = SubmissionCreateMetadataSchema.safeParse({
    applicationCode: scalar("applicationCode"),
    projectTitle: scalar("projectTitle"),
    categoryId: scalar("categoryId"),
  });
  if (!metadataResult.success) {
    throw validationError(
      "Gönderilen başvuru alanlarını kontrol edin.",
      metadataResult.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    );
  }

  const report = formData.get("report");
  if (!(report instanceof File)) {
    throw validationError("PDF raporu seçilmelidir.");
  }
  if (report.type.toLowerCase() !== "application/pdf") {
    throw new ApiApplicationError(
      { code: "UNSUPPORTED_MEDIA_TYPE", message: "Yalnız application/pdf raporları kabul edilir." },
      415,
    );
  }
  if (report.size === 0) {
    throw validationError("PDF raporu boş olamaz.");
  }
  if (report.size > MAX_SUBMISSION_PDF_BYTES) {
    throw new ApiApplicationError(
      { code: "PAYLOAD_TOO_LARGE", message: "PDF dosyası en fazla 20 MiB olabilir." },
      413,
    );
  }

  const bytes = new Uint8Array(await report.arrayBuffer());
  if (!hasPdfSignature(bytes)) {
    throw validationError("Dosya geçerli bir PDF imzasıyla başlamalıdır.");
  }

  return {
    metadata: metadataResult.data,
    bytes,
    originalFilename: normalizeDisplayFilename(report.name),
    sha256: await sha256Hex(bytes),
  };
}

export function registerSubmissionRoutes(
  app: Hono<{ Bindings: AuthRuntimeBindings }>,
  dependencies: SubmissionRouteDependencies,
) {
  app.post("/api/v1/competitions/:competitionId/submissions", async (context) => {
    const competitionId = await requireSubmissionPermission(context, dependencies);
    const upload = await parseSubmissionUpload(context.req.raw);
    const categoryExists = await dependencies.submissionRepository.categoryBelongsToCompetition(
      context.env.DB,
      competitionId,
      upload.metadata.categoryId,
    );
    if (!categoryExists) {
      throw new ApiApplicationError(
        { code: "NOT_FOUND", message: "Seçilen kategori bu yarışmada bulunamadı." },
        404,
      );
    }

    const submissionId = crypto.randomUUID();
    const fileId = crypto.randomUUID();
    const storageKey = `competitions/${competitionId}/submissions/${submissionId}/${fileId}/report.pdf`;
    let stored: { etag: string };
    try {
      stored = await dependencies.documentStorage.putSubmissionReport(
        context.env.DOCUMENTS,
        storageKey,
        upload.bytes,
      );
    } catch {
      throw new ApiApplicationError(
        { code: "STORAGE_ERROR", message: "Rapor özel belge deposuna kaydedilemedi." },
        500,
      );
    }

    try {
      await dependencies.submissionRepository.createSubmissionWithFileMetadata(context.env.DB, {
        id: submissionId,
        fileId,
        competitionId,
        categoryId: upload.metadata.categoryId,
        applicationCode: upload.metadata.applicationCode,
        projectTitle: upload.metadata.projectTitle,
        storageKey,
        originalFilename: upload.originalFilename,
        mimeType: "application/pdf",
        sizeBytes: upload.bytes.byteLength,
        sha256: upload.sha256,
        etag: stored.etag,
      });
    } catch (error) {
      try {
        await dependencies.documentStorage.deleteSubmissionReport(
          context.env.DOCUMENTS,
          storageKey,
        );
      } catch {
        console.error("submission storage compensation failed", {
          competitionId,
          submissionId,
          fileId,
        });
      }
      throw error;
    }

    const created = await dependencies.submissionRepository.getCompetitionSubmission(
      context.env.DB,
      competitionId,
      submissionId,
    );
    if (!created) {
      throw new ApiApplicationError(
        { code: "INTERNAL_ERROR", message: "Kaydedilen başvuru okunamadı." },
        500,
      );
    }
    return context.json(SubmissionResponseSchema.parse(created), 201);
  });

  app.get("/api/v1/competitions/:competitionId/submissions", async (context) => {
    const competitionId = await requireSubmissionPermission(context, dependencies);
    const submissions = await dependencies.submissionRepository.listCompetitionSubmissions(
      context.env.DB,
      competitionId,
    );
    return context.json(SubmissionListResponseSchema.parse({ submissions }));
  });

  app.get("/api/v1/competitions/:competitionId/submissions/:submissionId", async (context) => {
    const competitionId = await requireSubmissionPermission(context, dependencies);
    const submission = await dependencies.submissionRepository.getCompetitionSubmission(
      context.env.DB,
      competitionId,
      requiredParameter(context.req.param("submissionId"), "submissionId"),
    );
    if (!submission) {
      throw new ApiApplicationError({ code: "NOT_FOUND", message: "Başvuru bulunamadı." }, 404);
    }
    return context.json(SubmissionResponseSchema.parse(submission));
  });

  app.get(
    "/api/v1/competitions/:competitionId/submissions/:submissionId/report",
    async (context) => {
      const competitionId = await requireSubmissionPermission(context, dependencies);
      const submissionId = requiredParameter(context.req.param("submissionId"), "submissionId");
      const metadata = await dependencies.submissionRepository.getCompetitionSubmissionFileMetadata(
        context.env.DB,
        competitionId,
        submissionId,
      );
      if (!metadata) {
        throw new ApiApplicationError(
          { code: "NOT_FOUND", message: "Başvuru raporu bulunamadı." },
          404,
        );
      }

      let object: R2ObjectBody | null;
      try {
        object = await dependencies.documentStorage.getSubmissionReport(
          context.env.DOCUMENTS,
          metadata.storageKey,
        );
      } catch {
        object = null;
      }
      if (!object) {
        console.error("submission report object missing", {
          competitionId,
          submissionId,
          fileId: metadata.id,
        });
        throw new ApiApplicationError(
          { code: "STORAGE_ERROR", message: "Başvuru raporu belge deposundan okunamadı." },
          500,
        );
      }

      const headers = new Headers({
        "cache-control": "private, no-store",
        "content-disposition": contentDisposition(metadata.originalFilename),
        "content-length": String(object.size),
        "content-type": "application/pdf",
        etag: object.httpEtag,
      });
      return new Response(object.body, { headers });
    },
  );
}
