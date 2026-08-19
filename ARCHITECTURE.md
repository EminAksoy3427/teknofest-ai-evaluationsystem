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
- `packages/ai`: **Planlanan** sağlayıcı, prompt ve yapılandırılmış çıktı sınırı; şu an runtime kodu yoktur.
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

## 6. Planlanan platform sorumlulukları

- **D1:** Yarışma, kategori, şablon sürümü, rubrik sürümü ve ölçüt verileri. Worker `DB`
  binding'i üzerinden `packages/db` sınırına erişir; migration'lar yerel öncelikli çalıştırılır.
- **R2:** Yüklenen raporların ve büyük nesnelerin saklanması; bu fazda binding yoktur.
- **OpenAI:** Sağlayıcı adaptörü ve model seçimi ortam yapılandırmasından gelecektir. Domain
  mantığı belirli bir GPT-5 ailesi model adını bilmeyecektir.
- **Workflows:** Uzun süren, tekrar denenebilir değerlendirme süreçlerinin orkestrasyonu.
- **Vectorize:** Onaylanmış kullanım senaryosu oluştuğunda benzerlik/erişim indeksi.

Bu maddeler planlanmıştır; hiçbiri mevcut fazda uygulanmış değildir.

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

## 9. Bilinçli olarak ertelenenler

Hakem ataması, yarışmacı sahipliği, global yönetim, başvuru, değerlendirme, production
OAuth/D1, uzak D1 kaynağı, R2, OpenAI entegrasyonu, benzerlik analizi, Vectorize, Workflows
ve diğer iş özellikleri bu aşamada ertelenmiştir.
