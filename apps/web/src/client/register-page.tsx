import { type FormEvent, useId, useState } from "react";

import { authClient } from "./auth-client";
import { authErrorMessage, confirmPasswordValidationMessage } from "./auth-password";
import { AuthDivider, AuthFootNote, AuthShell, AuthSwitchPrompt } from "./auth-shell";
import { DISPLAY_NAME_MAX_LENGTH, displayNameValidationMessage } from "./display-name";
import { GoogleSignInButton } from "./google-sign-in-button";
import { PasswordField } from "./password-field";

export function RegisterPage() {
  const nameId = useId();
  const emailId = useId();
  const passwordId = useId();
  const confirmId = useId();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [validation, setValidation] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const nameMessage = displayNameValidationMessage(name);
    if (nameMessage) {
      setValidation(nameMessage);
      return;
    }
    const passwordMessage = confirmPasswordValidationMessage(password, confirmPassword);
    if (passwordMessage) {
      setValidation(passwordMessage);
      return;
    }
    setValidation(null);
    setFormError(null);
    setIsSubmitting(true);
    try {
      const result = await authClient.signUp.email({
        name: name.trim(),
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
      <h1 className="auth-title">Hesap oluştur</h1>
      <p className="auth-lead">
        Kayıt yalnız bir hesap açar. Hiçbir yarışmaya üye veya yetkili olmazsınız.
      </p>

      {formError ? (
        <p className="alert-error mt-5" role="alert">
          {formError}
        </p>
      ) : null}

      <form className="mt-6 grid gap-4" onSubmit={onSubmit}>
        <div>
          <label className="field-label" htmlFor={nameId}>
            Ad
          </label>
          <input
            autoComplete="name"
            className="field-input"
            id={nameId}
            maxLength={DISPLAY_NAME_MAX_LENGTH + 8}
            name="name"
            onChange={(event) => {
              setName(event.target.value);
              setValidation(null);
            }}
            required
            value={name}
          />
        </div>
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
          autoComplete="new-password"
          describedBy={validation ? `${passwordId}-error` : undefined}
          id={passwordId}
          invalid={Boolean(validation)}
          label="Şifre"
          name="password"
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
          label="Şifreyi doğrula"
          name="confirmPassword"
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
        ) : (
          <p className="field-help">En az 8 karakter. Kayıt yarışma yetkisi vermez.</p>
        )}
        <button className="primary-button w-full" disabled={isSubmitting} type="submit">
          {isSubmitting ? "Hesap oluşturuluyor…" : "Hesap oluştur"}
        </button>
      </form>

      <AuthDivider />
      <GoogleSignInButton errorCallbackURL="/register" />
      <AuthSwitchPrompt action="Giriş yap" prompt="Zaten hesabın var mı?" to="/login" />
      <AuthFootNote />
    </AuthShell>
  );
}
