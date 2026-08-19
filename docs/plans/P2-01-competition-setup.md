# P2-01 — Yarışma Kurulumu ve Yapılandırma

## Kapsam ve sonuç

Bu kilometre taşı, kimliği doğrulanmış kullanıcının yarışma oluşturmasını ve yarışma
yöneticisinin yarışma bilgileri → kategoriler → yapısal şablon → rubrik/kriterler → hazırlık
akışını tamamlamasını sağlar. Yeni ürün yüzeyi `/app` ve
`/app/competitions/:competitionId/setup` rotalarındadır.

Başvuru yükleme, R2, PDF çıkarımı, AI/OpenAI, benzerlik, hakem atama/çalışma alanı,
değerlendirme, geri bildirim, global yönetim ve deployment kapsam dışıdır.

## Bootstrap ve yetkilendirme

- Oturumsuz yarışma oluşturma `401`.
- Her authenticated kullanıcı MVP kapsamında yarışma oluşturabilir.
- Yarışma + kurucu `COMPETITION_MANAGER` üyeliği atomik D1 batch işlemidir.
- Diğer yapılandırma uçları mevcut `competition:configure` iznini gerektirir.
- `EVALUATION_MANAGER`, `REVIEWER`, `CONTESTANT` ve başka yarışmanın yöneticisi `403` alır.
- Nested kaynaklar yarışma sahipliğiyle birlikte sorgulanır; çapraz kaynak kimlikleri `404` olur.

## API

- `POST /api/v1/competitions`
- `GET|PATCH /api/v1/competitions/:competitionId`
- `GET /api/v1/competitions/:competitionId/configuration`
- `GET|POST /api/v1/competitions/:competitionId/categories`
- `PATCH|DELETE /api/v1/competitions/:competitionId/categories/:categoryId`
- `GET|POST /api/v1/competitions/:competitionId/templates`
- `PATCH /api/v1/competitions/:competitionId/templates/:templateVersionId`
- `POST /api/v1/competitions/:competitionId/templates/:templateVersionId/activate`
- `GET|POST /api/v1/competitions/:competitionId/rubrics`
- `PATCH /api/v1/competitions/:competitionId/rubrics/:rubricVersionId`
- `PUT /api/v1/competitions/:competitionId/rubrics/:rubricVersionId/criteria`
- `POST /api/v1/competitions/:competitionId/rubrics/:rubricVersionId/activate`

Runtime girdiler paylaşılan Zod şemalarıyla doğrulanır. Hatalar `UNAUTHORIZED`, `FORBIDDEN`,
`NOT_FOUND`, `VALIDATION_ERROR` veya `CONFLICT` sınıflarına çevrilir; SQL/Drizzle/D1 ayrıntısı
dönmez.

## Veri ve yaşam döngüsü

- Competition: `description` eklendi; global benzersiz slug korunur.
- Category: `guidance` eklendi; `competition_id + code` benzersizliği korunur.
- TemplateVersion: doğrulanmış structural profile, `updated_at`, tek aktif kısmi indeks.
- RubricVersion: `updated_at`, tek aktif kısmi indeks.
- Criterion: kanıt beklentisi ve `updated_at`; rubrik içi kod benzersizliği korunur.
- Şablon/rubrik yaşam döngüsü `DRAFT → ACTIVE → RETIRED`; aktif/emekli sürümler değişmez.
- Kriter listesi toplu ve atomik değiştirilir.
- Hazırlık mevcut yapılandırmadan türetilir, saklanmaz.

## Migration

Drizzle üreticisinin aynı tablo yeniden kurulumunda yeni sütuna erken başvuran geçersiz tek
migration çıktısı tutulmamış ve elle düzeltilmemiştir. Değişiklikler yalnız üretici araçla iki
güvenli adıma ayrılmıştır:

- `0003_bright_tarantula.sql`: yeni alanlar
- `0004_spooky_green_goblin.sql`: sürüm CHECK'leri ve tek aktif kısmi indeksler

`0000`, `0001` ve `0002` değiştirilmez. Yalnız yerel D1 migration/smoke çalıştırılır.

## Test yaklaşımı

- Paylaşılan sözleşme: benzersiz bölüm/kriter kodları, deterministik sıra, readiness.
- API: authentication, manager yetkisi, rol retleri, çapraz yarışma ve nested izolasyon,
  lifecycle/aktivasyon hataları, güvenli hata sözleşmeleri.
- SQLite migration entegrasyonu: temiz zincir, unique/CHECK/FK, atomik bootstrap geri alma,
  tek aktif sürüm, kriter listesi rollback.
- Yerel D1 smoke: sağlık, oturumsuz korunan uçlar ve migration listesi.
- UI: loading/empty/error/saved durumları; draft editörleri; aktif sürüm salt-okunur görünümü;
  erişilebilir label, focus, metinli badge ve klavye kullanılabilir sıralama kontrolleri.

## Ertelenenler

Yetkili şablon dosyası ve R2 P2-02'ye; başvuru/PDF/AI/benzerlik/değerlendirme/hakem/geri bildirim
akışları sonraki kilometre taşlarına ertelenmiştir. Uzak kaynak, uzak migration ve deployment
yapılmaz.
