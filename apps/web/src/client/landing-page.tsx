import { Link } from "react-router";

import {
  AI_CAPABILITY_NAME,
  AI_CAPABILITY_SUPPORT,
  PRODUCT_DESCRIPTOR,
  PRODUCT_NAME,
} from "./product-copy";
import { BrandWordmark } from "./ui";

const CONTROLS = [
  { title: "Dil", description: "Rapor dili beklenen yarışma diliyle karşılaştırılır." },
  { title: "Rapor Formatı", description: "Resmî formatın zorunlu bölümleri denetlenir." },
  { title: "Başlık & İçerik", description: "Her bölümün içeriği beklentilerle karşılaştırılır." },
  { title: "Kategori", description: "Projenin seçilen kategoriyle uyumu değerlendirilir." },
  { title: "Benzerlik", description: "Yarışma içi raporlar arasında benzerlik sinyali aranır." },
  { title: "AI Rubrik", description: "Rubrik için kanıta bağlı bir puan önerisi hazırlanır." },
] as const;

const WORKFLOW_STEPS = [
  {
    title: "Yarışmayı kurun",
    description: "Kategoriler, rapor formatı ve rubrik tek akışta hazırlanır.",
  },
  { title: "Başvuruyu analiz edin", description: "Her rapor altı kontrolle otomatik taranır." },
  {
    title: "Hakem kanıtlarla değerlendirir",
    description: "Her sinyal rapor sayfasına bağlanır; hakem kanıtı yerinde doğrular.",
  },
  {
    title: "Yarışmacı geri bildirim alır",
    description: "Sonuç, yönetici onayıyla kontrollü biçimde yayımlanır.",
  },
] as const;

const TRUST_SIGNALS = [
  {
    title: "Kanıta bağlı bulgular",
    description: "Her dikkat sinyali doğrulanmış bir rapor sayfasına gider.",
  },
  {
    title: "İnsan onaylı nihai değerlendirme",
    description: "AI önerir; puanı ve kararı yalnız uzman hakem verir.",
  },
  {
    title: "Sürüm sabitlemeli değerlendirme",
    description: "Analiz, o anda kullanımdaki format ve rubrik sürümüne kilitlenir.",
  },
  {
    title: "Özel doküman erişimi",
    description: "Raporlar yetkili oturumla açılır; kalıcı genel bağlantı üretilmez.",
  },
] as const;

/** Simplified, same-system preview of the reviewer workspace. */
export function ProductPreview() {
  return (
    <div aria-hidden="true" className="product-preview">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2 text-[10px]">
        <span className="text-ink-subtle">← Atamalarım</span>
        <span className="font-mono font-semibold text-ink">A-042</span>
        <span className="font-semibold text-ink">AquaSense</span>
        <span className="metric-chip">Tarım Teknolojileri</span>
        <span className="status-chip status-chip-info">Taslak kaydedildi</span>
      </div>
      <div className="grid grid-cols-[1.15fr_0.9fr_0.95fr] divide-x divide-line text-[10px] leading-4">
        <div className="bg-surface-raised p-3">
          <p className="text-[10px] font-semibold text-ink">Rapor</p>
          <div className="mt-2 rounded-md border border-line bg-surface p-2">
            <div className="space-y-1.5">
              <div className="h-1.5 w-10/12 rounded bg-line" />
              <div className="h-1.5 w-full rounded bg-line" />
              <div className="h-1.5 w-8/12 rounded bg-line" />
              <div className="mt-2 h-8 rounded bg-surface-selected px-1.5 py-1 text-[9px] text-brand-deep">
                “…toprak nemi eşik değeri 18 saat içinde doğrulandı.”
              </div>
              <div className="h-1.5 w-9/12 rounded bg-line" />
              <div className="h-1.5 w-7/12 rounded bg-line" />
            </div>
            <p className="mt-2 text-[9px] text-ink-subtle">Sayfa 7 / 12</p>
          </div>
        </div>
        <div className="p-3">
          <p className="text-[10px] font-semibold text-ink">{AI_CAPABILITY_NAME}</p>
          <p className="mt-0.5 text-[9px] text-ink-subtle">{AI_CAPABILITY_SUPPORT}</p>
          <div className="mt-2 space-y-1.5">
            <p className="flex justify-between text-ink-muted">
              Dil <span className="status-chip status-chip-pass">Uygun</span>
            </p>
            <p className="flex justify-between text-ink-muted">
              Format <span className="status-chip status-chip-pass">Uygun</span>
            </p>
            <p className="flex justify-between text-warning-ink">
              Benzerlik <span className="status-chip status-chip-warn">İncelenmeli</span>
            </p>
            <p className="rounded-md bg-surface-raised px-1.5 py-1 text-[9px] text-brand-deep">
              Kanıt · Sayfa 7
            </p>
          </div>
        </div>
        <div className="p-3">
          <p className="text-[10px] font-semibold text-ink">Hakem Kararı</p>
          <p className="mt-2 text-[9px] font-medium text-ink">Problem Tanımı · 10 puan</p>
          <p className="mt-1 text-[9px] text-ink-subtle">AI önerisi 6 / 10 · Kanıt gücü: Orta</p>
          <p className="mt-2 text-[13px] font-semibold tabular-nums text-ink">Hakem 8 / 10</p>
          <p className="mt-2 text-[9px] text-ink-muted">AI 6 · Hakem 8 · Fark +2</p>
          <p className="mt-1 text-[9px] font-medium text-brand-deep">AI'DAN FARKLI</p>
        </div>
      </div>
    </div>
  );
}

