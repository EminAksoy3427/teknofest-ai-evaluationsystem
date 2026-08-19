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

## P3-01 kapsamı

- `LANGUAGE`: bounded sayfa örnekleriyle baskın dil ve karma/seyrek sinyali
- `SECTION_PRESENCE`: yapılandırılmış başlığın varlığı ve sayfa kanıtı
- `TEMPLATE_STRUCTURE`: zorunlu başlık, sıra, tekrar ve çıkarım uyarılarının aggregate sonucu

Başlık varlığı semantik içerik uygunluğu değildir. Bölüm içeriği, kategori uyumu, benzerlik,
rubrik yapay zekâsı ve diğer Problem 4 kontrolleri sonraki milestone'lara ertelenmiştir.
