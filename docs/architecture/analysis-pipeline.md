# Belge Analiz Pipeline Mimarisi

## Sınır

Pipeline `INGEST_AND_EXTRACT → STRUCTURAL_CHECKS → SEMANTIC_CHECKS` aşamalarını uygular. PDF özel R2 nesnesinden
okunur, sayfa kimliği korunarak metin çıkarılır ve sürümlü `document-extraction/v1` artifact'i
özel R2'ye yazılır. Ardından sabitlenmiş şablon sürümüyle deterministik dil, şablon yapısı ve
zorunlu başlık varlığı kontrolleri çalışır. Ardından araçsız OpenAI Responses çağrılarıyla
`SECTION_CONTENT` ve `CATEGORY_FIT` karar-destek sinyalleri üretilir. Benzerlik, rubrik puanlama
ve geri bildirim yoktur.

PDF ve çıkarılan metin güvenilmeyen girdidir. İçerik hiçbir zaman yetkilendirme, Workflow
kimliği, R2 anahtarı, sistem talimatı veya araç çağrısı belirlemez.

## AnalysisRun tarihi ve pinleme

Bir başvuru birden fazla tarihsel `AnalysisRun` taşıyabilir; `QUEUED` veya `PROCESSING`
durumundaki ikinci koşu D1 kısmi benzersiz indeksiyle atomik olarak engellenir. `SUCCEEDED` ya
da `FAILED` sonrasında yeni koşu oluşturulur, eski satır üzerine yazılmaz.

Koşu oluşturma sorgusu tek D1 yazımında şunları sabitler:

- başvurunun kategorisi,
- o anda `ACTIVE` olan `TemplateVersion`,
- kriteri bulunan o anda `ACTIVE` olan `RubricVersion`,
- yetkili `SubmissionFile.sha256`,
- deterministik Workflow instance kimliği olarak `analysisRunId`.
- kategori adı/kodu/açıklaması/kapsam notu snapshot'ı,
- AI sağlayıcısı, ortamdan seçilen model kimliği ve prompt paketi sürümü.

Aktif sürümler daha sonra değişse de eski koşunun yabancı anahtarları değişmez. Bu, sonraki
analiz aşamalarının tarihsel girdisini yeniden üretilebilir tutar.

## Yaşam döngüsü

Durumlar `QUEUED → PROCESSING → SUCCEEDED | FAILED` biçimindedir. Aşama durumdan ayrıdır ve
`INGEST_AND_EXTRACT → STRUCTURAL_CHECKS → SEMANTIC_CHECKS` ilerler. `SUCCEEDED` yalnız kaynak okuma, SHA-256
doğrulama, çıkarım, Zod artifact doğrulama, R2 yazımı, üç doğrulanmış kontrolün D1'e yazımı ve
D1 finalizasyonu tamamlandıktan sonra yazılır. Bir kontrolün `FAIL` olması koşuyu `FAILED`
yapmaz; bu, analiz mekanizmasının başarıyla olumsuz bir iş bulgusu üretmesidir.

Workflow başlatılamazsa daha önce oluşturulan `QUEUED` satır `WORKFLOW_START_FAILED` ile
`FAILED` yapılır. Böylece bağlı Workflow'u olmayan süresiz kuyruk kaydı bırakılmaz. Bu sınır
outbox değildir; D1 ve Workflow tek dağıtık transaction oluşturmaz.

## Yerel Cloudflare Workflow ve idempotency

`SUBMISSION_ANALYSIS`, `SubmissionAnalysisWorkflow` sınıfına bağlıdır. Wrangler
yapılandırmasında `remote` davranışı yoktur; geliştirme ve smoke yalnız yerel Workflows
simülasyonunu kullanır. Uygulanan dayanıklı adımlar:

