# P1-01 — D1 ve Drizzle Veritabanı Temeli

## Amaç

P0-01 mimarisini bozmadan, ürünün sonraki zorunlu MVP adımlarına hizmet edecek yerel
öncelikli ve üretim yönelimli ilişkisel kalıcılık temelini kurmak.

## Tamamlanan kapsam

- [x] Kararlı `drizzle-orm` ve `drizzle-kit` sürümlerini sabitleme
- [x] `DB` D1 binding'i ve Wrangler üretimli Worker tipleri
- [x] `createDb(binding)` ile tipli Drizzle D1 erişimi
- [x] Competition, Category, TemplateVersion, RubricVersion ve Criterion şemaları
- [x] Uygulama üretimli text kimlik, integer timestamp ve durum semantiği kararları
- [x] Foreign key, cascade, unique, index ve check constraint'leri
- [x] Üretici araçla ilk migration oluşturma
- [x] Yalnız yerel migration listeleme ve uygulama scriptleri
- [x] Değişmeyen `/api/v1/health` yanında sorgu yapan `/api/v1/health/db`
- [x] Ortak Zod durum ve D1 health sözleşmeleri
- [x] Yerel tablo, örnek grafik, constraint ve cleanup doğrulaması

## Sürümler ve kararlar

- `drizzle-orm`: `0.45.2` (kararlı D1 adaptörü)
- `drizzle-kit`: `0.31.10` (kararlı şema tabanlı migration üretimi)
- `@cloudflare/workers-types`: `5.20260818.1` (veritabanı paketinin bağımsız tip kontrolü)
- Binding: `DB`; yerel veritabanı adı: `teknofest-ai-evaluationsystem-db`
- Uygulama üretimli `TEXT` UUID, epoch-milisaniye `INTEGER` timestamp ve ilişkisel şema
- Tutarlı `ON DELETE CASCADE`; aktif sürüm foreign key'i veya yayınlama iş akışı yok

Üretilen migration yolu:

```text
packages/db/migrations/0000_tearful_the_liberteens.sql
packages/db/migrations/meta/*
```

Kök komutlar:

```bash
pnpm db:generate
pnpm db:migrations:list:local
pnpm db:migrate:local
pnpm cf:typegen
```

## Doğrulama özeti

Drizzle Kit `0.31.10`, ilk SQL dosyasını düz `migrations/*.sql` düzeninde ve ilgili
`meta` dosyalarıyla üretti. Wrangler migration'ı `DB` binding'inin yerel durumuna uyguladı.
Beş tabloluk geçici kayıt grafiği başarıyla oluşturuldu; yinelenen yarışma slug'ı
`SQLITE_CONSTRAINT_UNIQUE` ile reddedildi. Kök yarışma silindiğinde tüm alt kayıtlar cascade
ile silindi ve hiçbir smoke kaydı kalmadı.

Mevcut Vitest/Cloudflare yapısına özel bir D1 test havuzu eklemek bu aşama için orantısız
kurulum getirecekti. Bu nedenle paylaşılan saf sözleşmeler unit testlerle, gerçek migration ve
constraint davranışı ise Wrangler yerel D1 smoke akışıyla doğrulandı.

## Ortam notu

Depo Node `24.19.0` hedefliyor; doğrulamalar mevcut Node `25.8.1` ortamında başarıyla
çalıştı. İşletim sistemi veya Node kurulumu değiştirilmedi.

## Bilinçli olarak ertelenenler

Uzak D1 kaynağı veya migration, Cloudflare dağıtımı, auth/RBAC/kullanıcılar, başvurular,
değerlendirmeler, hakem akışları, kalıcı seed, R2 ve yapay zekâ özellikleri dahil değildir.
