# Benzerlik Mimarisi

## Ürün sınırı

Benzerlik yalnız uzman dikkatini yönlendiren bir inceleme sinyalidir. İntihal, kopya, hile,
diskalifiye veya otomatik ret kararı değildir. Yüksek sinyalin kullanıcı dili “Yüksek benzerlik
sinyali bulundu. Uzman incelemesi önerilir.” biçimindedir; nihai karar insana aittir.

## P4-01A algoritması

Belge, `document-extraction/v1` artifact'indeki 1 tabanlı sayfa kimlikleri korunarak koşuda
sabitlenmiş şablon başlıklarına göre bölümlenir. Başlıklar gövdeye dahil edilmez. Güvenilir bölüm
bulunamazsa semantik ad uydurulmadan `Belge bölümü N` adlı sayfa tabanlı sınırlı chunk fallback'i
kullanılır. Metin NFKC, Türkçe locale-aware küçük harf, harf/sayı dışı ayırıcılar ve whitespace
üzerinden açıklanabilir biçimde normalize edilir.

Lexical skor, merkezi `SIMILARITY_TOKEN_SHINGLE_SIZE = 5` token shingle kümelerinin Jaccard
benzerliğidir. Sekiz tokenden kısa gövdeler, boş içerik ve beş farklı token üretemeyen patolojik
tekrarlar skorlanmaz. Bu kontrol yaygın başlık/boilerplate etkisini azaltır; kusursuz boilerplate
tespiti iddia etmez.

Bir koşu en fazla 20 aynı-yarışma, başarılı ve artifact'i bulunan güncel tarihsel koşuyu işler.
Sıra `completed_at DESC, id DESC` olarak deterministiktir. En fazla beş aday ve aday başına üç
bölüm eşleşmesi sunulur; alıntıların her tarafı en fazla 280 karakterdir. Bu küçük-corpus lexical
aday yolu production ölçekleme stratejisi değildir.

## Hibrit sözleşme ve sağlayıcı sınırı

Sonuç `lexicalScore`, nullable `semanticScore`, `combinedScore` ve
`LEXICAL_ONLY | HYBRID` modunu taşır. Semantik skor yoksa combined skor lexical skora eşittir ve
mod `LEXICAL_ONLY` olur. Semantik skor varsa geliştirme sözleşmesi 0.6 lexical + 0.4 semantic
ağırlığıyla bounded skor üretir. Skorlar benzerlik metriğidir; intihal olasılığı değildir.

`SimilarityVectorProvider`, yarışma kapsamlı `indexSections` ve `findSimilarSections` sınırıdır.
Metadata zorunlu olarak `competitionId`, `submissionId`, `analysisRunId`, bölüm anahtarı/başlığı ve
sayfa aralığını taşır. Fake in-memory sağlayıcı yalnız test-fixture modülündedir; production
composition semantik sağlayıcıyı `null` bırakır ve UI bunu “Semantik sağlayıcı bağlı değil” diye
gösterir.

## P4-01B semantik katman

Durum özeti:

- **UYGULANDI:** Workers AI gömme adaptörü, Vectorize adaptörü, deterministik vektör kimliği,
  yarışma kapsamlı metadata filtresi, koşuya sabitlenmiş semantik skor, hibrit skor entegrasyonu,
  semantik bölüm kanıtı, degraded lexical mod.
- **YERELDE DOĞRULANDI:** yukarıdakilerin tümü, deterministik test sağlayıcısı ve gerçek üretilmiş
  şema üzerinde (`pnpm smoke:p4-01b`).
- **UZAK DOĞRULANDI (DEVELOPMENT):** Gerçek bir Workers AI çağrısı `@cf/baai/bge-m3` çıktısının
  1024 boyutlu olduğunu doğrulamıştır. Bu doğrulamadan sonra `teknofest-similarity-dev` adlı bir
  DEVELOPMENT Vectorize index'i (dimensions=1024, metric=cosine) ve `competitionId` metadata
  index'i oluşturulmuştur. `apps/web/scripts/p4-01b-remote-smoke.ts`, production
  `WorkersAIEmbeddingProvider` ve `VectorizeSimilarityVectorProvider` sınıflarını gerçek Cloudflare
  REST uç noktalarına karşı çalıştırarak bir sentetik senaryoyu doğrulamıştır: paraphrase edilmiş
  iki bölüm arasındaki gerçek semantik skor (`0.77`) alakasız bir bölüme göre olan skordan (`0.55`)
  daha yüksek çıkmış, hibrit mod `HYBRID` olarak raporlanmış ve ayrı bir yarışmaya ait kaynağa
  neredeyse birebir aynı bir bölüm hiçbir sorguda (kısıtlı veya kısıtsız) geri dönmemiştir. Gerçek
  cosine skorları `[-1, 1]` aralığında gözlenmiş, eventual-consistency gecikmesi upsert mutation
  kimliğinin index `info` uç noktasında işlenmesi beklenerek doğrulanmıştır.
