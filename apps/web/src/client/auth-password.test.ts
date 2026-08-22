import { describe, expect, it } from "vitest";

import {
  AUTH_PASSWORD_MIN_LENGTH,
  authErrorMessage,
  confirmPasswordValidationMessage,
  hasAuthProvider,
  passwordValidationMessage,
} from "./auth-password";

describe("password constraints", () => {
  it("enforces Better Auth min/max length and confirmation", () => {
    expect(passwordValidationMessage("short")).toContain(`en az ${AUTH_PASSWORD_MIN_LENGTH}`);
    expect(passwordValidationMessage("long-enough-password")).toBeNull();
    expect(confirmPasswordValidationMessage("long-enough-password", "mismatch")).toBe(
      "Şifreler eşleşmiyor.",
    );
  });

  it("hides raw provider codes behind controlled copy", () => {
    expect(authErrorMessage({ code: "INVALID_EMAIL_OR_PASSWORD" })).toBe(
      "E-posta veya şifre hatalı.",
    );
    expect(authErrorMessage({ code: "RESET_PASSWORD_DISABLED" })).toContain("e-posta teslimatı");
    expect(authErrorMessage({ code: "access_denied" })).not.toContain("access_denied");
  });

  it("detects credential vs Google accounts from Better Auth provider IDs", () => {
    expect(hasAuthProvider([{ providerId: "google" }], "google")).toBe(true);
    expect(hasAuthProvider([{ providerId: "google" }], "credential")).toBe(false);
    expect(hasAuthProvider([{ providerId: "credential" }], "credential")).toBe(true);
  });
});
