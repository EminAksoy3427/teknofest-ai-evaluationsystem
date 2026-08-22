import { type FormEvent, useId, useState } from "react";
import { Link, useSearchParams } from "react-router";

import { authClient } from "./auth-client";
import { authErrorMessage } from "./auth-password";
import { loginFailureMessage } from "./auth-routing";
import { AuthDivider, AuthFootNote, AuthShell, AuthSwitchPrompt } from "./auth-shell";
import { GoogleSignInButton } from "./google-sign-in-button";
import { PasswordField } from "./password-field";

export function LoginPage({ sessionError = false }: { sessionError?: boolean }) {
  const [searchParams] = useSearchParams();
  const emailId = useId();
  const passwordId = useId();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const oauthError = loginFailureMessage(searchParams.toString());
  const errorMessage = sessionError
    ? "Oturum bilgisi alınamadı. Lütfen tekrar deneyin."
    : (formError ?? oauthError);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    setFormError(null);
    try {
      const result = await authClient.signIn.email({
        email,
        password,
        callbackURL: "/app",
      });
      if (result.error) {
        setFormError(authErrorMessage(result.error));
        setIsSubmitting(false);
      }
    } catch {
      setFormError(authErrorMessage(null));
      setIsSubmitting(false);
    }
  }

  return (
    <AuthShell>
      <h1 className="auth-title">Giriş yap</h1>
      <p className="auth-lead">Değerlendirme Platformu hesabınızla devam edin.</p>

      {errorMessage ? (
        <p className="alert-error mt-5" role="alert">
          {errorMessage}
        </p>
      ) : null}

      <form className="mt-6 grid gap-4" onSubmit={onSubmit}>
        <div>
          <label className="field-label" htmlFor={emailId}>
            E-posta
          </label>
          <input
            autoComplete="email"
            className="field-input"
            id={emailId}
            name="email"
            onChange={(event) => setEmail(event.target.value)}
            required
            type="email"
            value={email}
          />
        </div>
        <PasswordField
          autoComplete="current-password"
          id={passwordId}
          label="Şifre"
          name="password"
          onChange={setPassword}
          value={password}
        />
        <p className="text-right">
          <Link
            className="text-[13px] font-medium text-brand hover:text-brand-strong"
            to="/forgot-password"
          >
            Şifremi unuttum
          </Link>
        </p>
        <button className="primary-button w-full" disabled={isSubmitting} type="submit">
          {isSubmitting ? "Giriş yapılıyor…" : "Giriş yap"}
        </button>
      </form>

      <AuthDivider />
      <GoogleSignInButton errorCallbackURL="/login" />
      <AuthSwitchPrompt action="Kaydol" prompt="Hesabın yok mu?" to="/register" />
      <AuthFootNote />
    </AuthShell>
  );
}
