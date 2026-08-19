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
  Ardından kanıt doğrulamalı bölüm içeriği ve kategori uyumu semantik kontrollerini çalıştırır.
- **Vectorize:** Onaylanmış kullanım senaryosu oluştuğunda benzerlik/erişim indeksi.

D1, özel yerel R2 ve yerel Workflow sınırları uygulanmıştır. OpenAI ve Vectorize sonraki
milestone'lara planlanmıştır; uzak/production kaynak kurulumu yapılmamıştır.

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
beklenen semantik içeriğini taşıdığını kanıtlamaz; semantik içerik kontrolü ertelenmiştir.

## 10. Bilinçli olarak ertelenenler

Başvuru PDF depolaması özel R2 ve D1 metadata ayrımıyla uygulanmıştır; ayrıntılar
`docs/architecture/document-storage.md` içindedir. Hakem ataması, yarışmacı sahipliği, global
yönetim, semantik değerlendirme, production OAuth/D1, uzak D1/R2/Workflow kaynağı, OpenAI
entegrasyonu, OCR, benzerlik analizi, Vectorize ve diğer iş özellikleri ertelenmiştir.