export function LandingPage() {
  return (
    <div className="min-h-screen bg-canvas">
      <a className="sr-only" href="#icerik">
        İçeriğe geç
      </a>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <BrandWordmark to="/" />
          <Link className="primary-button" to="/login">
            Platforma giriş
          </Link>
        </div>
      </header>

      <main id="icerik">
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-14 sm:px-8 lg:grid-cols-[1fr_1.05fr] lg:py-20">
          <div>
            <h1 className="text-4xl font-semibold tracking-tight text-balance text-ink sm:text-5xl lg:text-[3.5rem] lg:leading-[1.08]">
              Kanıta dayalı değerlendirme.
              <span className="mt-1 block text-brand-deep">İnsan kontrolünde.</span>
            </h1>
            <p className="mt-5 max-w-xl text-[16px] leading-7 text-ink-muted">
              Rapor kontrollerini, benzerlik analizini ve kriter bazlı AI önerilerini tek
              değerlendirme çalışma alanında birleştirin. Her bulgu kanıta bağlanır; nihai karar
              uzman hakemde kalır.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link className="primary-button px-5" to="/login">
                Platforma giriş
              </Link>
              <a className="secondary-button px-5" href="#nasil-calisir">
                Nasıl çalışır?
              </a>
            </div>
          </div>
          <ProductPreview />
        </section>

        <section aria-labelledby="controls-title" className="border-t border-line bg-surface">
          <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
            <p className="text-[13px] font-medium text-brand">{AI_CAPABILITY_NAME}</p>
            <h2
              className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl"
              id="controls-title"
            >
              Altı kontrol, tek çalışma alanı
            </h2>
            <p className="page-lead">
              Her başvuru aynı denetimlerden geçer. Dikkat gerektiren bulgular, rapor sayfasına
              bağlı kanıtla hakeme sunulur.
            </p>
            <ol className="mt-8 grid border-t border-line sm:grid-cols-2 lg:grid-cols-3">
              {CONTROLS.map((control, index) => (
                <li
                  className="border-b border-line py-5 pr-6 sm:odd:pr-8 sm:even:pl-8 lg:[&:nth-child(3n)]:pr-0 lg:[&:nth-child(3n+1)]:pl-0 lg:[&:nth-child(3n+2)]:px-8"
                  key={control.title}
                >
                  <p className="text-[12px] font-medium tabular-nums text-ink-subtle">
                    {String(index + 1).padStart(2, "0")}
                  </p>
                  <h3 className="mt-2 text-[15px] font-semibold text-ink">{control.title}</h3>
                  <p className="mt-1.5 text-sm leading-6 text-ink-muted">{control.description}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section
          aria-labelledby="workflow-title"
          className="border-t border-line"
          id="nasil-calisir"
        >
          <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
            <h2
              className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl"
              id="workflow-title"
            >
              Kurulumdan geri bildirime
            </h2>
            <ol className="mt-8 grid gap-8 md:grid-cols-2 lg:grid-cols-4">
              {WORKFLOW_STEPS.map((step, index) => (
                <li key={step.title}>
                  <p className="text-[12px] font-medium tabular-nums text-ink-subtle">
                    {String(index + 1).padStart(2, "0")}
                  </p>
                  <h3 className="mt-2 text-[15px] font-semibold text-ink">{step.title}</h3>
                  <p className="mt-1.5 text-sm leading-6 text-ink-muted">{step.description}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section aria-labelledby="human-title" className="border-t border-line bg-surface">
          <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
            <h2
              className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl"
              id="human-title"
            >
              AI karar vermez. Kanıt sunar.
            </h2>
            <p className="page-lead">
              Hiçbir analiz bulgusu tek başına eleme, intihal kararı veya nihai puan üretmez.
            </p>
            <ul className="mt-8 grid gap-x-10 gap-y-6 sm:grid-cols-2">
              {TRUST_SIGNALS.map((signal) => (
                <li key={signal.title}>
                  <h3 className="text-[15px] font-semibold text-ink">{signal.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-ink-muted">{signal.description}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-4 px-5 py-8 sm:px-8">
          <div>
            <p className="text-sm font-semibold tracking-tight text-ink">{PRODUCT_NAME}</p>
            <p className="mt-0.5 text-xs text-ink-subtle">{PRODUCT_DESCRIPTOR}</p>
          </div>
          <p className="text-xs text-ink-subtle">T3 Vakfı</p>
        </div>
      </footer>
    </div>
  );
}
