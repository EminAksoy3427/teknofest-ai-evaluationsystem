# Mimari

## 1. Ürün bağlamı

Bu sistem, TEKNOFEST yarışma raporlarını değerlendiren hakemlerin daha hızlı, tutarlı,
açıklanabilir ve kanıta dayalı çalışmasını destekler. Yapay zekâ yardımcıdır; nihai karar
ve sorumluluk insandadır.

## 2. Temel ilkeler

- API-first ve mobile-ready tasarım
- İnsan kontrollü karar süreci
- Sürümlemeli, şema doğrulamalı sözleşmeler
- Güvenilmeyen rapor girdilerine karşı sunucu tarafı güvenlik sınırı
- İş mantığının UI ve altyapı sağlayıcılarından ayrılması
- İhtiyaç oluşmadan soyutlama veya servis üretmeme

## 3. Monorepo sınırları

- `apps/web`: Tek uygulama ve Cloudflare dağıtım sınırı; React istemcisi ile Hono Worker'ı içerir.
- `packages/shared`: Framework bağımsız DTO, şema, enum ve yardımcılar.
- `packages/ui`: Yeniden kullanılabilir görsel bileşenler ve tasarım tokenları. İş mantığı içermez.
- `packages/db`: Drizzle şeması, üretici araçla oluşturulan migration'lar ve tipli D1 erişim sınırı.
- `packages/ai`: Sağlayıcı adaptörü, sürümlü promptlar ve doğrulanmış yapılandırılmış çıktı sınırı.
- `packages/config`: Gerçek bir ortak ihtiyaç oluştuğunda kullanılacak yapılandırma sınırı.

UI iş mantığının sahibi olamaz. Domain/iş mantığı React'e bağımlı olamaz.

## 4. SPA kararı

Ana ürün, gelecekte kimlik doğrulamalı operasyonel bir dashboard olacaktır. React Router
ile istemci tarafı SPA bu etkileşim modeline yeterlidir; ilk yüklemede runtime SSR'ın
maliyet ve karmaşıklığına ihtiyaç yoktur. Cloudflare static assets, bilinmeyen istemci
rotalarını `index.html` dosyasına yönlendirir.

## 5. API ve dağıtım modeli

Hono, `/api/v1/*` altındaki sürümlü uygulama API sınırıdır. Better Auth protokol uçları ayrı
olarak `/api/auth/*` altında çalışır. Web istemcisi uygulama API'sinin bir tüketicisidir;
gelecekteki mobil istemci aynı sözleşmeleri kullanabilmelidir. Vite, istemci varlıklarını
üretir; Cloudflare Worker aynı dağıtım birimi içinde API isteklerini çalıştırır. Ayrı bir
Node sunucusu veya mikroservis yoktur.

## 6. Platform sorumlulukları

- **D1:** Yarışma, kategori, şablon/rubrik/ölçüt ve başvuru dosya metadata'sı. Worker `DB`
  binding'i üzerinden `packages/db` sınırına erişir; migration'lar yerel öncelikli çalıştırılır.
- **R2:** Başvuru PDF gövdeleri özel `DOCUMENTS` binding'inde saklanır. Worker her okumayı
  yetkilendirir; public URL veya R2 kimlik bilgisi tarayıcıya verilmez. P2-02 yalnız yerel R2
  simülasyonunu kullanır.
- **OpenAI:** Resmi SDK'nın Responses API adaptörü araçsız ve `store:false` çalışır; model seçimi
  ortamdan gelir ve koşu başında prompt sürümüyle birlikte sabitlenir.
- **Workflows:** `SUBMISSION_ANALYSIS` yerel Workflow'u sayfa koruyan PDF metin çıkarımını ve
  P3-01 deterministik dil/yapı/başlık ön kontrollerini retry/idempotency sınırıyla orkestre eder.
  Ardından kanıt doğrulamalı bölüm içeriği ve kategori uyumu semantik kontrollerini,
  `SIMILARITY_CHECKS` aşamasında deterministik lexical benzerlik sinyalini ve son olarak
  `RUBRIC_EVALUATION` aşamasında sabitlenmiş rubrik kriterlerine karşı kanıta dayalı AI puan
  önerisini ve deterministik geliştirme geri bildirimini çalıştırır (P4-02).
