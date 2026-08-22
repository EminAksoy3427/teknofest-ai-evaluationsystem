import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../index";
import { createLocalD1, type LocalD1 } from "../test-fixtures/local-d1";
import type { AuthRuntimeBindings } from "./auth";
import { ACCOUNT_LINKING_POLICY } from "./auth";

const AUTH_TEST_ENVIRONMENT = {
  GOOGLE_CLIENT_ID: "test-google-client-id",
  GOOGLE_CLIENT_SECRET: "test-google-client-secret",
  BETTER_AUTH_SECRET: "a-secure-test-value-with-at-least-32-characters",
  BETTER_AUTH_URL: "http://localhost:5173",
} as const;

function authHeaders(cookie?: string): HeadersInit {
  return {
    "content-type": "application/json",
    origin: AUTH_TEST_ENVIRONMENT.BETTER_AUTH_URL,
    ...(cookie ? { cookie } : {}),
  };
}

function cookieFrom(response: Response): string {
  const header = response.headers.get("set-cookie");
  if (!header) return "";
  return header
    .split(/,(?=\s*[^;=]+=)/)
    .map((part) => part.split(";", 1)[0]?.trim())
    .filter(Boolean)
    .join("; ");
}

describe("Better Auth email/password", () => {
  let local: LocalD1;
  const app = createApp();

  function environment(): AuthRuntimeBindings {
    return {
      DB: local.binding,
      DOCUMENTS: {} as R2Bucket,
      ...AUTH_TEST_ENVIRONMENT,
    } as AuthRuntimeBindings;
  }

  async function post(path: string, body: unknown, cookie?: string): Promise<Response> {
    return app.request(
      `http://localhost:5173${path}`,
      { method: "POST", headers: authHeaders(cookie), body: JSON.stringify(body) },
      environment(),
    );
  }

  async function get(path: string, cookie?: string): Promise<Response> {
    return app.request(
      `http://localhost:5173${path}`,
      { method: "GET", headers: authHeaders(cookie) },
      environment(),
    );
  }

  beforeEach(() => {
    local = createLocalD1();
  });

  afterEach(() => {
    local.close();
  });

  it("keeps the conservative account-linking policy", () => {
    expect(ACCOUNT_LINKING_POLICY.disableImplicitLinking).toBe(true);
    expect(ACCOUNT_LINKING_POLICY.allowDifferentEmails).toBe(false);
  });

  it("creates an auth account only and grants zero competition memberships", async () => {
    const response = await post("/api/auth/sign-up/email", {
      name: "Ayşe Yılmaz",
      email: "ayse@example.com",
      password: "correct-horse",
    });
    expect(response.status).toBeLessThan(400);
    const cookie = cookieFrom(response);
    expect(cookie).toContain("=");

    const users = local.query<{ email: string }>("SELECT email FROM user");
    expect(users.map((row) => row.email)).toEqual(["ayse@example.com"]);
    expect(local.query("SELECT id FROM competition_member")).toEqual([]);

    const me = await get("/api/v1/me/memberships", cookie);
    expect(me.status).toBe(200);
    await expect(me.json()).resolves.toEqual({ memberships: [] });
  });

  it("signs in with valid credentials and rejects invalid ones", async () => {
    const created = await post("/api/auth/sign-up/email", {
      name: "Ayşe Yılmaz",
      email: "ayse@example.com",
      password: "correct-horse",
    });
    expect(created.status).toBeLessThan(400);

    const valid = await post("/api/auth/sign-in/email", {
      email: "ayse@example.com",
      password: "correct-horse",
    });
    expect(valid.status).toBeLessThan(400);

    const invalid = await post("/api/auth/sign-in/email", {
      email: "ayse@example.com",
      password: "wrong-password",
    });
    expect(invalid.status).toBeGreaterThanOrEqual(400);
    const payload = (await invalid.json()) as { code?: string; message?: string };
    expect(JSON.stringify(payload)).not.toContain("correct-horse");
  });

  it("rejects a second registration for the same email without merging accounts", async () => {
    const first = await post("/api/auth/sign-up/email", {
      name: "Ayşe Yılmaz",
      email: "ayse@example.com",
      password: "correct-horse",
    });
    expect(first.status).toBeLessThan(400);

    const second = await post("/api/auth/sign-up/email", {
      name: "Başka Kullanıcı",
      email: "ayse@example.com",
      password: "different-horse",
    });
    expect(second.status).toBeGreaterThanOrEqual(400);
    expect(local.query("SELECT id FROM user")).toHaveLength(1);
    expect(local.query("SELECT id FROM competition_member")).toEqual([]);
  });

  it("rejects a password below Better Auth's minimum length", async () => {
    const response = await post("/api/auth/sign-up/email", {
      name: "Ayşe Yılmaz",
      email: "ayse@example.com",
      password: "short",
    });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(local.query("SELECT id FROM user")).toEqual([]);
  });

  it("does not attach a password to an existing Google-only account with the same email", async () => {
    local.exec(`
      INSERT INTO user (id, name, email, email_verified, updated_at)
      VALUES ('google-user', 'Google Kullanıcı', 'google@example.com', 1, ${Date.now()});
      INSERT INTO account (id, issuer, account_id, provider_id, user_id, updated_at)
      VALUES ('google-account', 'https://accounts.google.com', 'google-subject', 'google', 'google-user', ${Date.now()});
    `);

    const response = await post("/api/auth/sign-up/email", {
      name: "Saldırgan",
      email: "google@example.com",
      password: "correct-horse",
    });
    expect(response.status).toBeGreaterThanOrEqual(400);

    const accounts = local.query<{ provider_id: string; password: string | null }>(
      "SELECT provider_id, password FROM account WHERE user_id = 'google-user'",
    );
    expect(accounts).toEqual([{ provider_id: "google", password: null }]);
    expect(local.query("SELECT id FROM user")).toHaveLength(1);
  });

  it("does not claim a password-reset email was sent when delivery is unconfigured", async () => {
    const response = await post("/api/auth/request-password-reset", {
      email: "ayse@example.com",
      redirectTo: "/reset-password",
    });
    expect(response.status).toBeGreaterThanOrEqual(400);
    const payload = (await response.json()) as { code?: string; message?: string };
    expect(payload.code).toBe("RESET_PASSWORD_DISABLED");
    expect(JSON.stringify(payload)).not.toContain("check your email");
  });

  it("still starts the Google OAuth flow", async () => {
    const response = await post("/api/auth/sign-in/social", {
      provider: "google",
      callbackURL: "/app",
      errorCallbackURL: "/login",
    });
    const location = response.headers.get("location") ?? "";
    const bodyText = await response.text();
    const combined = `${location}\n${bodyText}`;
    expect(response.status).toBeLessThan(400);
    expect(combined).toContain("accounts.google.com");
  });
});