1. koşuyu idempotent biçimde `PROCESSING` yap,
2. kaynağı al, doğrula, çıkar ve deterministik artifact anahtarına yaz,
3. çıkarım metadata'sını yaz ve aşamayı idempotent biçimde `STRUCTURAL_CHECKS` yap,
4. sabitlenmiş şablon ve artifact ile kontrolleri koşu/tür anahtarında upsert et,
5. üç kontrol kalıcıysa koşuyu idempotent biçimde `SUCCEEDED` yap.

Adımlar sınırlı exponential retry kullanır. Workflow payload'ı yalnız `analysisRunId` taşır.
Artifact anahtarı `derived/{submissionId}/{analysisRunId}/document.json` biçimindedir; retry
aynı nesneyi uzlaştırır/üzerine yazar, yeni bir artifact üretmez. Workflow adım çıktısında tam
belge metni taşınmaz.

## Deterministik yapısal kontroller

`STRUCTURAL_CHECKS` aktif şablonu yeniden çözmez; yalnız `AnalysisRun.templateVersionId` ile
sabitlenmiş yapısal profili kullanır. `franc-min` saf JavaScript trigram algılayıcısı sayfalar
arasından deterministik seçilen en fazla 20 sayfanın sayfa başına en fazla 2.048 karakterini
değerlendirir. ISO-639-1/BCP-47 taban kodları `iso-639-3` eşlemesiyle algılayıcının ISO-639-3
çıktısına çevrilir. Skor kalibre olasılık olmadığı için API veya UI'da güven yüzdesi gösterilmez.
Seyrek metin ve güçlü sayfa düzeyi karma dil sinyali `WARN` sonucudur.

Başlık eşleme NFKC, Türkçe locale-aware küçük harf, tekrarlı boşluk, yaygın son noktalama ve
sayısal başlık öneklerini ihtiyatlı biçimde normalize eder. Yalnız 160 karakter/16 sözcük
sınırındaki bağımsız satırlar tam normalize başlığa eşleşebilir; paragraf içindeki söz öbeği
başlık sayılmaz. İlk oluşum sıra değerlendirmesinde, en fazla beş oluşum ise sayfa ve belge sırası
kanıtı olarak kullanılır. Eksik zorunlu başlık `SECTION_PRESENCE` ve aggregate
`TEMPLATE_STRUCTURE` için `FAIL`; yalnız sıra sapması veya tekrar ihtiyatlı biçimde `WARN` olur.
İsteğe bağlı başlık eksikliği başarısızlık değildir. Bu kontroller bölüm gövdesinin beklenen
semantik içeriğini incelemez.

## PDF çıkarımı ve bellek sınırı

Sunucu tarafında MIT lisanslı `unpdf` serverless PDF.js derlemesi kullanılır. Paket ayrı Worker
chunk'ına alınır; istemci bundle'ına girmez. Kaynak, istemci URL'sinden değil D1'deki güvenilir
`SubmissionFile.storage_key` üzerinden `DOCUMENTS.get()` ile alınır. Okunan byte dizisinin
SHA-256 değeri koşuda pinlenen değerle karşılaştırılır.

Sayfalar 1 tabanlı sırayla tek tek işlenir. Normalizasyon yalnız satır sonlarını birleştirir,
kontrol gürültüsünü kaldırır, tekrarlı boşluğu ihtiyatlı biçimde azaltır ve sayfa sınırını trim
eder. Özetleme, düzeltme, çeviri veya başlık çıkarımı yapılmaz.

Operasyonel Worker guard'ları 20 MiB yükleme sınırına ek olarak en fazla 200 sayfa ve 1.000.000
çıkarılmış karakterdir. Bunlar yarışma kuralı değildir. Yerel iki sayfalı benchmark/smoke'ta
Worker ana bundle + PDF.js chunk gzip boyutu yaklaşık 876 KiB ve istemci bundle'ı PDF.js veya
dil algılayıcı içermeden yaklaşık 115 KiB gzip'tir. 20 MiB kaynak, PDF.js nesne grafiği ve JSON string
kopyalarının Worker belleğinde birlikte bulunabileceği dikkate alınarak çıkarım sayfa sayfa ve
karakter sayacıyla erken durdurulur. Guard aşımı kontrollü `DOCUMENT_TOO_COMPLEX` üretir.