- **Workers AI:** P4-01B çok dilli gömme adaptörü uygulanmıştır (`@cf/baai/bge-m3`, 1024 boyut,
  ortamdan yapılandırılabilir). P4-01B uzak doğrulaması tamamlandı: gerçek bir Workers AI çağrısı
  modelin döndürdüğü vektör boyutunun gerçekten 1024 olduğunu doğrulamıştır. Worker binding'i
  `apps/web/wrangler.jsonc` içinde hâlâ devre dışıdır (aşağıya bakınız).
- **Vectorize:** P4-01B production adaptörü, deterministik vektör kimliği ve yarışma kapsamlı
  metadata filtresiyle uygulanmıştır. Bir DEVELOPMENT index'i (`teknofest-similarity-dev`,
  dimensions=1024, metric=cosine, `competitionId` metadata index'i) oluşturulmuş ve gerçek
  Workers AI + Vectorize çağrılarıyla sentetik bir senaryo üzerinde doğrulanmıştır: paraphrase
  edilmiş iki bölüm arasındaki semantik skor alakasız bir bölüme göre daha yüksek çıkmış, ayrı bir
  yarışmaya ait neredeyse aynı metin hiçbir zaman geri döndürülmemiştir. Production index'i henüz
  adlandırılıp oluşturulmamıştır; boyut ve cosine metriği index oluşturulurken sabitlenir ve
  sonradan değiştirilemez.

D1, özel yerel R2 ve yerel Workflow sınırları uygulanmıştır. OpenAI Responses adaptörü
uygulanmıştır. Workers AI ve Vectorize adaptörleri uygulanmış ve DEVELOPMENT kaynaklarına karşı
uzak doğrulanmıştır; production kaynak kurulumu ve dağıtım yapılmamıştır. Worker binding'leri,
yerel `wrangler dev`/Vite oturumlarını uzak proxy moduna geçirip yerel smoke'ları bozmamak için
`wrangler.jsonc` içinde bilinçli olarak yorumlanmış bırakılmıştır.

## 7. Güvenlik sınırı

Google tabanlı kimlik doğrulama Better Auth ile Worker tarafında uygulanır; oturumlar D1'de
ve imzalı HTTP-only cookie ile yönetilir. Kimlik doğrulama yetki vermez: yarışma kapsamlı
üyelik D1'den okunur ve roller hiyerarşi olmadan açık izinlere eşlenir. Korunan uygulama
uçları üyelik ve rolü Worker tarafında doğrular; tarayıcı kontrolleri yetki kanıtı değildir.
Sırlar yalnız Cloudflare secret/env mekanizmalarından okunacaktır. Raporlar ve bunlardan
gelen metinler güvenilmeyen girdi olarak doğrulanacak, sınırlandırılacak ve yapay zekâ
talimatı olarak kabul edilmeyecektir.

## 8. Yarışma yapılandırması

Kimliği doğrulanmış kullanıcı MVP kapsamında yeni yarışma oluşturabilir; yarışma ve kurucuya
ait `COMPETITION_MANAGER` üyeliği tek D1 batch işlemiyle atomik yazılır. Bu bootstrap yalnız
yeni yarışmaya yetki verir. Diğer yapılandırma işlemleri yarışma üyeliği ve
`competition:configure` izniyle sunucuda korunur.

Kategori bağlamı, şablon yapısal profili ve rubrik kriterleri `packages/db` kalıcılık sınırında
tutulur. Şablon ve rubrik sürümleri `DRAFT → ACTIVE → RETIRED` yaşam döngüsünü izler. Aktif ve
emekli sürümler değişmez tarihsel kayıtlardır; yeni aktivasyon önceki aktif sürümü aynı atomik
işlemde emekliye ayırır. Tek aktif sürüm ayrıca kısmi benzersiz veritabanı indeksleriyle korunur.
Hazırlık durumu kalıcı bir bayrak değil, mevcut kategori ve aktif sürümlerden türetilmiş bir API
projeksiyonudur. Ayrıntılar `docs/architecture/competition-configuration.md` içindedir.

## 9. Belge çıkarımı ve deterministik ön kontroller

`AnalysisRun` oluşturulurken kategori, aktif şablon/rubrik sürümleri ve kaynak PDF SHA-256
sabitlenir. Yerel Workflow özel R2 kaynağını doğrular, `unpdf` ile sayfa kimliğini koruyarak metin
çıkarır ve `document-extraction/v1` artifact'ini deterministik özel R2 anahtarına yazar. D1 tam
metin değil yalnız durum, sayaç, uyarı ve sunucu içi artifact metadata'sını taşır. Ayrıntılar
`docs/architecture/analysis-pipeline.md` içindedir.

