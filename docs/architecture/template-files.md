# Resmî rapor şablonu dosyası

Bu belge P6.5A ile eklenen TemplateVersion resmî dosya modelini anlatır. P2-01 ile eklenen
yapısal profil modelini değiştirmez; onu tamamlar.

## 1. Model: dosya + profil birlikte

Bir `TemplateVersion` **hem** yarışmacılara verilecek resmî PDF şablonunu **hem de** analizin
kullandığı beklenen dil ve bölüm yapısını (yapısal profil) birlikte taşır. İkisi ayrı kavramlar
değildir: aynı sürüm kaydının iki yüzüdür ve birlikte etkinleşir.

`AnalysisRun` yalnız `TemplateVersion` kimliğini sabitlemeye devam eder (bkz.
`docs/architecture/analysis-pipeline.md`); resmî dosya eklenmesi bu tarihsel sabitleme modelini
değiştirmez.

## 2. Kalıcılık: mevcut alanların gerçek kullanımı

`template_version` tablosunun `storage_key` ve `sha256` sütunları P1-01'den itibaren rezerve
nullable sütunlar olarak vardı ve P6.5A öncesi hiç doldurulmadı (`ARCHITECTURE.md` bölüm 8'de
"Yetkili şablon dosyası R2 aşamasına ... ertelenmiştir" olarak belgelenmişti). P6.5A bu alanları
gerçek özel R2 nesne anahtarı ve içerik hash'i olarak kullanıma açar ve yanlarına görüntüleme
metadata'sı ekler: `original_filename`, `mime_type`, `size_bytes`, `etag`,
`file_uploaded_at`. Yeni bir tablo **eklenmemiştir**; mevcut alanların amacı gerçekleştirilmiştir.

`file_uploaded_at`, satırın genel `updated_at` alanından bilinçli olarak ayrıdır: `updated_at`
yalnız etiket veya profil düzenlemesinde de değişir, `file_uploaded_at` ise yalnız dosya
yüklendiğinde/değiştirildiğinde değişir. Bu ayrım, API'nin döndürdüğü dosya `createdAt`
zaman damgasının ilgisiz bir taslak düzenlemesiyle kaymamasını sağlar.

Altı dosya sütunu tümü-veya-hiçbiri kuralına tabidir (`template_version_file_all_or_nothing_check`):
bir DRAFT'ın henüz yüklenmiş dosyası yoksa altısı da null'dır; bir dosya yüklendiğinde altısı da
birlikte yazılır.

## 3. Etkinleştirme kapısı: dosya olmadan ACTİF olunamaz

Aktivasyon artık şu koşulların **tümünü** gerektirir:

