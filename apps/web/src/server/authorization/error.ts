export type AuthorizationErrorCode = "UNAUTHORIZED" | "FORBIDDEN";

export class AuthorizationError extends Error {
  readonly code: AuthorizationErrorCode;
  readonly status: 401 | 403;

  constructor(code: AuthorizationErrorCode) {
    super(code);
    this.name = "AuthorizationError";
    this.code = code;
    this.status = code === "UNAUTHORIZED" ? 401 : 403;
  }
}