Workflow daha sonra koşuda sabitlenmiş TemplateVersion profilini kullanarak baskın dil,
zorunlu başlık varlığı ve ihtiyatlı bölüm sırası/tekrar sinyallerini üretir. Küçük, doğrulanmış
`AnalysisCheck` sonuçları D1'de koşu ve tür başına tek satır olarak tutulur. Kontrol `FAIL`
olabilirken başarılı çalışan pipeline `AnalysisRun SUCCEEDED` kalır. Başlık varlığı bölümün
beklenen semantik içeriğini taşıdığını kanıtlamaz; bu nedenle P3-02 kanıt doğrulamalı bölüm
içeriği ve kategori uyumu kontrollerini ayrıca çalıştırır.

## 10. Benzerlik sinyali

P4-01A ile uygulananlar:

- koşuda sabitlenmiş şablon başlıklarına göre bölümlenmiş, 5-token shingle Jaccard'ına dayanan
  deterministik ve açıklanabilir lexical benzerlik
- `SimilarityPair` kalıcılığı: yarışma, canonical başvuru çifti ve iki immutable AnalysisRun
  kimliğiyle tarihsel gözlem satırları
- pinlenmiş kaynak SHA-256 eşitliğinden türeyen birebir belge (`exactDocumentMatch`) sinyali
- aynı-yarışma izolasyonu: aday sorgusu, kalıcılık, API ve UI dahil her yolda zorunlu
- `LEXICAL_ONLY` production modu ve nullable semantik skor taşıyan hibrit skor sözleşmesi
- `SimilarityVectorProvider` sağlayıcı soyutlaması; fake in-memory uygulama yalnız test fixture'ı

P4-01B ile uygulananlar:

- Workers AI çok dilli gömme sağlayıcısı ve doğrulanmış yanıt sözleşmesi
- Vectorize production adaptörü, deterministik vektör kimliği ve `competitionId` metadata filtresi
- aday AnalysisRun kümesine sabitlenmiş semantik en yakın komşu (topK) araması
- lexical + semantik hibrit skoru ve iki katkıyı açıklayan bölüm kanıtı
- şeffaf degraded lexical mod (`semanticStatus`)

P4-01B'de DEVELOPMENT kaynaklarına karşı uzak doğrulanan (P4-01B remote task):

- gerçek Workers AI gömme çağrısı: `@cf/baai/bge-m3` gerçekten 1024 boyutlu vektör döndürür
- gerçek `teknofest-similarity-dev` Vectorize index'i (dimensions=1024, metric=cosine) ve
  `competitionId` metadata index'i
- gerçek cosine skorları ve eventual-consistency gecikmesi (upsert mutation kimliği index
  `info` uç noktasında işlenene kadar sorgu beklenmiştir)
- yarışma kapsamlı filtreleme: ayrı bir yarışmaya ait, kaynağa neredeyse birebir aynı bir bölüm
  hiçbir sorguda geri dönmemiştir

Production Vectorize index'i henüz adlandırılıp oluşturulmamış, Worker binding'i etkin değil ve
dağıtım yapılmamıştır. Benzerlik düzeyi P6 inceleme önceliği kuyruğunda bir dikkat sinyali olarak
tüketilir (bölüm 13); eşik kalibrasyonu hâlâ ertelenmiştir ve kalibre edilmiş bir toplam risk skoru
bilinçli olarak üretilmemektedir.

`SimilarityPair` tarihsel bir gözlemdir: yarışma kimliği, başvuru kimlikleri ve AnalysisRun
kimlikleri değişmezdir. Yeni bir AnalysisRun eski satırı güncellemez, yeni bir tarihsel satır
üretir. Aynı koşu çiftinin retry'ı yalnız ölçülen değerleri uzlaştırır. Benzerlik bir inceleme
sinyalidir; intihal, kopya veya nihai karar değildir ve `FAIL` üretmez. Ayrıntılar
`docs/architecture/similarity.md` içindedir.

## 11. Rubrik önerisi ve geri bildirim (P4-02)