1. sürüm DRAFT durumda olmalı,
2. yapısal profilde en az bir bölüm ve en az bir zorunlu bölüm olmalı (P2-01'den değişmedi),
3. **resmî şablon PDF'i yüklenmiş olmalı**,
4. (aşağıda açıklanan) başlık doğrulaması geçmeli.

Üçüncü kural bilinçli olarak veritabanı düzeyinde bir CHECK constraint DEĞİLDİR; yalnız
`activateTemplateVersion` (`packages/db/src/competition-configuration.ts`) uygulama katmanında
uygulanır. Bunun nedeni geriye dönük güvenliktir: P6.5A öncesi etkinleştirilmiş her
`TemplateVersion` dosyasız ACTİF durumdadır, ve tablo genelinde bir CHECK bu tarihsel satırları da
kapsardı — bu, tablo yeniden oluşturan herhangi bir gelecek migration'ı sonsuza dek bozardı.
`activateTemplateVersion` dosya alanlarını ACTİF yapan **tek** kod yoludur, dolayısıyla kapıyı
orada uygulamak yeterlidir ve bu geriye dönük riski taşımaz. Ayrıntı ve gerekçe doğrudan
`packages/db/src/schema/template-version.ts` ve `competition-configuration.ts` içindeki yorumlarda
belgelenmiştir; upgrade testi (`packages/db/scripts/p6-5a-schema.test.mjs`) P6 checkpoint'inden
tam olarak bu senaryoyu (dosyasız ACTİF eski satır) seçip upgrade sonrası değişmeden kaldığını
doğrular.

### Tarihsel uyumluluk, güncel yapılandırma değildir

Böyle bir eski satırın korunması onu geçerli **güncel** yapılandırma yapmaz. Ayrım açıktır:

- **Tarihsel:** eski satır olduğu gibi kalır (silinmez, otomatik emekliye ayrılmaz) ve ona
  sabitlenmiş eski `AnalysisRun` okunabilir olmayı sürdürür.
- **Güncel/yeni iş:** hazırlık projeksiyonu ayrı bir `activeTemplateFile` bayrağı taşır ve aktif
  şablonun resmî dosyası yoksa yarışma `ready` bildirilmez
  (`deriveConfigurationReadiness`, `packages/shared/src/competition-configuration.ts`). Yeni bir
  `AnalysisRun` oluşturma da aynı koşulu uygular: `createQueuedAnalysisRun`
  (`packages/db/src/analysis-run.ts`) yalnız `storage_key`i null olmayan ACTİF şablona sabitlenir,
  aksi hâlde denetimli `CONFIGURATION_NOT_READY` (`409 CONFLICT`) döner.

`activeTemplate` ve `activeTemplateFile` bilinçli olarak iki ayrı bayraktır: aktif şablon gerçekten
vardır ve bunu gizlemek yanıltıcı olurdu; eksik olan resmî dosyadır. Resmî dosyası olan bir v2
etkinleştirildiğinde hazırlık geri döner ve yeni koşular v2'ye sabitlenir; v1'e sabitlenmiş eski
koşular v1'de kalır. Regresyon kapsamı:
`apps/web/src/server/p6-5a-legacy-template-compliance.test.ts`.

## 4. Başlık doğrulaması: profil gerçek dosyayla eşleşiyor mu?

Aktivasyon isteği, önce `packages/db`'nin dosya/profil kontrollerinden geçer; ardından
`apps/web/src/server/competition-configuration-routes.ts` içindeki
`validateOfficialTemplateHeadings` fonksiyonu şunu kanıtlar: yapılandırılmış **her zorunlu bölüm
başlığı**, resmî dosyanın kendi çıkarılan metninde gerçekten bulunuyor mu?

Bu, P3-01'in submission'lara uyguladığı **aynı deterministik** başlık eşleştirme primitifini
(`evaluateSections`, `apps/web/src/server/analysis/structural-checks.ts`) ve **aynı** metin
çıkarım primitifini (`extractDocument`,
`apps/web/src/server/analysis/document-extraction.ts`) yeniden kullanır — pipeline mantığını
kopyalamaz. Çıkarım tamamen geçici ve bellek içidir: hiçbir `document-extraction/v1` artifact'i
R2'ye yazılmaz, hiçbir sahte `AnalysisCheck` satırı D1'e yazılmaz; sonuç yalnız aktivasyon isteğine
`400` veya başarı olarak döner.

Metin çıkarılamazsa (şifreli/bozuk PDF) doğrulama **sessizce atlanmaz**: aktivasyon açık bir
`VALIDATION_ERROR` ile reddedilir. Zorunlu bir başlık bulunamazsa hata mesajı hangi başlıkların
eksik olduğunu adlandırır.

Bu kontrol **byte, piksel veya düzen özdeşliği kanıtlamaz** — doldurulmuş bir yarışmacı raporu her
zaman boş resmî şablondan farklı olacaktır. Kanıtladığı tek şey: yapılandırılan yapısal profilin,
yüklenen resmî dosyanın gerçek bölüm yapısıyla örtüştüğüdür. Uygunluk modeli hâlâ üç parçadır:
sabitlenmiş `TemplateVersion` + onun yapısal profili + submission'ın kendi yapısal/içerik
kontrolleri (bkz. `docs/architecture/analysis-pipeline.md`).

## 5. Depolama: aynı özel R2 sınırı, yeni bir bucket değil

Resmî dosya, submission raporlarının kullandığı **aynı** özel `DOCUMENTS` R2 binding'ini kullanır
(`docs/architecture/document-storage.md`'deki disiplin burada da geçerlidir): özel bucket, sunucu
üretimli nesne anahtarı, public URL yok, her okuma Worker'da yeniden yetkilendirilir.

Nesne anahtarı şeması:

```text
competitions/{competitionId}/template-versions/{templateVersionId}/{fileId}/template.pdf
```

`fileId` her yükleme/değiştirmede yeniden üretilir, böylece aynı `TemplateVersion` için ardışık
yüklemeler her zaman farklı bir anahtara yazılır.

## 6. Yükleme güvenlik disiplini

Yükleme, submission PDF yüklemesiyle **aynı** doğrulama zincirini paylaşılan bir yardımcı
üzerinden kullanır (`apps/web/src/server/storage/pdf-upload.ts`): sınırlı akışlı gövde okuma
(`readBoundedBody`), gerçek `%PDF-` imza kontrolü ve sunucu tarafı SHA-256 (`validatePdfBytes`).
`submission-routes.ts` bu yardımcıyı kullanacak şekilde yeniden düzenlenmiştir; kopya doğrulama
mantığı kalmamıştır.

Sınır aynı `MAX_SUBMISSION_PDF_BYTES` (20 MiB) değeridir, `packages/shared`'da
`MAX_TEMPLATE_PDF_BYTES` adıyla yeniden dışa aktarılmıştır — iki farklı sınır, gerçek bir ürün
farkı olmadan keyfi bir ayrım olurdu.

Yükleme, submission raporundan farklı olarak `multipart/form-data` değil, ham `application/pdf`
gövdeli bir `PUT` isteğidir; orijinal dosya adı (isteğe bağlı) bir `?filename=` sorgu parametresiyle
taşınır ve aynı `normalizeDisplayFilename` sınırıyla temizlenir. Nesne anahtarı hiçbir zaman
istemciden gelmez; SHA-256 hiçbir zaman istemciden güvenilmez.

## 7. Değiştirme (replace) tutarlılığı

DRAFT bir sürümün dosyası değiştirilebilir. Sıra:

1. yeni bayt dizisi doğrulanır, SHA-256 hesaplanır,
2. yeni bayt dizisi **taze bir R2 anahtarına** yazılır (eski anahtar henüz silinmez),
3. D1 metadata'sı yeni anahtara güncellenir,
4. D1 yazımı **başarılı olduktan sonra** eski R2 nesnesi best-effort silinir.

D1 yazımı başarısız olursa, bu istekte yazılan yeni nesne best-effort silinir; eski nesne ve eski
metadata dokunulmadan kalır. Bu sıra, `docs/architecture/document-storage.md`'deki submission
raporu R2/D1 tutarlılık disiplinini birebir izler: dağıtık transaction yoktur, R2-önce yazım ve
D1 hatasında telafi vardır. Kaçınılmaz çökme penceresi aynıdır: Worker, D1 yazımından hemen sonra
fakat telafi çalışmadan çökerse teorik bir orphan R2 nesnesi kalabilir; bu iddia edilen bir
dağıtık transaction değildir.

ACTİF veya RETIRED bir sürümün dosyası değişmezdir; `putTemplateVersionFile` yalnız DRAFT durumunu
kabul eder.

## 8. API sözleşmesi

```text
PUT  /api/v1/competitions/:competitionId/templates/:templateVersionId/file
GET  /api/v1/competitions/:competitionId/templates/:templateVersionId/file
```

İkisi de yalnız `competition:configure` (COMPETITION_MANAGER) iznini kabul eder; diğer roller ve
başka bir yarışmanın yöneticisi bilgi sızdırmayan `403`/`404` alır. `GET`, dosyayı Worker üzerinden
stream eder; yanıt `private, no-store`'dur ve hiçbir R2 anahtarı veya public URL istemciye
verilmez.

`TemplateVersionResponse.file` alanı `null` (dosya yok) veya
`{ originalFilename, mimeType, sizeBytes, sha256, createdAt }`'tır — depolama anahtarı bu şekle
hiçbir zaman dahil değildir.

## 9. Arayüz

`apps/web/src/client/setup-page.tsx` içindeki `TemplateFileUploader`, Rapor Formatı
görevine eklenmiştir: DRAFT sürümde dosya seçme/yükleme/değiştirme, ACTİF/RETIRED sürümde salt
okunur dosya bilgisi ve korunan "Şablonu görüntüle" bağlantısı (submission raporu görüntülemeyle
aynı doğrudan-bağlantı deseni). "Yetkili dosya yükleme R2 aşamasına ertelenmiştir" ifadesi
kaldırılmış, yerine gerçek durumu anlatan metin yazılmıştır.