## Artifact sözleşmesi

`document-extraction/v1` Zod sözleşmesi kaynak SHA-256, başvuru/koşu kimliği, toplam sayfa ve
karakter sayıları, 1 tabanlı sıralı sayfalar ile uyarıları taşır. Sayfa ve toplam karakter
sayıları şema seviyesinde metinle karşılaştırılır. İçerik `application/json` olarak özel R2'ye
yazılır. D1 yalnız artifact anahtarı, sayaçlar ve uyarı metadata'sını tutar; tam metin, kullanıcı
e-postası, token veya kimlik bilgisi taşımaz. API artifact anahtarını veya sayfa metnini döndürmez
ve ham artifact için public endpoint yoktur.

## Seyrek metin, OCR ve hatalar

Yapısal olarak okunabilen fakat toplam kullanılabilir metni 100 karakterin altında kalan belge
`TEXT_SPARSE` uyarısıyla başarılı olabilir. Bu sinyal OCR'ın yapılmış olduğunu söylemez; OCR
açıkça ertelenmiştir. Parola korumalı belge güvenilir biçimde algılanırsa `PDF_ENCRYPTED`, diğer
parse sorunları `PDF_PARSE_FAILED`, desteklenmeyen özellikler `PDF_UNSUPPORTED` olarak güvenli
mesajlara eşlenir. Kütüphane stack trace'i ve ayrıntıları API'ye/loglara taşınmaz.

## D1, R2 ve Workflow tutarlılık sınırları

Üç sistem tek dağıtık transaction değildir. Başlangıç sırası D1 `QUEUED` satırı, sonra Workflow
creation'dır. Tamamlama sırası çıkarım, Zod doğrulaması, deterministik R2 yazımı, AnalysisCheck
upsert'i ve D1 `SUCCEEDED` güncellemesidir. Son D1 güncellemesi başarısız olursa deterministik
orphan artifact kalabilir; retry aynı anahtarı yeniden kullanıp finalizasyonu uzlaştırır. Artifact yazımı
başarısızsa koşu `FAILED` olur. Outbox ve production telafi orkestrasyonu bu milestone dışında
kalır.

## AnalysisCheck kalıcılığı

Küçük ve sorgulanabilir bulgular `analysis_check` tablosunda tutulur. Türler `LANGUAGE`,
`TEMPLATE_STRUCTURE` ve `SECTION_PRESENCE`; durumlar koşu yaşam döngüsünden ayrı `PASS/WARN/FAIL`
değerleridir. `(analysis_run_id, type)` benzersizliği retry'da ikinci bir yetkili sonuç oluşmasını
engeller. `details_json` yazılmadan ve okunurken tür ayrımlı paylaşılan Zod şemalarından geçer.
Tam belge metni veya sınırsız alıntı D1'e yazılmaz. Gelecek kontrol türleri için DB `type`
sütununda kapalı enum yoktur; geçerli türleri yalnız güvenilir sunucu kodundaki runtime sözleşme
belirler.

## Yetkilendirme ve gözlemlenebilirlik

Başlatma, liste ve detay uçları kimlik doğrulama ile yarışma kapsamlı `competition:configure`
izni ister. Nested sorgular `AnalysisRun → Submission → Competition` zincirini doğrular;
çapraz yarışma kaynakları bilgi sızdırmayan `404` sonucuna gider. Tarayıcı yalnız güvenli durum,
pinlenmiş sürüm kimlikleri, sayaçlar, uyarılar ve güvenli hata görür. Loglar en fazla koşu,
başvuru, aşama, sayaç ve güvenli hata kodu taşıyabilir; çıkarılmış metin loglanmaz. Kontroller
yalnız `AnalysisCheck → AnalysisRun → Submission → Competition` zincirinden yetkilendirilmiş
yönetici yanıtına eklenir; artifact anahtarı ve tam metin açığa çıkmaz.
