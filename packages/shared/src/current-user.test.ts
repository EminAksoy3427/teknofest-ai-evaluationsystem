import { describe, expect, it } from "vitest";

import {
  CurrentUserResponseSchema,
  createCurrentUserResponse,
  createUnauthorizedResponse,
  UnauthorizedResponseSchema,
} from "./current-user";

describe("authentication application contracts", () => {
  it("accepts only the safe current-user projection", () => {
    expect(
      CurrentUserResponseSchema.parse(
        createCurrentUserResponse({
          id: "user-id",
          name: "Test Kullanıcısı",
          email: "test@example.com",
          image: null,
        }),
      ),
    ).toEqual({
      id: "user-id",
      name: "Test Kullanıcısı",
      email: "test@example.com",
      image: null,
    });
  });

  it("rejects leaked session or provider tokens", () => {
    expect(
      CurrentUserResponseSchema.safeParse({
        id: "user-id",
        name: "Test Kullanıcısı",
        email: "test@example.com",
        image: null,
        sessionToken: "must-not-leak",
      }).success,
    ).toBe(false);
  });

  it("creates the typed unauthenticated response", () => {
    expect(UnauthorizedResponseSchema.parse(createUnauthorizedResponse())).toEqual({
      code: "UNAUTHORIZED",
      message: "Oturum açmanız gerekiyor.",
    });
  });
});
