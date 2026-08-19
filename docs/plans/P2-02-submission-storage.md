# P2-02 — Başvuru Depolama ve Özel R2

## Kapsam ve sonuç

Bu kilometre taşı yarışma yöneticisinin başvuru metadata'sını ve PDF raporunu yüklemesini,
başvuruları listelemesini ve yetkilendirilmiş raporu tarayıcıda açmasını sağlar. PDF özel yerel
R2 binding'inde, sorgulanabilir metadata D1'de tutulur. Dosya henüz çıkarılmaz, analiz edilmez,
puanlanmaz veya bir yapay zekâ sağlayıcısına gönderilmez.

Ürün rotası `/app/competitions/:competitionId/submissions`'dır. Form başvuru kodu, proje
başlığı, yarışma kategorisi ve tek PDF alır; yalnız PDF ve azami 20 MiB sınırını açıkça gösterir.
Liste yükleme/boş/hata durumlarıyla kod, başlık, kategori, dosya adı/boyutu, zaman ve nötr birebir
eşleşme sinyalini gösterir. `Raporu aç` eylemi korunan Worker endpoint'ini yeni sekmede açar.

## API ve yetkilendirme

- `POST /api/v1/competitions/:competitionId/submissions`
- `GET /api/v1/competitions/:competitionId/submissions`
- `GET /api/v1/competitions/:competitionId/submissions/:submissionId`
- `GET /api/v1/competitions/:competitionId/submissions/:submissionId/report`

Tüm uçlar authentication ve mevcut `competition:configure` iznini gerektirir. Yalnız
`COMPETITION_MANAGER` izinlidir; `EVALUATION_MANAGER`, `REVIEWER`, `CONTESTANT` reddedilir.
Başka yarışmaya ait nested başvuru, izinli route yarışması içinde sorgulansa bile bilgi
sızdırmayan `404` sonucuna gider. İstemci rol, kullanıcı, yarışma scope'u, kimlik, storage key,
SHA-256, byte boyutu veya timestamp seçemez.

## Depolama ve doğrulama

`DOCUMENTS` native R2 binding'i özeldir ve yerel simülasyonla çalışır; `remote: true`, public
bucket, özel alan adı, R2 tokenı veya gerçek bucket oluşturma yoktur. R2 işlemleri küçük
`storage/documents.ts` altyapı sınırındadır.

Sunucu bildirilen `application/pdf` MIME'ı ve gerçek `%PDF-` imzasını birlikte doğrular. Dosya
uzantısı belirleyici değildir. Dosya adı path ve kontrol karakterlerinden arındırılmış, sınırlı
görüntü metadata'sıdır. Nesne anahtarı yalnız route yarışması ve sunucu üretimli submission/file
UUID'lerinden oluşur. Web Crypto SHA-256 tam byte dizisi üzerinde hesaplanır ve lowercase hex
olarak saklanır.

## D1 modeli ve tutarlılık

`Submission`, Competition'a cascade ve Category'ye restrict foreign key ile bağlıdır; başvuru
kodu yarışma içinde benzersizdir. `SubmissionFile`, Submission'a cascade bağlıdır; benzersiz
`submission_id` başvuru başına tek raporu korur. Kategoriye bağlı başvuru varsa P2-01 kategori
silme ucu kontrollü `409` döndürür.

Yükleme doğrulamadan sonra R2'ye, ardından Submission + SubmissionFile için tek atomik D1 batch'e
yazar. D1 hatasında R2 silme telafisi denenir. Worker iki yazım arasındaki anda çökerse teorik
orphan nesne kalabileceği kabul edilir; cross-system transaction varsayılmaz.

## Birebir eşleşme semantiği

SHA-256 tekrarları yalnız aynı yarışmada sayılır. Aynı PDF ikinci bir başvuruda reddedilmez ve
iki başvuru da korunur. Yanıt `exactDuplicate` ile `matchingSubmissionCount` verir; UI
“Bu raporla birebir aynı dosya daha önce yüklenmiş.” şeklinde nötr uyarı gösterir. Bu sinyal
intihal veya yarışma kararı değildir.

## Test yaklaşımı

- Paylaşılan sözleşmeler: boyut sabiti, strict metadata, güvenli response ve eşleşme sinyali.
- API: rol matrisi, cross-competition izolasyonu, MIME/imza/boyut/boş dosya, hostile dosya adı,
  sunucu boyut/hash/key üretimi, kategori scope'u, telafi ve kontrollü storage hatası.
- Veritabanı: temiz `0000 → 0005`, `0000–0004 → 0005` yükseltmesi, unique/FK/CHECK, kategori
  restrict, tek dosya, atomik rollback, yarışma cascade ve yarışma-kapsamlı hash sorgusu.
- R2: Wrangler `--local` simülasyonunda yalnız sentetik PDF ile byte-identical put/get/delete.
- Regresyon: P2-01 yapılandırma ve kategori CRUD, P1 auth/health, secret-safe build.

## Ertelenenler

Silme API'si dağıtık tutarlılık kapsamını büyütmemek için eklenmemiştir. Range/`206`, PDF text
çıkarımı, OCR, sayfa sayma, `document.json`, `AnalysisRun`, Workflows, AI/OpenAI, embedding,
benzerlik, şablon/rubrik analizi, hakem ataması/çalışma alanı, yarışmacı geri bildirimi ve şablon
dosyası R2 yükleme sonraki açık kilometre taşlarına ertelenmiştir. Uzak D1/R2, deployment ve
gerçek TEKNOFEST verisi kullanılmaz.
