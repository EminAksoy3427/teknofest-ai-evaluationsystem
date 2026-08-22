import { Link } from "react-router";

import { PASSWORD_RESET_UNAVAILABLE_MESSAGE } from "./auth-password";
import { AuthFootNote, AuthShell, AuthSwitchPrompt } from "./auth-shell";
import { GoogleSignInButton } from "./google-sign-in-button";

/**
 * Password recovery is a real Better Auth flow, but this repository has no outbound
 * mail sender. The page therefore does not collect an email or claim that a message
 * was sent.
 */
export function ForgotPasswordPage() {
  return (
    <AuthShell>
      <h1 className="auth-title">Şifremi unuttum</h1>
      <p className="auth-lead">{PASSWORD_RESET_UNAVAILABLE_MESSAGE}</p>
      <p className="mt-4 text-sm leading-6 text-ink-muted">
        Sahte bir teslimat onayı gösterilmez. Google ile açılmış bir hesabınız varsa o yöntemle
        giriş yapabilirsiniz.
      </p>
      <div className="mt-6">
        <GoogleSignInButton errorCallbackURL="/forgot-password" />
      </div>
      <p className="mt-6 text-sm">
        <Link className="font-medium text-brand hover:text-brand-strong" to="/login">
          Girişe dön
        </Link>
      </p>
      <AuthSwitchPrompt action="Kaydol" prompt="Hesabın yok mu?" to="/register" />
      <AuthFootNote />
    </AuthShell>
  );
}