- **HÂLÂ UZAK DOĞRULAMA GEREKTİREN:** production Vectorize index'i (henüz adlandırılıp
  oluşturulmamıştır) ve gerçek dağıtılmış bir Worker üzerinden `env.AI` / `env.VECTORIZE`
  binding'leriyle uçtan uca çalışma; bu smoke, binding arayüzüyle aynı dar sözleşmeyi REST
  üzerinden karşılayan bir test-only adaptör kullanmıştır (gerçek Worker binding'i değil).
- **ERTELENDİ:** eşik kalibrasyonu, risk kuyruğu ve toplam risk skoru.

### Sağlayıcı mimarisi

`EmbeddingProvider` yalnız `embed(texts) -> number[][]` sınırıdır; sınırı geçen tek şey başlıksız,
sınırlandırılmış bölüm gövdesidir. Kimlik, sır veya kişisel veri gönderilmez ve gömme girdisi
loglanmaz. `WorkersAIEmbeddingProvider` yanıtı `{ data: number[][] }` sözleşmesine göre doğrular;
boyut uyuşmazlığı, bozuk yanıt, boş sonuç ve taşıma hatası ayrı hata kodlarıyla reddedilir, asla
uydurulmuş bir vektöre dönüştürülmez.

Model kimliği ve boyut `apps/web/src/server/ai/embedding-env.ts` içindedir; domain skorlama kodu
hiçbir Cloudflare model adı bilmez. Varsayılanlar `@cf/baai/bge-m3` ve `1024` boyuttur;
`SIMILARITY_EMBEDDING_MODEL` ve `SIMILARITY_EMBEDDING_DIMENSIONS` ile ortamdan geçersiz kılınabilir.
Mesafe metriği `cosine`'dir. Index oluşturulduktan sonra boyut ve metrik değiştirilemez.

### Vektör kimliği ve metadata

Vectorize vektör kimliği 64 bayt ile sınırlı olduğu için kimlik, `similarity-section/v1`,
`competitionId`, `submissionId`, `analysisRunId` ve bölüm anahtarından üretilen deterministik bir
SHA-256 özetidir (`sim1-` + 40 hex, 45 bayt). Aynı koşu yeniden çalıştığında aynı vektör
kimlikleri üzerine yazılır; daha yeni bir AnalysisRun ayrı kimlikler alır, bu yüzden A1 vektörü asla
A2 sanılamaz.

Metadata yalnız `schemaVersion`, `competitionId`, `submissionId`, `analysisRunId`, `sectionKey`,
`sectionTitle`, `pageStart` ve `pageEnd` taşır. Ham rapor metni, sır, kimlik doğrulama verisi veya
e-posta metadata'ya yazılmaz.

### Index ve sorgu yaşam döngüsü

Yazma tarafı: her koşu `SIMILARITY_CHECKS` aşamasında kendi bölüm vektörlerini upsert eder. Okuma
tarafı: kaynak koşu, P4-01A D1 aday sözleşmesinin seçtiği AnalysisRun kümesiyle sınırlı olarak
sorgular. Aday koşular kendi analizlerini zaten tamamladığı için vektörleri hâlihazırda
indekstedir.

Yarışma izolasyonu iki katmanlıdır: Vectorize sorgusu `competitionId` metadata filtresi uygular ve
dönen her eşleşme uygulama tarafında yeniden doğrulanır. Ek olarak kaynak başvurunun kendisi ve aday
kümesi dışındaki koşular atılır. Bu nedenle semantik erişim aday kapsamını genişletemez: aday üst
sınırı, kalıcı satır kardinalitesi ve `all-vs-all` olmama garantisi P4-01A ile aynıdır.

Vectorize yazımları eventual consistent'tır (`mutationId`). Analizi henüz yeni bitmiş bir aday
sorgulanabilir olmayabilir; bu durumda semantik skor üretilmez ve sonuç `DEGRADED` olarak
raporlanır, asla uydurulmaz.

### Hibrit skor, kanıt ve degraded mod

Hibrit skor P4-01A sözleşmesidir: `0.6` lexical + `0.4` semantic, sınırlandırılmış. Bunlar
provisional geliştirme politikasıdır; kalibre edilmiş olasılık değildir. `0.82` gibi bir skor
"%82 intihal olasılığı" DEĞİLDİR.

Kanıt her iki katkıyı açıklar: her bölüm eşleşmesi `lexicalScore` ve nullable `semanticScore`
taşır. Saf bir paraphrase'de lexical örtüşme sıfır olduğu için yalnız semantik olarak eşleşen bölüm
çiftleri de kanıta eklenir; aksi halde skor yükselirken uzmana inceleyecek hiçbir bölüm
gösterilmezdi. Kanıt yine `MAX_SIMILARITY_SECTION_MATCHES` ile sınırlıdır.

`SIMILARITY` kontrol detayları `semanticStatus` taşır:

- `DISABLED` — Workers AI/Vectorize binding'i yok; tasarımı gereği lexical-only.
- `AVAILABLE` — semantik analiz çalıştı ve skor üretti; `mode` `HYBRID` olabilir.
- `DEGRADED` — sağlayıcı yapılandırıldı ama çalışamadı veya kullanılabilir sonuç vermedi; sonuç
  lexical-only kalır, `semanticScore` null yazılır ve sonuç asla başarılı hibrit gibi sunulmaz.

Sağlayıcı veya index hatası AnalysisRun'ı bozmaz ve koşuyu başarısız etmez. Production kod yoluna
fake sağlayıcı fallback'i eklenmemiştir; fake ve deterministik sağlayıcılar yalnız test
fixture'larındadır. Binding'ler mevcut ama gömme yapılandırması geçersizse composition sessizce
devre dışı kalmaz, hata verir: bu bir operatör yapılandırma hatasıdır.

### Uzak sağlama

Workers AI ve Vectorize'ın yerel emülasyonu yoktur. Binding'lerin bildirilmesi `wrangler dev`/Vite
oturumunu uzak proxy moduna geçirir. Bu, bir DEVELOPMENT index'i sağlanırken ampirik olarak
doğrulanmıştır: binding'ler `apps/web/wrangler.jsonc` üst seviyesinde etkinleştirildiğinde,
`scripts/p2-02-local-smoke.mjs` tarafından başlatılan yerel Vite/Worker oturumu hazır olamamış ve
`smoke:p2-03` bu nedenle başarısız olmuştur. Bu yüzden `ai` ve `vectorize` blokları
`apps/web/wrangler.jsonc` üst seviyesinde bilinçli olarak yorumlanmış bırakılmıştır; etkinleştirme,
yerel smoke'ların bare `wrangler dev`/`vite` oturumuna bağımlı olmadığı bir değişiklikte (örn. yalnız
açık bir dağıtım veya `--remote` oturumu için kullanılan adlandırılmış bir `env` bloğu) yapılmalıdır.

