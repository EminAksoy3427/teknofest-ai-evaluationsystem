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
import { readBoundedBody, validatePdfBytes } from "./storage/pdf-upload";
import { normalizeDisplayFilename, reportResponse } from "./storage/report-response";

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

async function parseBoundedMultipartBody(request: Request): Promise<FormData> {
  const maximumRequestBytes = MAX_SUBMISSION_PDF_BYTES + 128 * 1024;
  const body = await readBoundedBody(request, maximumRequestBytes);
  return new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body,
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

  const validated = await validatePdfBytes(
    new Uint8Array(await report.arrayBuffer()),
    MAX_SUBMISSION_PDF_BYTES,
  );

  return {
    metadata: metadataResult.data,
    bytes: validated.bytes,
    originalFilename: normalizeDisplayFilename(report.name),
    sha256: validated.sha256,
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

      return reportResponse(
        context.env,
        dependencies.documentStorage,
        metadata,
        competitionId,
        submissionId,
      );
    },
  );
}
