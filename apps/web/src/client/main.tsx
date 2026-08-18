import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";

import "./styles.css";
import { authClient } from "./auth-client";

function AuthenticationState() {
  const { data: session, error, isPending } = authClient.useSession();
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (isPending) {
    return <p className="text-sm text-neutral-500">Oturum durumu kontrol ediliyor…</p>;
  }

  if (session) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <p className="font-medium text-neutral-900">{session.user.name}</p>
          <p className="text-sm text-neutral-500">{session.user.email}</p>
        </div>
        <button
          className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50"
          disabled={isSubmitting}
          onClick={async () => {
            setIsSubmitting(true);
            await authClient.signOut();
            window.location.reload();
          }}
          type="button"
        >
          Çıkış yap
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <button
        className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
        disabled={isSubmitting}
        onClick={async () => {
          setIsSubmitting(true);
          await authClient.signIn.social({
            provider: "google",
            callbackURL: "/",
          });
          setIsSubmitting(false);
        }}
        type="button"
      >
        Google ile giriş yap
      </button>
      {error ? (
        <p className="text-sm text-red-700" role="alert">
          Oturum bilgisi alınamadı. Yerel kimlik doğrulama yapılandırmasını kontrol edin.
        </p>
      ) : null}
    </div>
  );
}

function FoundationPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-6 py-12 text-neutral-950">
      <section className="w-full max-w-2xl rounded-xl border border-neutral-200 bg-white p-8 shadow-sm">
        <p className="mb-3 text-sm font-semibold tracking-wide text-neutral-500 uppercase">
          T3 Vakfı Yapay Zekâ Creathonu · Problem 4
        </p>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          TEKNOFEST AI Evaluation System
        </h1>
        <p className="mt-4 text-lg leading-8 text-neutral-600">
          Kanıta dayalı, insan kontrollü yapay zekâ değerlendirme platformu.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-neutral-200 pt-6">
          <span
            className="rounded-full bg-neutral-900 px-3 py-1 text-sm font-medium text-white"
            role="status"
          >
            P1-02 · Kimlik doğrulama temeli
          </span>
          <span className="text-sm text-neutral-500">React SPA · Hono API · Cloudflare Worker</span>
        </div>
        <div className="mt-6 border-t border-neutral-200 pt-6">
          <AuthenticationState />
          <p className="mt-3 text-xs text-neutral-500">
            Bu aşama yalnız kimlik doğrulamayı kurar; yarışma yetkileri henüz verilmez.
          </p>
        </div>
      </section>
    </main>
  );
}

function App() {
  return (
    <Routes>
      <Route path="*" element={<FoundationPage />} />
    </Routes>
  );
}

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("React root element was not found.");
}

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
