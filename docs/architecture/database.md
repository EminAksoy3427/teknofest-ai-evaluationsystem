# Veritabanı Mimarisi

## Neden D1 ve ilişkisel model

D1, mevcut Cloudflare Worker dağıtım sınırıyla aynı platformda çalışan SQLite uyumlu,
migration odaklı bir kalıcılık katmanı sağladığı için seçilmiştir. Yarışma tanımları; sürüm,
benzersizlik ve ebeveyn-çocuk bütünlüğü gerektirir. Bu kurallar JSON blob'larında uygulama
koduna dağılmak yerine foreign key, unique, index ve check constraint'leriyle veritabanında
korunur. JSON, çekirdek ilişkilerin yerine kullanılmaz.

## Sınır ve bağlama

İlişkisel kalıcılık Cloudflare D1 üzerinde, `packages/db` sınırı içinde uygulanır. Worker,
`DB` adlı `D1Database` binding'ini `createDb(binding)` fabrikasına verir. Uygulama veya
arayüz katmanı doğrudan bağlantı yapılandırması taşımaz.

`apps/web/wrangler.jsonc` içindeki veritabanı adı `teknofest-ai-evaluationsystem-db`'dir.
`database_id`, uzak kaynak oluşturulmadığı bu aşamada yalnız yerel geliştirme için all-zero
UUID yer tutucusudur. Depodaki migration komutları açıkça `--local` kullanır ve deneysel
otomatik kaynak oluşturmayı kapatır.

## Şema kararları

- Kimlikler uygulamada `crypto.randomUUID()` gibi bir üreticiyle oluşturulan `TEXT`
  değerleridir; veritabanı kimlik üretmez.
- Zaman damgaları Unix epoch milisaniyesi olarak `INTEGER` sütunlarda tutulur.
- Yarışma durumları `DRAFT`, `ACTIVE`, `ARCHIVED`; yapılandırma sürümleri ise `DRAFT`,
  `ACTIVE`, `RETIRED` semantiğini kullanır. P1-01'den kalabilecek `ARCHIVED` sürüm satırları
  migration uyumluluğu için veritabanında okunabilir, uygulama API'sinde `RETIRED` olarak
  projekte edilir ve yeni yazılmaz. Uygulama semantiğinin kaynağı
  `packages/shared/src/status.ts`, veritabanı koruması ise `CHECK` constraint'leridir.
- Veritabanı adları `snake_case`, TypeScript alanları `camelCase` biçimindedir.
- `expected_language` varsayılanı mevcut Türkçe ürün bağlamı için `tr` değeridir.
- `weight_basis_points` tam sayıdır ve `0..10000` aralığıyla sınırlandırılır.

İlişkiler ve silme davranışı:

```text
Competition
 ├── Category
 ├── TemplateVersion
 ├── RubricVersion
 │    └── Criterion
 └── CompetitionMember ── User (Better Auth)
```

- `competition` → `category`: `ON DELETE CASCADE`
- `competition` → `template_version`: `ON DELETE CASCADE`
- `competition` → `rubric_version`: `ON DELETE CASCADE`
- `rubric_version` → `criterion`: `ON DELETE CASCADE`
- `competition` → `competition_member`: `ON DELETE CASCADE`
- `user` → `competition_member`: `ON DELETE CASCADE`

Doğal iş anahtarları için yarışma slug'ı, yarışma içindeki kategori kodu, yarışma içindeki
şablon/rubrik sürüm numarası ve rubrik içindeki ölçüt kodu benzersizdir. Tüm foreign key
sütunlarında sorgu indeksleri bulunur. Pozitif sürüm numarası ve puan ile negatif olmayan
sıralama değerleri `CHECK` constraint'leriyle korunur.

Şablon ve rubrik tanımları yarışma içinde artan `version_number` ile ayrı satırlarda
sürümlenir. Yarışma başına yalnız bir `ACTIVE` şablon ve rubrik sürümüne kısmi benzersiz
indeks izin verir. Aktivasyon, önceki aktifi `RETIRED` yapıp hedef taslağı etkinleştiren atomik
D1 batch işlemidir. Şablon yapısal profili, paylaşılan Zod sözleşmesiyle doğrulanan JSON metni
olarak kalıcılık sınırında serileştirilir; parse/stringify route veya UI'a dağılmaz.

## Migration iş akışı

Şema `packages/db/src/schema` altında tanımlanır. Seçili kararlı Drizzle Kit sürümünün
ürettiği gerçek çıktı düzeni şöyledir:

```text
packages/db/migrations/*.sql
packages/db/migrations/meta/*
```

Bu nedenle Wrangler yalnız `migrations_dir` kullanır; özel bir `migrations_pattern`
tanımlanmamıştır. SQL ve metadata dosyaları elle oluşturulmaz veya düzenlenmez.

Depo kökünden kullanılan komutlar:

```bash
pnpm db:generate
pnpm db:migrations:list:local
pnpm db:migrate:local
pnpm cf:typegen
```

Migration zinciri P1-01 domain, P1-02 Better Auth ve P1-03 yarışma üyeliği sırasını korur.
`competition_member`, kullanıcı/yarışma çifti için tek satır tutar; rolü dört resmî değerle
sınırlayan `CHECK`, iki cascade foreign key ve üyelik sorgularına uygun indeksler içerir.

## Ertelenenler

Better Auth'ın ürettiği `user`, `session`, `account` ve `verification` tabloları P1-02'de bu
kalıcılık sınırına eklenmiştir. Auth kullanıcısı yarışma üyeliklerinin kimlik köküdür; rol
doğrudan kullanıcıya yazılmaz.

Uzak D1 oluşturma/uygulama, production dağıtımı, kalıcı seed verisi, iş düzeyi dar
yetkilendirme kontrolleri, başvurular, değerlendirmeler, yapay zekâ ve R2 bu temelin
kapsamında değildir.
