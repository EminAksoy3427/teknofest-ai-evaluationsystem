import type { AuthRuntimeBindings } from "../auth/auth";
import { resolveCurrentSession, type SessionResolver } from "../auth/session";
import { AuthorizationError } from "./error";

export async function requireAuthenticatedUser(
  request: Request,
  environment: AuthRuntimeBindings,
  resolveSession: SessionResolver = resolveCurrentSession,
) {
  const currentSession = await resolveSession(request, environment);

  if (!currentSession) {
    throw new AuthorizationError("UNAUTHORIZED");
  }

  return currentSession.user;
}
