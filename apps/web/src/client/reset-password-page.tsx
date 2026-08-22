import { type FormEvent, useId, useState } from "react";
import { Link, useSearchParams } from "react-router";

import { authClient } from "./auth-client";
import {
  authErrorMessage,
  confirmPasswordValidationMessage,
  PASSWORD_RESET_UNAVAILABLE_MESSAGE,
} from "./auth-password";
import { AuthFootNote, AuthShell } from "./auth-shell";
import { PasswordField } from "./password-field";

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token")?.trim() ?? "";
  const passwordId = useId();
  const confirmId = useId();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [validation, setValidation] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const passwordMessage = confirmPasswordValidationMessage(password, confirmPassword);
    if (passwordMessage) {
      setValidation(passwordMessage);
      return;
    }
    setValidation(null);
    setFormError(null);
    setIsSubmitting(true);
    try {
      const result = await authClient.resetPassword({
        newPassword: password,
        token,
      });
      if (result.error) {
        setFormError(authErrorMessage(result.error));
        setIsSubmitting(false);
        return;
      }
      setCompleted(true);
    } catch {
      setFormError(authErrorMessage(null));
      setIsSubmitting(false);
    }
  }

  return (
    <AuthShell>
      <h1 className="auth-title">Şifreyi sıfırla</h1>
      {token === "" ? (
        <>
          <p className="auth-lead">Bu bağlantı geçersiz veya süresi dolmuş.</p>
          <p className="mt-4 text-sm leading-6 text-ink-muted">
            {PASSWORD_RESET_UNAVAILABLE_MESSAGE}
          </p>
          <p className="mt-6 text-sm">
            <Link className="font-medium text-brand hover:text-brand-strong" to="/login">
              Girişe dön
            </Link>
          </p>
        </>
      ) : completed ? (
        <>
          <p className="auth-lead">Şifreniz güncellendi. Yeni şifrenizle giriş yapabilirsiniz.</p>
          <p className="mt-6 text-sm">
            <Link className="font-medium text-brand hover:text-brand-strong" to="/login">
              Girişe dön
            </Link>
          </p>
        </>
      ) : (
        <>
          <p className="auth-lead">Hesabınız için yeni bir şifre belirleyin.</p>
          {formError ? (
            <p className="alert-error mt-5" role="alert">
              {formError}
            </p>
          ) : null}
          <form className="mt-6 grid gap-4" onSubmit={onSubmit}>
            <PasswordField
              autoComplete="new-password"
              describedBy={validation ? `${passwordId}-error` : undefined}
              id={passwordId}
              invalid={Boolean(validation)}
              label="Yeni şifre"
              name="newPassword"
              onChange={(value) => {
                setPassword(value);
                setValidation(null);
              }}
              value={password}
            />
            <PasswordField
              autoComplete="new-password"
              id={confirmId}
              invalid={Boolean(validation)}
              label="Yeni şifreyi doğrula"
              name="confirmNewPassword"
              onChange={(value) => {
                setConfirmPassword(value);
                setValidation(null);
              }}
              value={confirmPassword}
            />
            {validation ? (
              <p className="field-help text-critical" id={`${passwordId}-error`} role="alert">
                {validation}
              </p>
            ) : null}
            <button className="primary-button w-full" disabled={isSubmitting} type="submit">
              {isSubmitting ? "Şifre güncelleniyor…" : "Şifreyi güncelle"}
            </button>
          </form>
        </>
      )}
      <AuthFootNote />
    </AuthShell>
  );
}
