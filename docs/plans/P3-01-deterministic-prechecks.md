# P3-01 — Deterministik Dil ve Yapısal Ön Kontroller

## Amaç

Sayfa koruyan `document-extraction/v1` artifact'ini, koşu oluşturulurken sabitlenmiş
TemplateVersion ile değerlendirip dil, şablon yapısı ve zorunlu başlık bulgularını güvenli,
tekrarlanabilir ve yöneticiye açıklanabilir hale getirmek.

## Uygulanan kapsam

- `AnalysisCheck` ortak kalıcılık modeli ve koşu/tür benzersizliği
- `INGEST_AND_EXTRACT → STRUCTURAL_CHECKS` Workflow geçişi
- MIT lisanslı, saf JavaScript `franc-min` ve `iso-639-3` kod normalizasyonu
- en fazla 20 temsili sayfa ve sayfa başına 2.048 karakterlik bounded dil örneklemesi
- seyrek/karışık/kararsız dil için ihtiyatlı `WARN`; kalibre güven yüzdesi yok
- Türkçe casing, NFKC, sayısal önek ve son noktalama normalizasyonlu kesin başlık eşleme
- zorunlu/isteğe bağlı bölüm ayrımı, ilk oluşum sırası, bounded tekrar ve sayfa kanıtı
- doğrulanmış kontrolleri koşu detay/liste API yanıtına ekleme
- yönetici başvuru ekranında Türkçe “Ön Kontroller” görünümü
- sentetik unit, DB ve gerçek yerel workerd + D1 + R2 + Workflow altın smoke

`franc-min` kendi model girdisini 2.048 karakterle sınırlar. Bu nedenle sayfa başına aynı sınır
açıkça uygulanmış, en fazla 20 sayfa belge boyunca eşit aralıklı seçilmiştir. Yerel Node 25
mikro-benchmark'ında 20 sayfalık bir değerlendirme yaklaşık 7,7 ms sürmüştür; gerçek workerd
uyumluluğu altın smoke ile ayrıca doğrulanmıştır.

## Tutarlılık kararı

Çıkarım artifact'i yazıldıktan sonra koşu `PROCESSING / STRUCTURAL_CHECKS` olur. Üç kontrol tek
idempotent batch/upsert sınırında uzlaştırılır ve yalnız sonra koşu `SUCCEEDED` yapılır. Olumsuz
bulgu pipeline hatası değildir. İşlem hatası güvenli operasyon koduyla koşuyu `FAILED` yapar.

## Pinleme

Kontroller aktif şablonu sorgulamaz. Beklenen dil ve bölüm profili yalnız
`AnalysisRun.templateVersionId` yabancı anahtarıyla yüklenir. Sonraki şablon aktivasyonları
tarihsel koşunun profilini veya sonuçlarını değiştirmez.

## Güvenlik ve gizlilik

PDF/metin güvenilmeyen girdidir ve yalnız veri olarak işlenir. Kontrol türü/durumu/dili istemci
tarafından belirlenemez. Tam metin D1, API ve loglara taşınmaz; eşleşen başlık kanıtları bounded
tutulur. API artifact anahtarını açığa çıkarmaz ve yarışma kapsamlı `competition:configure`
yetkilendirmesini korur.

## Ertelenenler

Semantik bölüm içeriği, kategori uyumu, benzerlik, OpenAI/LLM, rubrik AI, feedback, reviewer
assignment/workspace, risk queue ve OCR bu milestone'da uygulanmamıştır.
