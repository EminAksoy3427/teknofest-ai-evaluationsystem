import { getSessionCookie } from "better-auth/cookies";

import { type AuthRuntimeBindings, createAuth } from "./auth";

export interface CurrentSession {
  user: {
    id: string;
    name: string;
    email: string;
    image?: string | null | undefined;
  };
}

export type SessionResolver = (
  request: Request,
  environment: AuthRuntimeBindings,
) => Promise<CurrentSession | null>;

export const resolveCurrentSession: SessionResolver = async (request, environment) => {
  if (!getSessionCookie(request)) {
    return null;
  }

  return createAuth(environment).api.getSession({
    headers: request.headers,
  });
};
