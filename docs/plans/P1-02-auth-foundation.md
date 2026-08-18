# P1-02 — Better Auth ve Google OAuth Temeli

## Kapsam

Google-only Better Auth entegrasyonu, D1 auth şeması, sunucu oturum çözümleme, güvenli
`/api/v1/me` projeksiyonu ve asgari Türkçe giriş/çıkış durumu. Yarışma yetkilendirmesi yoktur.

## Sürümler ve adaptör

- `better-auth`: `1.7.0` (registry `latest`, kararlı)
- Drizzle adaptörü: `better-auth/adapters/drizzle`, Better Auth `1.7.0` içinde
- Şema CLI: `auth@1.7.0`
- Mevcut `drizzle-orm@0.45.2` ve `drizzle-kit@0.31.10` korunur

Better Auth CLI, `packages/db/src/schema/auth.ts` dosyasını üretir. Dosya elle yazılmaz;
Drizzle Kit bu şemadan ikinci SQL migration'ını üretir.

## Veritabanı

Eklenen Better Auth tabloları:

- `user`
- `session`
- `account`
- `verification`

Migration: `packages/db/migrations/0001_perpetual_venus.sql`

P1-01 `0000_tearful_the_liberteens.sql` migration'ı değiştirilmez veya squash edilmez.

Kök komutlar:

```bash
pnpm auth:schema:generate
pnpm db:generate
pnpm db:migrate:local
pnpm db:migrations:list:local
```

## HTTP ve Google yapılandırması

- Auth route: `/api/auth/*`
- Uygulama oturum görünümü: `GET /api/v1/me`
- Yerel base URL: `http://localhost:5173`
- Yerel callback: `http://localhost:5173/api/auth/callback/google`
- Env: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`

`apps/web/.dev.vars` bulunmadığı için gerçek Google OAuth smoke testi çalıştırılmadı. Manuel
credential kurulumu `docs/auth/google-oauth-setup.md` belgesinde açıklanır.

## Güvenlik kararları ve testler

- Email/password ve diğer sağlayıcılar kapalıdır.
- Örtük e-posta hesabı bağlama kapalı, farklı e-posta bağlama kapalıdır.
- OAuth tokenları şifreli saklanır; istemciye veya `/api/v1/me` yanıtına verilmez.
- Trusted origin yalnız tam yerel base URL'dir; wildcard ve CORS yoktur.
- Shared response şemaları, env doğrulaması, logged-out 401 ve safe-user projeksiyonu test edilir.
- Yerel migration ile önceki tabloların ve dört auth tablosunun varlığı doğrulanır.

## Ortam ve ertelenenler

Depo Node `24.19.0` hedefliyor; mevcut ortam Node `25.8.1` kullanıyor. İşletim sistemi veya
Node kurulumu değiştirilmez; tüm kapılar mevcut runtime ile çalıştırılır.

Yarışma kapsamlı RBAC P1-03'e; production Google callback/credential, deployment ve business
özellikleri sonraki açık görev kapsamlarına ertelenmiştir.