`RUBRIC_EVALUATION` aşaması, koşuda sabitlenmiş `RubricVersion`in kriterlerine karşı tek bounded
OpenAI çağrısıyla kriter başına puan önerisi üretir. Model her kriterin pinlenmiş `maxScore`
değerini yetkili ölçek olarak girdi bağlamında görür (5, 10 veya 20 üzerinden puanlandığını bilmesi
gerekir), fakat bu ölçeği belirleyemez: `maxScore` çıktı şemasında yoktur ve şema `.strict()`
olduğundan geri döndürülen/değiştirilen bir `maxScore` reddedilir. Model kriter kümesini, azami
puanı veya toplamı asla belirleyemez. `0`, bir kriterin hiç karşılanmadığına
ilişkin geçerli ve güvenilen bir yargıdır; `criterion.maxScore` da geçerli bir üst sınırdır. Bu
aralığın dışındaki bir puan düşük bir yargı değil, GEÇERSİZ sağlayıcı çıktısıdır: sunucu bunu asla
sıfıra veya başka bir değere indirmez, tüm rubrik değerlendirmesini güvenli biçimde reddeder ve
hiçbir öneri kalıcı hâle getirilmez (koşu bu durumda `FAILED` olur). Sunucu ayrıca kanıtı
sayfa/alıntı düzeyinde yeniden doğrular (doğrulanamayan kanıt o kriterin kanıt gücünü düşürür ama
koşuyu `FAILED` yapmaz) ve toplam öneri puanını kendisi hesaplar. Geliştirme geri bildirimi ikinci
bir model çağrısı olmadan, doğrulanmış kriter sonuçlarından deterministik olarak türetilir.

AI puanı bir öneridir: otomatik nihai hakem puanına dönüşmez, başvuruyu reddetmez/diskalifiye
etmez ve hakem kararını değiştirmez. Öneriler `rubric_suggestion` normalize tablosunda koşu ve
kriter başına ayrı satır olarak, `RubricVersion`a pinlenmiş biçimde saklanır; yeni bir
`RubricVersion` etkinleştiği zaman eski koşuların önerileri değişmez kalır. Ayrıntılar
`docs/architecture/rubric-evaluation.md` içindedir.

## 12. Hakem çalışma alanı ve İnsan-AI karar izi

Yarışma inceleme deneyimi P5 ile uygulanmıştır. `REVIEWER` rolü `submission:review` iznini taşır
fakat tek başına hiçbir başvuruya erişim vermez: her hakem ucu ayrıca oturum kullanıcısının sahibi
olduğu bir `ReviewerAssignment` çözer. Başka bir hakemin veya başka bir yarışmanın ataması `404`
döner. `submission:review` bilinçli olarak hiçbir yönetici rolüne verilmemiştir; değerlendirme
yöneticisi `review:assign` ve `competition:view-operations` ile operasyonu yürütür ama hakem
kimliğine bürünüp puan veremez. Çapraz yarışma ataması `reviewer_assignment` üzerindeki composite
foreign key'lerle veritabanı düzeyinde engellenir.

Çalışma alanı üç paneldir: solda korunan uçtan okunan rapor (PDF), ortada koşuda kalıcı hâle gelmiş
AI 4. Göz sinyalleri (deterministik · semantik · benzerlik · rubrik), sağda pinlenmiş `RubricVersion`
üzerinden insan rubriği. Kanıt alıntılarının yanındaki sayfa bağlantıları raporu ilgili sayfaya
götürür; yalnız sunucu tarafından doğrulanmış kanıt gezinme hedefi üretir ve hedef sayfa koşunun
çıkarımında kaydedilen sayfa sayısına göre sınırlanır.

İnsan puanı AI önerisinden ayrı bir kayıttır: öneriler `rubric_suggestion`, insan puanları
`reviewer_criterion_score` içindedir ve yapay zekâ hakem puanını hiçbir koşulda otomatik yazmaz.
`ReviewerEvaluation` atamanın başvurusuna, hakemin incelediği `AnalysisRun`a ve o koşunun rubrik
sürümüne composite foreign key'lerle sabitlenir; yeni bir `RubricVersion` etkinleşse ve yeni bir koşu
oluşsa da eski değerlendirme kendi pinlenmiş koşusu, rubriği, AI önerileri ve puan ölçeğiyle değişmez
kalır. Karar izi bu değişmez kayıtlardan tarihsel olarak yeniden kurulabilir.

