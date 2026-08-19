# Belge Analiz Pipeline Mimarisi

## Sınır

P2-03 yalnız `INGEST_AND_EXTRACT` aşamasını uygular. PDF özel R2 nesnesinden okunur, sayfa
kimliği korunarak metin çıkarılır, sürümlü `document-extraction/v1` artifact'i özel R2'ye
yazılır ve `AnalysisRun` sonuç metadata'sı D1'de tamamlanır. Dil, şablon uyumu, semantik bölüm
analizi, kategori uyumu, benzerlik, rubrik puanlama ve geri bildirim bu aşamada yoktur.

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

Aktif sürümler daha sonra değişse de eski koşunun yabancı anahtarları değişmez. Bu, sonraki
analiz aşamalarının tarihsel girdisini yeniden üretilebilir tutar.

## Yaşam döngüsü

Durumlar `QUEUED → PROCESSING → SUCCEEDED | FAILED` biçimindedir. Aşama durumdan ayrıdır ve
P2-03 boyunca yalnız `INGEST_AND_EXTRACT` değerini taşır. `SUCCEEDED` yalnız kaynak okuma,
SHA-256 doğrulama, çıkarım, Zod artifact doğrulama, R2 yazımı ve D1 finalizasyonu tamamlandıktan
sonra yazılır.

Workflow başlatılamazsa daha önce oluşturulan `QUEUED` satır `WORKFLOW_START_FAILED` ile
`FAILED` yapılır. Böylece bağlı Workflow'u olmayan süresiz kuyruk kaydı bırakılmaz. Bu sınır
outbox değildir; D1 ve Workflow tek dağıtık transaction oluşturmaz.

## Yerel Cloudflare Workflow ve idempotency

`SUBMISSION_ANALYSIS`, `SubmissionAnalysisWorkflow` sınıfına bağlıdır. Wrangler
yapılandırmasında `remote` davranışı yoktur; geliştirme ve smoke yalnız yerel Workflows
simülasyonunu kullanır. Uygulanan dayanıklı adımlar:

1. koşuyu idempotent biçimde `PROCESSING` yap,
2. kaynağı al, doğrula, çıkar ve deterministik artifact anahtarına yaz,
3. D1 metadata'sını idempotent biçimde `SUCCEEDED` yap.

Adımlar sınırlı exponential retry kullanır. Workflow payload'ı yalnız `analysisRunId` taşır.
Artifact anahtarı `derived/{submissionId}/{analysisRunId}/document.json` biçimindedir; retry
aynı nesneyi uzlaştırır/üzerine yazar, yeni bir artifact üretmez. Workflow adım çıktısında tam
belge metni taşınmaz.

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
Worker bundle gzip boyutu yaklaşık 814 KiB (ana Worker + PDF.js chunk) ve istemci bundle'ı
PDF.js içermeden yaklaşık 114 KiB gzip'tir. 20 MiB kaynak, PDF.js nesne grafiği ve JSON string
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
creation'dır. Tamamlama sırası çıkarım, Zod doğrulaması, deterministik R2 yazımı, D1
`SUCCEEDED` güncellemesidir. Son D1 güncellemesi başarısız olursa deterministik orphan artifact
kalabilir; retry aynı anahtarı yeniden kullanıp finalizasyonu uzlaştırır. Artifact yazımı
başarısızsa koşu `FAILED` olur. Outbox ve production telafi orkestrasyonu bu milestone dışında
kalır.

## Yetkilendirme ve gözlemlenebilirlik

Başlatma, liste ve detay uçları kimlik doğrulama ile yarışma kapsamlı `competition:configure`
izni ister. Nested sorgular `AnalysisRun → Submission → Competition` zincirini doğrular;
çapraz yarışma kaynakları bilgi sızdırmayan `404` sonucuna gider. Tarayıcı yalnız güvenli durum,
pinlenmiş sürüm kimlikleri, sayaçlar, uyarılar ve güvenli hata görür. Loglar en fazla koşu,
başvuru, aşama, sayaç ve güvenli hata kodu taşıyabilir; çıkarılmış metin loglanmaz.