DEVELOPMENT index'i (`teknofest-similarity-dev`) ve gerçek Workers AI çağrısı, Worker binding'i
etkinleştirilmeden doğrulanmıştır: `apps/web/scripts/p4-01b-remote-smoke.ts`, `env.AI` /
`env.VECTORIZE` ile aynı dar arayüzü (`WorkersAIBinding.run`, `SimilarityVectorizeBinding.upsert`
/`query`) Cloudflare REST uç noktaları üzerinden karşılayan test-only adaptörler enjekte ederek
production sağlayıcı sınıflarını gerçek uzak kaynaklara karşı çalıştırır:

```bash
CLOUDFLARE_API_TOKEN=... npx tsx scripts/p4-01b-remote-smoke.ts
# veya WRANGLER_OAUTH_TOML=<wrangler config dosyası> ile mevcut `wrangler login` oturumunu kullanır
```

Bu script CI'ye veya yerel kalite kapılarına dahil değildir; gerçek, ücretli çağrılar ürettiği için
elle ve nadiren çalıştırılır. Production index'i sağlanırken `wrangler.jsonc` üst seviye binding'i
yukarıdaki kısıtla birlikte etkinleştirilmelidir.

## Eşikler ve birebir eşleşme

Geliştirme eşikleri `HIGH >= 0.70`, `MEDIUM >= 0.35`, aksi halde `LOW` olarak merkezidir. Bunlar
resmî TEKNOFEST eşikleri veya bilimsel kalibrasyon değildir; production öncesi sentetik/golden
değerlendirme setiyle kalibre edilmelidir.

