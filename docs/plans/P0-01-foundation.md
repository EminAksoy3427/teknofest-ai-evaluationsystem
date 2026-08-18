# P0-01 — Foundation

## Kapsam

pnpm monorepo, React SPA, React Router, Cloudflare Vite/Worker çalışma sınırı, Hono
`/api/v1` API'si, ortak Zod sözleşmesi, TypeScript strict ayarları ve kalite kapıları.

## Kararlar

- Dashboard odaklı ürün istemci tarafı SPA olarak başlatıldı; runtime SSR bilinçli olarak yoktur.
- İstemci varlıkları ve Hono API tek Cloudflare Worker dağıtım sınırında birleşir.
- `/api/v1/health` sözleşmesi `@teknofest-ai/shared` içinde doğrulanır.
- Biome tek araçla temel lint ve deterministik format kontrolü sağlar.
- Proje Node.js 24.19.0 LTS ve pnpm 11.22.0 sürümlerine sabitlenmiştir.
- `ui`, `db`, `ai` ve `config` paketlerinde gerçek ihtiyaç oluşmadan runtime soyutlaması kurulmamıştır.
- pnpm 11 güvenlik modeli için yalnız Vite/Cloudflare'ın ihtiyaç duyduğu `esbuild` ve `workerd`
  kurulum betikleri açıkça izinli kılınmıştır; genel bir betik izni verilmemiştir.

## Seçilen teknolojiler ve tam sürümler

| Paket | Sürüm |
| --- | --- |
| Node.js (hedef LTS) | 24.19.0 |
| pnpm | 11.22.0 |
| @cloudflare/vite-plugin | 1.53.0 |
| wrangler | 4.124.0 |
| Vite | 8.2.1 |
| @vitejs/plugin-react | 6.0.5 |
| React / React DOM | 19.2.8 |
| React Router | 8.3.0 |
| Hono | 4.13.3 |
| Tailwind CSS / @tailwindcss/vite | 4.3.3 |
| TypeScript | 7.0.2 |
| Zod | 4.4.3 |
| Vitest | 4.1.11 |
| Biome | 2.5.9 |

React tip paketleri `@types/react@19.2.18` ve `@types/react-dom@19.2.4` olarak sabitlenmiştir.

## Komutlar

```bash
pnpm install
pnpm dev
pnpm typecheck
pnpm test
pnpm lint
pnpm build
```

## Mimari sınırlar

- `apps/web`: istemci, API ve Cloudflare dağıtımı
- `packages/shared`: framework bağımsız doğrulanmış sözleşmeler
- `packages/ui`: gelecekteki görsel sistem; iş mantığı yok
- `packages/db`: gelecekteki Drizzle/D1 kalıcılığı
- `packages/ai`: gelecekteki sağlayıcı ve yapılandırılmış yapay zekâ çıktıları
- `packages/config`: yalnız gerçek ortak ihtiyaçlar

## Bilinçli olarak ertelenenler

Kimlik doğrulama/OAuth, veritabanı şeması ve migration, D1/R2, OpenAI, başvuru,
yarışma, rubrik ve hakem işlevleri, benzerlik analizi, Vectorize ve Workflows.

## Doğrulama

18 Ağustos 2026 tarihinde depo kökünden aşağıdaki doğrulamalar tamamlandı:

- `pnpm typecheck`: PASS
- `pnpm test`: PASS — ortak sözleşmede 2, Hono health rotasında 1 test
- `pnpm lint`: PASS
- `pnpm build`: PASS
- Frontend smoke test: PASS — HTTP 200, beklenen başlık ve durum görünür, browser console temiz
- `GET /api/v1/health`: PASS — `{"status":"ok","service":"teknofest-ai-evaluationsystem","version":1}`
- `git diff --check`: PASS
- Paket hijyeni: yalnız `pnpm-lock.yaml` mevcut; secret veya ek lockfile bulunmadı

Yerel makinede Corepack ve bir Node sürüm yöneticisi bulunmuyordu. Proje Node.js 24.19.0
LTS'e sabitlenmiş olmasına rağmen doğrulamalar makinede kurulu Node.js 25.8.1 ile de başarıyla
tamamlandı; pnpm beklenen engine uyarısını gösterdi.
