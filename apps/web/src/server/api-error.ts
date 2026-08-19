import type { ConfigurationRepositoryError } from "@teknofest-ai/db";
import type { ApiErrorResponse } from "@teknofest-ai/shared";
import type { Context } from "hono";

import type { AuthRuntimeBindings } from "./auth/auth";

export class ApiApplicationError extends Error {
  readonly response: ApiErrorResponse;
  readonly status: 400 | 404 | 409;

  constructor(response: ApiErrorResponse, status: 400 | 404 | 409) {
    super(response.code);
    this.name = "ApiApplicationError";
    this.response = response;
    this.status = status;
  }
}

interface RuntimeSchema<T> {
  safeParse(value: unknown):
    | { success: true; data: T }
    | {
        success: false;
        error: { issues: readonly { path: readonly PropertyKey[]; message: string }[] };
      };
}

export async function parseJsonBody<T>(
  context: Context<{ Bindings: AuthRuntimeBindings }>,
  schema: RuntimeSchema<T>,
) {
  let payload: unknown;
  try {
    payload = await context.req.json();
  } catch {
    throw new ApiApplicationError(
      { code: "VALIDATION_ERROR", message: "İstek gövdesi geçerli JSON olmalıdır." },
      400,
    );
  }

  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new ApiApplicationError(
      {
        code: "VALIDATION_ERROR",
        message: "Gönderilen alanları kontrol edin.",
        issues: result.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      400,
    );
  }

  return result.data;
}

export function mapRepositoryError(error: ConfigurationRepositoryError): ApiApplicationError {
  if (error.code === "NOT_FOUND") {
    return new ApiApplicationError(
      { code: "NOT_FOUND", message: "İstenen yapılandırma kaynağı bulunamadı." },
      404,
    );
  }

  const messages = {
    CATEGORY_CODE: "Bu kategori kodu yarışma içinde zaten kullanılıyor.",
    COMPETITION_SLUG: "Bu yarışma slug değeri zaten kullanılıyor.",
    IMMUTABLE_VERSION: "Aktif veya emekli sürümler değiştirilemez.",
    RUBRIC_NOT_READY: "Kriteri olmayan bir rubrik etkinleştirilemez.",
    TEMPLATE_NOT_READY: "Şablon için en az bir bölüm ve bir zorunlu bölüm tanımlayın.",
    VERSION_NUMBER: "Sürüm oluşturulurken eşzamanlı bir değişiklik oluştu; tekrar deneyin.",
    RESOURCE: "İşlem mevcut yapılandırma durumuyla çakışıyor.",
  } as const;

  return new ApiApplicationError({ code: "CONFLICT", message: messages[error.reason] }, 409);
}
