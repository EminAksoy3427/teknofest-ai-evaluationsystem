# Özel Belge Depolama Mimarisi

## Sınır ve sorumluluklar

P2-02 başvuru PDF'lerini uygulamanın özel belge sınırına alır. D1 ve R2 farklı görevlerin
sahibidir:

- **D1:** `Submission` ve `SubmissionFile` ilişkileri, yarışma/kategori sahipliği, görüntüleme
  metadata'sı, byte boyutu, SHA-256 ve sunucu içi R2 nesne anahtarı.
- **R2:** PDF'nin değişmeden saklanan ikili gövdesi.

PDF gövdesi D1'e yazılmaz. R2 nesne anahtarı API DTO'larına veya tarayıcıya verilmez. Worker,
R2'ye yalnız `DOCUMENTS` native binding'i ve `apps/web/src/server/storage/documents.ts` sınırı
üzerinden erişir; S3/AWS SDK veya genel çoklu bulut katmanı yoktur.

## Özel bucket ve yerel çalışma

`DOCUMENTS` bucket'ı özeldir. `r2.dev`, özel alan adı, public access veya R2 API tokenı
yapılandırılmaz. Raporlar kalıcı bir URL'ye yönlendirilmez; her okuma isteği Worker'da yeniden
yetkilendirilir.

Wrangler binding'inde `remote: true` yoktur. Geliştirme ve smoke testleri `--local` ile yerel R2
simülasyonunu kullanır. Yapılandırmadaki `bucket_name` gelecekteki açık deployment adımı için
deklaratiftir; P2-02 uzak bucket oluşturmaz veya kullanmaz.

## İlişkisel model

```text
Competition
 └── Submission ── Category
      └── SubmissionFile ── private R2 object
```

`Submission`, `id`, `competition_id`, zorunlu `category_id`, yarışma içinde benzersiz
`application_code`, `project_title` ve zaman damgalarını taşır. Yarışma silinirse başvuru
metadata'sı cascade olur. Kategori silme cascade değildir; bağlı başvuru varsa `RESTRICT`
uygulanır ve API kontrollü `409 CONFLICT` döndürür.

`SubmissionFile`, `id`, benzersiz `submission_id`, benzersiz `storage_key`, normalize görüntü
dosya adı, sabit `application/pdf` MIME, `size_bytes`, lowercase SHA-256, isteğe bağlı R2 ETag ve
oluşturma zamanını taşır. Başvuru başına tek yetkili rapor vardır. Başvuru metadata'sı silinirse
dosya metadata'sı cascade olur; D1 cascade işleminin R2 nesnesini silemeyeceği ayrıca dikkate
alınır.

## Yükleme güvenlik sınırı

Uygulama sınırı paylaşılan `MAX_SUBMISSION_PDF_BYTES` sabitinde **20 MiB**'dır. Sunucu:

1. `multipart/form-data` taşımayı doğrular.
2. Scalar metadata'yı paylaşılan Zod sözleşmesiyle doğrular.
3. Kategoriyi route yarışmasıyla birlikte D1'de doğrular.
4. Bildirilen MIME'ın tam `application/pdf` olduğunu doğrular.
5. Boş dosyayı ve 20 MiB üzerini reddeder.
6. İlk beş byte'ın `%PDF-` olduğunu doğrular.
7. Tam yüklenen byte dizisi üzerinde Web Crypto ile SHA-256 hesaplar.

Dosya uzantısı güvenlik sinyali değildir. MIME ve imza doğruysa farklı uzantı kabul edilir;
`.pdf` uzantılı fakat PDF imzası taşımayan içerik reddedilir. Dönüştürme, OCR, sayfa sayma veya
semantik çıkarım yapılmaz.

Orijinal dosya adı yalnız görüntü metadata'sıdır: `/` ve `\\` yol parçaları ayrılır, kontrol
karakterleri kaldırılır, boş/özel değerler güvenli varsayılana çevrilir ve uzunluk sınırlanır.
Dosya adı hiçbir zaman nesne anahtarı değildir. İndirme yanıtındaki `Content-Disposition`, ASCII
fallback ve RFC 5987 kodlamasıyla uygulama sınırında üretilir.

Nesne anahtarı yalnız sunucu üretimli kimliklerden oluşur:

```text
competitions/{competitionId}/submissions/{submissionId}/{fileId}/report.pdf
```

## R2 ve D1 tutarlılığı

R2 ile D1 arasında dağıtık transaction yoktur. Uygulanan sıra:

1. Bütün girdileri doğrula, byte boyutu ve SHA-256 üret.
2. PDF'yi özel R2'ye yaz.
3. `Submission` ve `SubmissionFile` satırlarını tek D1 batch işleminde yaz.
4. D1 işlemi başarısızsa R2 nesnesini silmeyi dene.

Bu sıra, başarılı metadata'nın hiç yazılmamış bir nesneye işaret etmesini önler. Worker R2
yazımından hemen sonra, D1 veya telafi çalışmadan çökerse teorik bir orphan R2 nesnesi kalabilir.
P2-02 Workflows, outbox veya dağıtık transaction iddiası eklemez.

D1 metadata'sı mevcutken nesne beklenmedik biçimde bulunamazsa boş PDF döndürülmez. API güvenli
`STORAGE_ERROR` verir; log yalnız yarışma, başvuru ve dosya kimliğini taşır, storage key veya
altyapı ayrıntısı istemciye sızmaz.

## Özel okuma ve birebir eşleşme

Liste, detay, yükleme ve rapor okuma P2-02'de yalnız `competition:configure` iznine, dolayısıyla
`COMPETITION_MANAGER` rolüne açıktır. Nested başvuru sorgusu hem `submission_id` hem route
`competition_id` ile yapılır. Rapor Worker üzerinden tam gövde stream edilir; public URL veya
redirect yoktur. Native byte-range/`206` desteği bu MVP'de uygulanmamıştır ve sonraki PDF viewer
ihtiyacına ertelenmiştir.

SHA-256 eşleşmesi yalnız aynı yarışma içindeki diğer dosyalarda aranır. Aynı PDF ile birden fazla
başvuru saklanabilir. API `exactDuplicate` ve `matchingSubmissionCount` adlı nötr sinyali verir;
başka başvurunun içeriğini açmaz, yarışmalar arası hash varlığını sızdırmaz ve bunu intihal,
hile, diskalifiye veya nihai karar olarak adlandırmaz.

## Güvenilmeyen PDF ve ertelenenler

Sentetik test PDF'leri dışında gerçek TEKNOFEST raporu, PII veya özel T3 belgesi kullanılmaz.
Yüklenen PDF ve gelecekte çıkarılacak her içerik güvenilmeyen girdidir; yetkiyi, model/system
promptunu, araç çağrısını veya nihai değerlendirmeyi belirleyemez.

PDF metin çıkarımı, OCR, sayfa ayrıştırma, `document.json`, `AnalysisRun`, Workflows, OpenAI,
embedding, Vectorize, dil/şablon/bölüm/kategori uyumu, benzerlik, AI rubriği, hakem ataması,
hakem çalışma alanı ve yarışmacı geri bildirimi P2-02 dışında kalır.
