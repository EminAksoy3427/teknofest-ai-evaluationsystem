import { describe, expect, it } from "vitest";

import {
  authenticatedLoginDestination,
  loginFailureMessage,
  unauthenticatedDestination,
} from "./auth-routing";

describe("account entry routing", () => {
  it("sends unauthenticated app routes to /login", () => {
    expect(unauthenticatedDestination("/app")).toBe("/login");
    expect(unauthenticatedDestination("/app/profile")).toBe("/login");
    expect(unauthenticatedDestination("/")).toBeNull();
    expect(unauthenticatedDestination("/login")).toBeNull();
  });

  it("sends an already authenticated visitor away from /login and /register", () => {
    expect(authenticatedLoginDestination("/login")).toBe("/app");
    expect(authenticatedLoginDestination("/register")).toBe("/app");
    expect(authenticatedLoginDestination("/app")).toBeNull();
    expect(authenticatedLoginDestination("/")).toBeNull();
    expect(authenticatedLoginDestination("/forgot-password")).toBeNull();
  });

  it("does not create a redirect loop between identity routes and /app", () => {
    expect(unauthenticatedDestination("/login")).toBeNull();
    expect(unauthenticatedDestination("/register")).toBeNull();
    expect(authenticatedLoginDestination("/app")).toBeNull();
  });

  it("hides raw OAuth errors behind a controlled message", () => {
    expect(loginFailureMessage("error=access_denied")).toBe(
      "Giriş tamamlanamadı. Lütfen tekrar deneyin.",
    );
    expect(loginFailureMessage("error_description=redirect_uri_mismatch")).toBe(
      "Giriş tamamlanamadı. Lütfen tekrar deneyin.",
    );
    expect(loginFailureMessage("")).toBeNull();
  });
});