Aynı yarışma içindeki pinlenmiş kaynak SHA-256 eşitliği `exactDocumentMatch: true`, `HIGH` ve
`WARN` inceleme sinyali üretir. Hash eşitliği lexical/vector hesap gerektirmeden skoru belirler;
iki taraflı bounded artifact alıntısı yine korunur. Birebir eşleşme intihal kararı değildir ve
hash başka yarışmaya sızdırılmaz.

## Tarihsel kalıcılık, izolasyon ve idempotency

`SimilarityPair` tam rapor metni olmadan yarışma, canonical submission çifti, iki immutable
AnalysisRun kimliği, skorlar, mod, seviye, exact flag ve bounded kanıt taşır. Satır bir toplu durum
kaydı değil, iki BELİRLİ AnalysisRun arasındaki tarihsel gözlemdir. Değişmez kimlik
`competition_id`, `submission_a_id`, `submission_b_id`, `analysis_run_a_id` ve `analysis_run_b_id`
sütunlarıdır; retry yalnız skorları, modu, seviyeyi, exact flag'i, bounded kanıtı ve `updated_at`
alanını uzlaştırır. Yeni bir AnalysisRun eski satırı güncellemez, yeni bir tarihsel satır üretir.
Mantıksal `A/B` çifti bu nedenle `A1/B1`, `A2/B1`, `A1/B2` ve `A2/B2` gözlemlerini bir arada
taşıyabilir.

Canonical sıra `submission_a_id < submission_b_id` ile deterministiktir ve DB CHECK ile korunur;
AnalysisRun kimlikleri kendi başvurularıyla birlikte taşınır, bağımsız olarak canonical hale
getirilmez. `UNIQUE(competition_id, analysis_run_a_id, analysis_run_b_id)` aynı koşu çiftinin
yinelenmesini engeller; canonical sıra CHECK'i hem inverse satırı hem self-pair'i reddeder.

Sahiplik yalnız uygulama doğrulamasına bırakılmamıştır. Şema, `submission(competition_id, id)` ve
`analysis_run(submission_id, id)` ebeveyn UNIQUE anahtarlarına dayanan dört composite foreign key
taşır: `(competition_id, submission_a_id)` ve `(competition_id, submission_b_id)` her başvurunun
satırda yazılı yarışmaya ait olmasını, `(submission_a_id, analysis_run_a_id)` ve
`(submission_b_id, analysis_run_b_id)` her pinlenmiş koşunun aynı canonical taraftaki başvuruya ait
olmasını zorunlu kılar. Repository yazımı ayrıca `INSERT … SELECT … WHERE EXISTS` ile aynı kapsamı
doğrular; kısıtlar repository atlandığında da geçerlidir.

Repository aday sorgusu, pair upsert'i, API ve vector metadata sözleşmesi yarışma filtresini
zorunlu tutar. Workflow retry aynı koşu çifti unique anahtarını ve `(analysis_run_id, SIMILARITY)`
AnalysisCheck upsert'ini kullanır. P4-01A'nın başarılı lexical Workflow adımı retry'da tekrar
yürütülmez.

## Sorgu semantiği

Belirli bir tarihsel AnalysisRun sorgusu yalnız o koşu kimliğini taşıyan gözlemleri döndürür ve
daha yeni bir koşunun sonucuna kaymaz. Başvuru düzeyindeki "mevcut benzerlik" görünümü, başvurunun
en son başarılı AnalysisRun kimliği bilinçli olarak çözülerek türetilir; API yanıtı pinlenen koşuyu
`analysisRunId` alanında bildirir ve koşu yoksa `null` döndürür. Manager API'si isteğe bağlı
`analysisRunId` sorgu parametresiyle açıkça tarihsel bir koşu seçmeye izin verir. Aynı koşu içinde
bir karşı taraf birden çok kez gözlemlendiyse, o koşuya pinli kalarak en son gözlem sunulur.

## Pipeline ve durum semantiği

Başarılı yeni koşu `INGEST_AND_EXTRACT → STRUCTURAL_CHECKS → SEMANTIC_CHECKS →
SIMILARITY_CHECKS` ilerler ve son aşamada `SUCCEEDED` olur. `SIMILARITY` kontrolü `LOW → PASS`,
`MEDIUM/HIGH → WARN` eşlemesini kullanır; hiçbir benzerlik bulgusu `FAIL` veya pipeline failure
değildir. Yalnız artifact, provider veya persistence mekanizması çalışamazsa koşu güvenli hata ile
`FAILED` olur.
