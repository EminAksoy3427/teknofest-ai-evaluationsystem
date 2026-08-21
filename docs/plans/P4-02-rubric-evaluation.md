# P4-02 — Kanıta Dayalı Rubrik Değerlendirmesi ve Geri Bildirim

## Amaç ve teslim

P4-02, zorunlu son AI değerlendirme katmanını ekler: koşuda sabitlenmiş `RubricVersion` kriterlerine
karşı tek bounded OpenAI çağrısıyla kriter başına puan önerisi, kanıt gücü, server-verified kanıt ve
eksik/zayıf nokta listesi üretir; bu doğrulanmış sonuçlardan ikinci bir model çağrısı yapmadan
deterministik geliştirme geri bildirimi türetir.

Ürün sınırı: AI puanı bir ÖNERİdir. Otomatik nihai hakem puanına dönüşmez, başvuruyu
reddetmez/diskalifiye etmez, hakem kararını değiştirmez ve nihai yarışma kararı üretmez.

## Durum

| Alan | Durum |
| --- | --- |
| `RUBRIC_EVALUATION` aşaması ve `AnalysisCheck` türü | UYGULANDI |
| Tek bounded rubrik değerlendirme model çağrısı | UYGULANDI |
| Sunucu tarafı puan sınırı (`0..maxScore`) ve kriter kümesi doğrulaması | UYGULANDI |
| Server-verified kanıt (sayfa + birebir normalize alıntı) | UYGULANDI |
| Deterministik geri bildirim sentezi (ikinci model çağrısı yok) | UYGULANDI |
| Normalize `rubric_suggestion` tablosu, composite FK sahiplik | UYGULANDI |
| Retry idempotency, tarihsel `RubricVersion` pinlemesi | UYGULANDI |
| Manager arayüzü "AI Rubrik Önerisi" bölümü | UYGULANDI |
| Hakem çalışma alanı, risk kuyruğu, nihai insan puanlama | ERTELENDİ |

Yalnız sentetik test verisi kullanılmıştır; gerçek TEKNOFEST raporu veya canlı OpenAI çağrısı bu
görevde yapılmamıştır.

## Mimari kararlar

**Model ölçeği görür ama belirleyemez.** Girdi kriter kodu, başlık, açıklama, kanıt beklentisi ve o
kriterin YETKİLİ `maxScore` değeridir. `maxScore` bilinçli olarak gönderilir: modelin kriterin 5, 10
yoksa 20 üzerinden mi puanlandığını bilmesi gerekir, aksi hâlde `suggestedScore` anlamsız olur ve
sunucu tarafı aralık doğrulaması bu eksik-ölçek problemini çözmez. Ölçeği görmek onu belirlemek
değildir: `maxScore` çıktı şemasında yoktur ve şema `.strict()` olduğu için modelin bu değeri geri
döndürmesi/değiştirmesi reddedilir; yetkili değer daima pinlenmiş `criterion` satırında kalır ve
asla istemci girdisinden gelmez. Çıktıdaki kriter kodu kümesi de koşuda pinlenmiş kümeyle birebir
eşleşmelidir; uyuşmazlık tüm değerlendirmeyi güvenli biçimde reddeder
(`AI_STRUCTURED_OUTPUT_INVALID`, koşu `FAILED`).

**Puan asla modelden güvenilerek alınmaz.** Her `suggestedScore` sunucuda pinlenmiş
`criterion.maxScore`a karşı, herhangi bir kriter sonucu oluşturulmadan önce doğrulanır. `0` kriterin
hiç karşılanmadığına ilişkin geçerli ve güvenilen bir yargıdır; `maxScore` da geçerli bir üst
sınırdır. Bu aralığın dışındaki bir puan (negatif veya `maxScore`dan büyük) düşük bir yargı değil,
GEÇERSİZ sağlayıcı çıktısıdır: sıfıra veya herhangi bir değere indirilmez/fabrike edilmez, tüm
rubrik değerlendirmesi `AI_STRUCTURED_OUTPUT_INVALID` ile reddedilir ve hiçbir öneri kalıcı hâle
getirilmez. Toplam öneri puanı ve azami toplam her zaman sunucuda, doğrulanmış kriter puanlarından
hesaplanır; modelin döndürdüğü hiçbir toplam yoktur ve yoktu bile güvenilmezdi.

**Kanıt aynı sunucu fonksiyonuyla doğrulanır.** `SECTION_CONTENT`/`CATEGORY_FIT` ile aynı
`verifyClaimedEvidence` kullanılır. Doğrulanamayan veya hiç sunulmamış kanıt kriterin kanıt gücünü
`LOW`a düşürür; sahte kanıt normal arayüze asla `verified:true` olarak ulaşmaz.

**Geri bildirim ikinci bir model çağrısı değildir.** `synthesizeFeedback`, yalnız zaten doğrulanmış
kriter sonuçlarından (zayıf kanıt, eksik nokta, düşük puan oranı) deterministik Türkçe cümleler
üretir. Bu, hem maliyeti sınırlar hem de geri bildirimin asla doğrulanmamış bir model iddiasına
dayanmamasını garanti eder.

**Normalize kalıcılık, `similarity_pair`in composite FK desenini izler.** `rubric_suggestion`
tablosu `(analysis_run_id, rubric_version_id) → analysis_run(id, rubric_version_id)` ve
`(rubric_version_id, criterion_id) → criterion(rubric_version_id, id)` composite foreign key'leriyle
korunur; bir önerinin yanlış rubrik sürümüne veya başka bir sürümün kriterine bağlanması veritabanı
düzeyinde engellenir, yalnız uygulama doğrulamasına bırakılmaz.

**Şema değişikliği iki ayrı migration'dır.** `analysis_run` tablosunun `stage` CHECK kısıtını
`RUBRIC_EVALUATION` değerine genişletmek tablo yeniden oluşturmayı gerektirir (SQLite CHECK kısıtları
`ALTER TABLE` ile değiştirilemez); bu değişiklik ve `criterion`/`analysis_run` üzerindeki yeni composite
FK ebeveyn indeksleri migration `0011`de, `rubric_suggestion` tablosunun kendisi migration `0012`de
oluşturulmuştur. Bu sıralama zorunludur: SQLite bir foreign key'in ebeveyn sütunlarında zaten bir
UNIQUE indeks bulunmasını ister; aynı migration içinde tablo ve onun FK'sinin hedefi olan indeksi
ters sırada oluşturmak "foreign key mismatch" hatası üretir (yerel doğrulamada karşılaşılmış ve
düzeltilmiştir).

**Prompt paketi sürümü bump edildi.** `SEMANTIC_PROMPT_BUNDLE_VERSION` artık `semantic-checks/v2`dir
ve rubrik değerlendirme promptunu da içerir; `semantic-checks/v1` geriye dönük çözümlenebilir kalır
ama rubrik promptu taşımaz. P4-02'den önce pinlenmiş bir koşu teorik olarak `RUBRIC_EVALUATION`
aşamasına ulaşırsa (yalnız deploy sırasında devam eden bir koşu için mümkün), sağlayıcı açık bir
yapılandırma hatası verir; sessizce yanlış bir sonuç üretmez.

## Kabul sınırları

Rubrik eşikleri (zayıf kriter tanımı: kanıt gücü `LOW`, eksik nokta var veya puan oranı `< 0.6`)
provisional geliştirme politikasıdır; resmî TEKNOFEST kalibrasyonu değildir. Bir puan asla "kazanma
olasılığı" veya nihai değerlendirme olarak sunulmaz.
