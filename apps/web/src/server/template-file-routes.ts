import type {
  CompetitionConfigurationRepository,
  CompetitionMembershipLookup,
  TemplateFileWriteResult,
} from "@teknofest-ai/db";
import { ConfigurationRepositoryError } from "@teknofest-ai/db";
import { MAX_TEMPLATE_PDF_BYTES, TemplateVersionResponseSchema } from "@teknofest-ai/shared";
import type { Hono } from "hono";

import { ApiApplicationError, mapRepositoryError } from "./api-error";
import type { AuthRuntimeBindings } from "./auth/auth";
import type { SessionResolver } from "./auth/session";
import { requireCompetitionPermission } from "./authorization/membership";
import { requireAuthenticatedUser } from "./authorization/require-auth";
import type { DocumentStorage } from "./storage/documents";
import { readBoundedBody, validatePdfBytes } from "./storage/pdf-upload";
import { contentDisposition, normalizeDisplayFilename } from "./storage/report-response";

export interface TemplateFileRouteDependencies {
  resolveSession: SessionResolver;
  findMembership: CompetitionMembershipLookup;
  repository: CompetitionConfigurationRepository;
  documentStorage: DocumentStorage;
}

interface RouteContext {
  req: {
    raw: Request;
    param(name: string): string | undefined;
    query(name: string): string | undefined;
  };
  env: AuthRuntimeBindings;
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

/**
 * Official-template gate: only `competition:configure` (COMPETITION_MANAGER) may upload, replace or
 * download the official file, mirroring every other template-configuration action. A REVIEWER, an
 * EVALUATION_MANAGER, a CONTESTANT or an unauthenticated caller is denied exactly like a category or
 * a rubric write; a nested id from another competition resolves as a non-leaking 404 downstream.
 */
async function requireTemplateFilePermission(
  context: RouteContext,
  dependencies: TemplateFileRouteDependencies,
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

export function registerTemplateFileRoutes(
  app: Hono<{ Bindings: AuthRuntimeBindings }>,
  dependencies: TemplateFileRouteDependencies,
) {
  // Uploads or replaces the official template PDF on a DRAFT TemplateVersion. The body is the raw
  // PDF bytes (`Content-Type: application/pdf`), read and validated with the exact same bounded
  // signature/size/hash discipline a submission report uses. The R2 object key is generated
  // entirely server-side; nothing about it is client-controlled, and the client never learns it.
  app.put(
    "/api/v1/competitions/:competitionId/templates/:templateVersionId/file",
    async (context) => {
      const competitionId = await requireTemplateFilePermission(context, dependencies);
      const templateVersionId = requiredParameter(
        context.req.param("templateVersionId"),
        "templateVersionId",
      );

      const maximumRequestBytes = MAX_TEMPLATE_PDF_BYTES + 128 * 1024;
      const bytes = await readBoundedBody(context.req.raw, maximumRequestBytes);
      const validated = await validatePdfBytes(bytes, MAX_TEMPLATE_PDF_BYTES);
      const originalFilename = normalizeDisplayFilename(
        context.req.query("filename") ?? "sablon.pdf",
      );

      const fileId = crypto.randomUUID();
      const storageKey = `competitions/${competitionId}/template-versions/${templateVersionId}/${fileId}/template.pdf`;

      let stored: { etag: string };
      try {
        stored = await dependencies.documentStorage.putTemplateFile(
          context.env.DOCUMENTS,
          storageKey,
          validated.bytes,
        );
      } catch {
        throw new ApiApplicationError(
          { code: "STORAGE_ERROR", message: "Şablon dosyası özel belge deposuna kaydedilemedi." },
          500,
        );
      }

      let result: TemplateFileWriteResult;
      try {
        result = await dependencies.repository.putTemplateVersionFile(
          context.env.DB,
          competitionId,
          templateVersionId,
          {
            storageKey,
            sha256: validated.sha256,
            originalFilename,
            sizeBytes: validated.bytes.byteLength,
            etag: stored.etag,
          },
        );
      } catch (error) {
        // The metadata write failed: delete the object this request just wrote so a dangling,
        // unreferenced private R2 object never outlives its (nonexistent) D1 pointer. The template's
        // PREVIOUS file, if any, is untouched — it is still the one the metadata actually points to.
        try {
          await dependencies.documentStorage.deleteTemplateFile(context.env.DOCUMENTS, storageKey);
        } catch {
          console.error("template file storage compensation failed", {
            competitionId,
            templateVersionId,
            fileId,
          });
        }
        if (error instanceof ConfigurationRepositoryError) {
          const mapped = mapRepositoryError(error);
          throw new ApiApplicationError(mapped.response, mapped.status);
        }
        throw error;
      }

      // The metadata write has already succeeded and now points at the NEW key. Only now is it safe
      // to delete the previous object — never before, so a crash between the two steps can only ever
      // leave a harmless orphaned object, never a metadata row pointing at nothing.
      if (result.previousStorageKey && result.previousStorageKey !== storageKey) {
        try {
          await dependencies.documentStorage.deleteTemplateFile(
            context.env.DOCUMENTS,
            result.previousStorageKey,
          );
        } catch {
          console.error("previous template file cleanup failed", {
            competitionId,
            templateVersionId,
          });
        }
      }

      return context.json(TemplateVersionResponseSchema.parse(result.template), 200);
    },
  );

  // Protected preview/download for the manager. No R2 key, bucket name or public URL ever reaches
  // the browser; the response is `private, no-store` so no shareable/cacheable URL for the body
  // exists either.
  app.get(
    "/api/v1/competitions/:competitionId/templates/:templateVersionId/file",
    async (context) => {
      const competitionId = await requireTemplateFilePermission(context, dependencies);
      const templateVersionId = requiredParameter(
        context.req.param("templateVersionId"),
        "templateVersionId",
      );

      const metadata = await dependencies.repository.getTemplateVersionFileMetadata(
        context.env.DB,
        competitionId,
        templateVersionId,
      );
      if (!metadata) {
        throw new ApiApplicationError(
          { code: "NOT_FOUND", message: "Resmî rapor şablonu bulunamadı." },
          404,
        );
      }

      const object = await dependencies.documentStorage.getTemplateFile(
        context.env.DOCUMENTS,
        metadata.storageKey,
      );
      if (!object) {
        console.error("template file object missing", { competitionId, templateVersionId });
        throw new ApiApplicationError(
          { code: "STORAGE_ERROR", message: "Resmî rapor şablonu belge deposundan okunamadı." },
          500,
        );
      }

      return new Response(object.body, {
        headers: new Headers({
          "cache-control": "private, no-store",
          "content-disposition": contentDisposition(metadata.originalFilename),
          "content-length": String(object.size),
          "content-type": "application/pdf",
          etag: object.httpEtag,
        }),
      });
    },
  );
}
