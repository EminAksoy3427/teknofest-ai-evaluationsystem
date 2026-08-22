import { useState } from "react";

import { authClient } from "./auth-client";
import { authErrorMessage } from "./auth-password";

function GoogleMark() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 18 18">
      <path
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.04-3.71H.96v2.33A8.99 8.99 0 0 0 9 18Z"
        fill="#34A853"
      />
      <path
        d="M3.96 10.71A5.41 5.41 0 0 1 3.68 9c0-.6.1-1.17.28-1.71V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.04l3-2.33Z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A8.99 8.99 0 0 0 .96 4.96L3.96 7.3C4.68 5.16 6.66 3.58 9 3.58Z"
        fill="#EA4335"
      />
    </svg>
  );
}

export function GoogleSignInButton({
  callbackURL = "/app",
  errorCallbackURL = "/login",
}: {
  callbackURL?: string;
  errorCallbackURL?: string;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <button
        className="google-auth-button"
        disabled={isSubmitting}
        onClick={async () => {
          setIsSubmitting(true);
          setError(null);
          try {
            const result = await authClient.signIn.social({
              callbackURL,
              errorCallbackURL,
              provider: "google",
            });
            if (result.error) {
              setError(authErrorMessage(result.error));
              setIsSubmitting(false);
            }
          } catch {
            setError(authErrorMessage(null));
            setIsSubmitting(false);
          }
        }}
        type="button"
      >
        {isSubmitting ? (
          "Google’a yönlendiriliyor…"
        ) : (
          <>
            <GoogleMark />
            Google ile devam et
          </>
        )}
      </button>
      {error ? (
        <p className="mt-3 text-sm text-critical" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
