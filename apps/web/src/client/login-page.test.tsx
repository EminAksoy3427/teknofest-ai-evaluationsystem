import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";

import { ForgotPasswordPage } from "./forgot-password-page";
import { LandingPage } from "./landing-page";
import { LoginPage } from "./login-page";
import { AI_CAPABILITY_NAME } from "./product-copy";
import { RegisterPage } from "./register-page";
import { ResetPasswordPage } from "./reset-password-page";

function renderAt(path: string, node: ReactElement) {
  return renderToStaticMarkup(<MemoryRouter initialEntries={[path]}>{node}</MemoryRouter>);
}

describe("landing authentication entry", () => {
  const markup = renderAt("/", <LandingPage />);

  it("sends both primary CTAs to /login instead of launching OAuth", () => {
    expect(markup.match(/href="\/login"/g)?.length).toBeGreaterThanOrEqual(2);
    expect(markup).toContain("Platforma giriş");
    expect(markup).not.toContain("Google ile devam et");
  });

  it("keeps the how-it-works jump on the same page", () => {
    expect(markup).toContain('href="#nasil-calisir"');
    expect(markup).toContain("Nasıl çalışır?");
  });

  it("names the decision-support capability AI 3. Göz", () => {
    expect(markup).toContain(AI_CAPABILITY_NAME);
    expect(markup).not.toContain("AI 4. Göz");
  });
});

describe("login page", () => {
  it("renders email, password, Google, forgot-password and register", () => {
    const markup = renderAt("/login", <LoginPage />);
    expect(markup).toContain("Giriş yap");
    expect(markup).toContain('type="email"');
    expect(markup).toContain('name="password"');
    expect(markup).toContain("Google ile devam et");
    expect(markup).toContain("Şifremi unuttum");
    expect(markup).toContain('href="/forgot-password"');
    expect(markup).toContain("Hesabın yok mu?");
    expect(markup).toContain('href="/register"');
    expect(markup).toContain("Kaydol");
    expect(markup).toContain(AI_CAPABILITY_NAME);
    expect(markup).not.toContain("Facebook");
    expect(markup).not.toContain("Apple");
    expect(markup).not.toContain("e-posta ile kayıt yoktur");
  });

  it("announces a controlled failure without exposing provider text", () => {
    const markup = renderAt("/login?error=access_denied", <LoginPage />);
    expect(markup).toContain("Giriş tamamlanamadı. Lütfen tekrar deneyin.");
    expect(markup).toContain('role="alert"');
    expect(markup).not.toContain("access_denied");
  });
});

describe("register page", () => {
  it("renders name, email, password, confirmation and Google alternative", () => {
    const markup = renderAt("/register", <RegisterPage />);
    expect(markup).toContain("Hesap oluştur");
    expect(markup).toContain('name="name"');
    expect(markup).toContain('type="email"');
    expect(markup).toContain('name="password"');
    expect(markup).toContain('name="confirmPassword"');
    expect(markup).toContain("Google ile devam et");
    expect(markup).toContain("Zaten hesabın var mı?");
    expect(markup).toContain('href="/login"');
    expect(markup).toContain("Hiçbir yarışmaya üye");
    expect(markup).not.toContain("Facebook");
    expect(markup).not.toContain("Apple");
  });
});

describe("password recovery pages", () => {
  it("does not pretend a reset email was sent", () => {
    const markup = renderAt("/forgot-password", <ForgotPasswordPage />);
    expect(markup).toContain("Şifremi unuttum");
    expect(markup).toContain("gönderilemiyor");
    expect(markup).not.toContain("e-postanıza bir bağlantı gönderdik");
    expect(markup).toContain('href="/login"');
  });

  it("requires a token before offering a reset form", () => {
    const missing = renderAt("/reset-password", <ResetPasswordPage />);
    expect(missing).toContain("geçersiz veya süresi dolmuş");
    expect(missing).not.toContain('name="newPassword"');

    const ready = renderAt("/reset-password?token=valid-token", <ResetPasswordPage />);
    expect(ready).toContain('name="newPassword"');
    expect(ready).toContain('name="confirmNewPassword"');
  });
});
