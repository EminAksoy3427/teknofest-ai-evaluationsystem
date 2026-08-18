import {
  CurrentUserResponseSchema,
  createHealthResponse,
  HealthResponseSchema,
  UnauthorizedResponseSchema,
} from "@teknofest-ai/shared";
import { describe, expect, it } from "vitest";

import { app, createApp } from "./index";

describe("GET /api/v1/health", () => {
  it("returns the versioned health contract", async () => {
    const response = await app.request("http://localhost/api/v1/health");
    const payload: unknown = await response.json();

    expect(response.status).toBe(200);
    expect(HealthResponseSchema.parse(payload)).toEqual(createHealthResponse());
  });
});

describe("GET /api/v1/me", () => {
  it("returns 401 without a session or auth credentials", async () => {
    const response = await app.request("http://localhost/api/v1/me");
    const payload: unknown = await response.json();

    expect(response.status).toBe(401);
    expect(UnauthorizedResponseSchema.parse(payload)).toEqual({
      code: "UNAUTHORIZED",
      message: "Oturum açmanız gerekiyor.",
    });
  });

  it("returns only the safe authenticated user projection", async () => {
    const authenticatedApp = createApp({
      resolveSession: async () => ({
        user: {
          id: "user-id",
          name: "Test Kullanıcısı",
          email: "test@example.com",
          image: "https://example.com/avatar.png",
        },
      }),
    });

    const response = await authenticatedApp.request("http://localhost/api/v1/me");
    const payload: unknown = await response.json();
    const currentUser = CurrentUserResponseSchema.parse(payload);

    expect(response.status).toBe(200);
    expect(currentUser).toEqual({
      id: "user-id",
      name: "Test Kullanıcısı",
      email: "test@example.com",
      image: "https://example.com/avatar.png",
    });
    expect(Object.keys(currentUser).sort()).toEqual(["email", "id", "image", "name"]);
  });
});
