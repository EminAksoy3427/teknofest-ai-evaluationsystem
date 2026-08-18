import { describe, expect, it } from "vitest";

import { readAuthConfiguration } from "./env";

describe("readAuthConfiguration", () => {
  it("accepts the exact local origin and server-only values", () => {
    expect(
      readAuthConfiguration({
        GOOGLE_CLIENT_ID: "client-id",
        GOOGLE_CLIENT_SECRET: "client-secret",
        BETTER_AUTH_SECRET: "a-secure-test-value-with-at-least-32-characters",
        BETTER_AUTH_URL: "http://localhost:5173",
      }),
    ).toEqual({
      baseUrl: "http://localhost:5173",
      googleClientId: "client-id",
      googleClientSecret: "client-secret",
      secret: "a-secure-test-value-with-at-least-32-characters",
    });
  });

  it("rejects placeholders without exposing their values", () => {
    expect(() =>
      readAuthConfiguration({
        GOOGLE_CLIENT_ID: "replace_me",
        GOOGLE_CLIENT_SECRET: "replace_me",
        BETTER_AUTH_SECRET: "replace_me",
        BETTER_AUTH_URL: "http://localhost:5173/path",
      }),
    ).toThrowError(
      "Authentication configuration is missing or invalid: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, BETTER_AUTH_SECRET, BETTER_AUTH_URL",
    );
  });
});
