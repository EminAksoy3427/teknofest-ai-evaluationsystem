import { type ApiErrorResponse, ApiErrorResponseSchema } from "@teknofest-ai/shared";

interface RuntimeSchema<T> {
  parse(value: unknown): T;
}

export class ClientApiError extends Error {
  readonly payload: ApiErrorResponse;
  readonly status: number;

  constructor(status: number, payload: ApiErrorResponse) {
    super(payload.message);
    this.name = "ClientApiError";
    this.payload = payload;
    this.status = status;
  }
}

export async function apiRequest<T>(
  path: string,
  schema: RuntimeSchema<T>,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body && !(init.body instanceof FormData)
        ? { "content-type": "application/json" }
        : {}),
      ...init?.headers,
    },
  });

  const payload: unknown = await response.json();
  if (!response.ok) {
    const parsed = ApiErrorResponseSchema.safeParse(payload);
    throw new ClientApiError(
      response.status,
      parsed.success
        ? parsed.data
        : { code: "VALIDATION_ERROR", message: "Sunucu yanıtı işlenemedi." },
    );
  }

  return schema.parse(payload);
}

export async function apiDelete(path: string): Promise<void> {
  const response = await fetch(path, { method: "DELETE" });
  if (response.ok) {
    return;
  }

  const payload: unknown = await response.json();
  const parsed = ApiErrorResponseSchema.safeParse(payload);
  throw new ClientApiError(
    response.status,
    parsed.success
      ? parsed.data
      : { code: "VALIDATION_ERROR", message: "Sunucu yanıtı işlenemedi." },
  );
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Beklenmeyen bir hata oluştu.";
}
