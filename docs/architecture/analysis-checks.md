# AnalysisCheck Mimarisi

## Semantik kontroller

`SECTION_CONTENT`, sabitlenmiş şablon profilindeki başlıklarla deterministik segmentlenen bölüm
gövdelerini tek toplu çağrıda değerlendirir. `SUPPORTED/PARTIAL/NOT_SUPPORTED/NOT_EVALUATED`
sonuçları aggregate `PASS/WARN/FAIL` politikasına girer; eksik başlığın başarısızlığı
`SECTION_PRESENCE` kontrolünde kalır. Örnekleme veya zayıf kanıt güçlü sonucu engeller.

`CATEGORY_FIT`, yalnız sabitlenmiş kategori snapshot'ına karşı `ALIGNED/REVIEW/MISALIGNED`
üretir ve bunları `PASS/WARN/FAIL` sinyaline eşler. `FAIL` nihai ret değildir ve kategori mutasyonu
yoktur. Her normal UI kanıtı sayfa kimliği ve ihtiyatlı birebir normalize alıntıyla sunucuda
doğrulanır. Sayısal confidence, chain-of-thought, tam belge veya ham sağlayıcı cevabı saklanmaz.

## Benzerlik kontrolü

`SIMILARITY`, bounded aynı-yarışma adayları üzerinde çalışan deterministik inceleme sinyalidir.
`LOW` sonucu `PASS`, `MEDIUM/HIGH` sonucu `WARN` olur; benzerlik bir politika ihlali veya intihal
kararı olmadığı için `FAIL` üretilmez. İki taraflı bounded alıntılar doğrudan doğrulanmış extraction
artifact'inden gelir ve sayfa kimliğini korur. P4-01A yalnız `LEXICAL_ONLY` production modundadır.

## Durum ayrımı

`AnalysisRun.status`, analiz mekanizmasının yaşam döngüsüdür: `QUEUED`, `PROCESSING`,
`SUCCEEDED`, `FAILED`. `AnalysisCheck.status` ise çalıştırılmış bir iş kontrolünün bulgusudur:
`PASS`, `WARN`, `FAIL`. Bu nedenle aşağıdaki durum geçerli ve beklenendir:

```text
AnalysisRun SUCCEEDED
├── LANGUAGE FAIL
├── SECTION_PRESENCE FAIL
└── TEMPLATE_STRUCTURE FAIL
```

Koşu ancak artifact'in bulunamaması/doğrulanamaması, sabitlenmiş şablonun beklenmedik biçimde
bulunmaması, algılayıcı runtime hatası veya kontrol kalıcılığı hatası gibi operasyonel nedenlerle
`FAILED` olur.

## Güven sınırı ve sözleşmeler

Kontroller istemciden kabul edilmez; yalnız Workflow içindeki güvenilir sunucu kodu üretir.
Geçerli türler paylaşılan runtime Zod sözleşmesinde kapalıdır. Her türün ayrımlı detay şeması
vardır ve JSON hem yazım hem okuma sınırında doğrulanır. DB'de tür sütununun CHECK constraint'i
olmaması gelecekteki güvenilir tür eklemelerinde tablo rebuild zorunluluğunu kaldırır; bu karar
keyfî istemci türüne izin vermez.

## İdempotency ve veri minimizasyonu

`(analysis_run_id, type)` benzersizdir. Workflow retry aynı mantıksal satırı upsert eder; yeni
koşu, artifact veya yinelenen başlık bulgusu üretmez. Başlık kanıtı 160 karakter ve bölüm başına
beş oluşumla sınırlıdır. Tam rapor metni yalnız özel R2 artifact'inde kalır.

## Uygulanan kapsam

- `LANGUAGE`: bounded sayfa örnekleriyle baskın dil ve karma/seyrek sinyali
- `SECTION_PRESENCE`: yapılandırılmış başlığın varlığı ve sayfa kanıtı
- `TEMPLATE_STRUCTURE`: zorunlu başlık, sıra, tekrar ve çıkarım uyarılarının aggregate sonucu
- `SECTION_CONTENT`: bölüm gövdesi için kanıta dayalı semantik sinyal
- `CATEGORY_FIT`: sabitlenmiş kategori snapshot'ına karşı semantik sinyal
- `SIMILARITY`: canonical aynı-yarışma çiftlerinde review-only lexical sinyal
- `RUBRIC_EVALUATION`: sabitlenmiş `RubricVersion` kriterlerine karşı kanıta dayalı AI puan önerisi
  ve bundan türetilen deterministik geliştirme geri bildirimi; ayrıntılar
  `docs/architecture/rubric-evaluation.md` içindedir

Başlık varlığı semantik içerik uygunluğu değildir. Diğer Problem 4 kontrolleri (hakem çalışma
alanı, risk kuyruğu) sonraki milestone'lara ertelenmiştir.
