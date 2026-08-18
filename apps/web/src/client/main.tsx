import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";

import "./styles.css";

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
            P0-01 · Foundation hazır
          </span>
          <span className="text-sm text-neutral-500">React SPA · Hono API · Cloudflare Worker</span>
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
