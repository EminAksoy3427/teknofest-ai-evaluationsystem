import type { ReactNode } from "react";
import { Link } from "react-router";

import { AI_CAPABILITY_NAME, AI_CAPABILITY_SUPPORT, PRODUCT_DESCRIPTOR } from "./product-copy";
import { BrandWordmark } from "./ui";

function AuthProductPreview() {
  return (
    <div aria-hidden="true" className="auth-preview">
      <div className="auth-preview-chrome">
        <span className="auth-preview-code">A-042</span>
        <span className="auth-preview-title">AquaSense</span>
        <span className="auth-preview-chip">Tarım Teknolojileri</span>
      </div>
      <div className="auth-preview-panes">
        <div className="auth-preview-pane">
          <p className="auth-preview-kicker">Rapor</p>
          <div className="auth-preview-lines">
            <span />
            <span />
            <span />
          </div>
          <p className="auth-preview-quote">“…nem eşiği 18 saatte doğrulandı.”</p>
          <p className="auth-preview-meta">Sayfa 7 / 12</p>
        </div>
        <div className="auth-preview-pane auth-preview-pane-accent">
          <p className="auth-preview-kicker">{AI_CAPABILITY_NAME}</p>
          <p className="auth-preview-support">{AI_CAPABILITY_SUPPORT}</p>
          <p className="auth-preview-row">
            Dil <span>Uygun</span>
          </p>
          <p className="auth-preview-row">
            Format <span>Uygun</span>
          </p>
          <p className="auth-preview-row auth-preview-row-warn">
            Benzerlik <span>İncelenmeli</span>
          </p>
        </div>
        <div className="auth-preview-pane">
          <p className="auth-preview-kicker">Hakem Kararı</p>
          <p className="auth-preview-score-label">Problem Tanımı</p>
          <p className="auth-preview-score">8 / 10</p>
          <p className="auth-preview-meta">AI 6 · Hakem 8 · AI'DAN FARKLI</p>
        </div>
      </div>
    </div>
  );
}

export function AuthShell({
  children,
  compactBrand = true,
}: {
  children: ReactNode;
  compactBrand?: boolean;
}) {
  return (
    <div className="auth-page">
      <div className="auth-shell">
        <section className="auth-product">
          <div className="auth-product-inner">
            <BrandWordmark to="/" tone="inverse" />
            <p className="auth-product-headline">
              Kanıta dayalı değerlendirme.
              <span>İnsan kontrolünde.</span>
            </p>
            <AuthProductPreview />
            <p className="auth-product-foot">T3 Vakfı</p>
          </div>
        </section>

        <main className="auth-form">
          {compactBrand ? (
            <div className="auth-form-brand">
              <BrandWordmark to="/" />
              <p className="auth-form-pipeline">
                Rapor <span aria-hidden="true">→</span> {AI_CAPABILITY_NAME}{" "}
                <span aria-hidden="true">→</span> Hakem Kararı
              </p>
            </div>
          ) : null}
          <div className="auth-form-inner">{children}</div>
        </main>
      </div>
    </div>
  );
}

export function AuthDivider({ label = "veya" }: { label?: string }) {
  return (
    <p className="auth-divider">
      <span>{label}</span>
    </p>
  );
}

export function AuthSwitchPrompt({
  action,
  prompt,
  to,
}: {
  action: string;
  prompt: string;
  to: string;
}) {
  return (
    <p className="auth-switch">
      {prompt}{" "}
      <Link className="font-medium text-brand hover:text-brand-strong" to={to}>
        {action}
      </Link>
    </p>
  );
}

export function AuthFootNote() {
  return <p className="auth-footnote">{PRODUCT_DESCRIPTOR} · T3 Vakfı</p>;
}
