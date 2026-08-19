import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Link, Route, Routes } from "react-router";

import "./styles.css";
import { authClient } from "./auth-client";
import { DashboardPage } from "./dashboard-page";
import { SetupPage } from "./setup-page";

function LoginPage({ sessionError }: { sessionError: boolean }) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <main className="grid min-h-screen bg-slate-950 lg:grid-cols-[1.08fr_0.92fr]">
      <section className="relative flex min-h-[24rem] items-end overflow-hidden px-6 py-12 text-white sm:px-12 lg:min-h-screen lg:px-16 lg:py-16">
        <div className="absolute inset-0 bg-[linear-gradient(145deg,#0f172a_0%,#172554_58%,#1d4ed8_100%)]" />
        <div className="absolute -top-24 right-0 h-72 w-72 rounded-full border-[64px] border-white/5" />
        <div className="absolute top-16 right-20 h-32 w-32 rounded-full border border-cyan-300/30" />
        <div className="relative max-w-2xl">
          <p className="text-sm font-bold tracking-[0.2em] text-blue-200 uppercase">
            T3 Vakfı Yapay Zekâ Creathonu · Problem 4
          </p>
          <h1 className="mt-5 text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            Yarışma değerlendirmesi için güvenilir yapılandırma temeli.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-slate-200">
            Kategorileri, rapor yapısını ve değerlendirme ölçütlerini sürümlü biçimde hazırlayın.
            Yapay zekâ yardımcıdır; nihai karar insandadır.
          </p>
        </div>
      </section>
      <section className="flex items-center bg-slate-50 px-6 py-12 sm:px-12 lg:px-16">
        <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-7 shadow-xl shadow-slate-950/5 sm:p-10">
          <p className="eyebrow">TEKNOFEST AI Evaluation System</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-950">
            Çalışma alanına giriş
          </h2>
          <p className="mt-4 leading-7 text-slate-600">
            Yarışma üyeliklerinizi ve yönetici kurulum akışını görüntülemek için Google hesabınızla
            oturum açın.
          </p>
          <button
            className="primary-button mt-8 w-full justify-center py-3"
            disabled={isSubmitting}
            onClick={async () => {
              setIsSubmitting(true);
              await authClient.signIn.social({ provider: "google", callbackURL: "/app" });
              setIsSubmitting(false);
            }}
            type="button"
          >
            {isSubmitting ? "Google’a yönlendiriliyor…" : "Google ile giriş yap"}
          </button>
          {sessionError ? (
            <p className="mt-4 text-sm text-red-700" role="alert">
              Oturum bilgisi alınamadı. Kimlik doğrulama yapılandırmasını kontrol edin.
            </p>
          ) : null}
          <p className="mt-6 text-xs leading-5 text-slate-500">
            Oturum açmak tek başına mevcut bir yarışmaya erişim vermez. Erişim, yarışma kapsamlı
            üyelik üzerinden sunucuda doğrulanır.
          </p>
        </div>
      </section>
    </main>
  );
}

function ProductHeader({ name, email }: { name: string; email: string }) {
  const [isSigningOut, setIsSigningOut] = useState(false);
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8">
        <Link className="flex items-center gap-3" to="/app">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-700 text-sm font-black text-white">
            T3
          </span>
          <span>
            <span className="block text-sm font-bold text-slate-950">TEKNOFEST AI</span>
            <span className="block text-xs text-slate-500">Değerlendirme Sistemi</span>
          </span>
        </Link>
        <div className="flex items-center gap-4">
          <div className="hidden text-right sm:block">
            <p className="text-sm font-semibold text-slate-900">{name}</p>
            <p className="text-xs text-slate-500">{email}</p>
          </div>
          <button
            className="secondary-button"
            disabled={isSigningOut}
            onClick={async () => {
              setIsSigningOut(true);
              await authClient.signOut();
              window.location.assign("/");
            }}
            type="button"
          >
            {isSigningOut ? "Çıkılıyor…" : "Çıkış yap"}
          </button>
        </div>
      </div>
    </header>
  );
}

function SessionGate() {
  const { data: session, error, isPending } = authClient.useSession();

  if (isPending) {
    return (
      <main
        className="grid min-h-screen place-items-center bg-slate-50 px-6 text-sm text-slate-600"
        role="status"
      >
        Oturum durumu kontrol ediliyor…
      </main>
    );
  }

  if (!session) {
    return <LoginPage sessionError={Boolean(error)} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <ProductHeader email={session.user.email} name={session.user.name} />
      <Routes>
        <Route element={<DashboardPage />} path="/" />
        <Route element={<DashboardPage />} path="/app" />
        <Route element={<SetupPage />} path="/app/competitions/:competitionId/setup" />
        <Route element={<DashboardPage />} path="*" />
      </Routes>
    </div>
  );
}

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("React root element was not found.");
}

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter>
      <SessionGate />
    </BrowserRouter>
  </StrictMode>,
);
