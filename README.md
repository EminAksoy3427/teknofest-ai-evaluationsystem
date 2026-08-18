# TEKNOFEST AI Evaluation System

T3 Vakfı Yapay Zekâ Creathonu Problem 4 için geliştirilen, TEKNOFEST yarışma
raporlarının değerlendirilmesini destekleyecek üretim odaklı platform.

> Yapay zekâ hakemin yerine karar vermiyor; hakemin daha hızlı, tutarlı,
> açıklanabilir ve kanıta dayalı karar vermesini sağlıyor.

## Durum

Proje **Foundation (P0-01)** aşamasındadır. React SPA, sürümlenmiş Hono API sınırı,
Cloudflare Worker çalışma modeli ve ortak TypeScript sözleşmeleri kurulmuştur. Kimlik
doğrulama, veri modeli, dosya yükleme ve yapay zekâ işlevleri henüz uygulanmamıştır.

## Mimari

- `apps/web`: React + React Router SPA, `/api/v1` Hono API ve Cloudflare Worker dağıtım sınırı
- `packages/shared`: Framework bağımsız sözleşmeler ve şemalar
- `packages/ui`: Gelecekteki ortak arayüz bileşenleri ve tasarım tokenları
- `packages/db`, `packages/ai`, `packages/config`: Sonraki fazlar için bilinçli olarak boş bırakılan sınırlar

Ayrıntılar için [ARCHITECTURE.md](./ARCHITECTURE.md) dosyasına bakın.

## Gereksinimler

- Node.js 24.19.0 LTS
- pnpm 11.22.0

## Yerel geliştirme

```bash
pnpm install
pnpm dev
```

Uygulama varsayılan olarak Vite'ın bildirdiği yerel adreste açılır. API sağlık kontrolü:

```text
GET /api/v1/health
```

## Kalite komutları

```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm build
```