Her iki toplam da sunucuda hesaplanır ve tek bir puana birleştirilmez; istemcinin gönderdiği bir
toplam `.strict()` istek şemasıyla reddedilir. Kriter başına `AI İLE AYNI` / `AI'DAN FARKLI` /
`AI ÖNERİSİ YOK` sınıflandırması üretilir ve farklılık hakem hatası olarak sunulmaz. Taslak her an
kaydedilebilir; gönderim tüm kriterlerin geçerli biçimde puanlanmasını gerektirir, yalnız o hakemin
değerlendirmesini tamamlar ve gönderilmiş kayıt değişmezdir. Hakem çalışma alanı yalnız kalıcı
analizi tüketir: çalışma alanını açmak, kanıda tıklamak, puan değiştirmek, taslak kaydetmek ve
göndermek model çağrısı yapmaz. Ayrıntılar `docs/architecture/reviewer-workflow.md` içindedir.

## 13. Değerlendirme operasyonu ve inceleme önceliği

P6, yöneticinin yarışma geneli değerlendirme operasyonunu ve deterministik **İnceleme Önceliği**
kuyruğunu ekler. Öncelik hiçbir yerde saklanmaz: her istekte mevcut `submission`, `analysis_run`,
`analysis_check`, `rubric_suggestion`, `reviewer_assignment`, `reviewer_evaluation` ve
`reviewer_criterion_score` satırlarından türetilir. Kalıcı bir risk tablosu bilinçli olarak
eklenmemiştir; kalıcı bir öncelik özetlediği değişmez kayıtlardan sapabilirdi ve tüm girdiler tek
yarışma içinde ucuza yeniden okunabilir. Bu aşama **hiçbir yeni yapay zekâ çıkarımı yapmaz**:
öncelik türetmesi `packages/shared` içinde saf bir fonksiyondur ve sağlayıcı, gömme adaptörü veya
vektör sağlayıcısına hiçbir bağımlılığı yoktur; repository katmanı yalnız `SELECT` çalıştırır.

Model saf toplamadır: `score = Σ weight(reason)` ve seviye iki eşikten (`MEDIUM ≥ 3`, `HIGH ≥ 6`)
türer. Gizli çarpan, kırpma veya geçersiz kılma yoktur ve seviye, döndürülen görünür gerekçelerin
toplamına tam olarak eşittir — bu, şema düzeyinde zorunludur. Ağırlıklar tek bir dışa aktarılan
tabloda durur ve geçici ürün politikası olarak işaretlidir; kalibrasyon golden set gerektirir.
Sinyaller yalnız en yeni **başarılı** koşunun kalıcı kontrollerinden okunur, "Analiz" sütunu ise en
yeni koşuyu bildirir; böylece devam eden veya başarısız yeni bir koşu hakemin elindeki kanıtı
sessizce geçersiz kılmaz.

İnceleme önceliği bir dikkat sinyali sıralamasıdır: olasılık, risk yüzdesi, intihal skoru veya nihai
yarışma kararı değildir. Dahili sayısal skor yalnız sıralama anahtarıdır ve arayüzde asla yüzde,
gösterge veya güven değeri olarak sunulmaz. Kuyruk `competition:view-operations` ile korunur
(`COMPETITION_MANAGER`, `EVALUATION_MANAGER`); `REVIEWER` ve `CONTESTANT` erişemez ve çapraz yarışma
sızıntısı her ifadede engellenir. Ayrıntılar `docs/architecture/review-operations.md` içindedir.

## 14. Bilinçli olarak ertelenenler

Başvuru PDF depolaması özel R2 ve D1 metadata ayrımıyla uygulanmıştır; ayrıntılar
`docs/architecture/document-storage.md` içindedir. Hakem ataması ve hakem çalışma alanı P5 ile
uygulanmıştır. Yarışmacı sahipliği ve geri bildirim yüzeyi, global yönetim, production OAuth/D1, uzak
D1/R2/Workflow kaynağı, OCR, production Vectorize/Workers AI index'i ve dağıtımı (P4-01B DEVELOPMENT
kaynaklarına karşı uzak doğrulanmıştır), akıllı risk kuyruğu, gönderilmiş hakem değerlendirmesinin
yeniden açılması/sürümlenmesi, birden çok hakemin puanından yarışma geneli uzlaşma üretilmesi ve
uygulama içi PDF.js render katmanı gibi diğer iş özellikleri ertelenmiştir. Akıllı risk kuyruğu P6
ile türetilmiş bir projeksiyon olarak uygulanmıştır; eşik ve ağırlık kalibrasyonu hâlâ golden set
beklemektedir.
