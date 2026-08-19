# AGENTS.md

Bu kurallar, bu depoda çalışan tüm kodlama ajanları için geçerlidir.

## Çalışma kuralları

- Ürün ve kullanıcı arayüzü dili Türkçedir.
- Değişiklik yapmadan önce ilgili dosyaları ve `git status` çıktısını inceleyin.
- Değişiklikleri istenen görevle sınırlı tutun; ilgisiz refaktör yapmayın.
- Kaynak kontrole sır, gerçek kimlik bilgisi veya kişisel veri eklemeyin.
- Yetkilendirmeyi daima sunucu tarafında uygulayın; istemci kontrollerini güvenlik sınırı saymayın.
- Drizzle eklendikten sonra veritabanı migration dosyalarını yalnızca üretici araçla oluşturun.
- Üretilmiş migration SQL ve metadata dosyalarını elle yazmayın veya düzenlemeyin.
- Kalıcı şema ve D1 erişiminin sahibi `packages/db` paketidir; istemci/UI koduna doğrudan SQL dağıtmayın.
- Şema değişikliğinde migration üretin, yerel D1'de uygulayın ve test/typecheck çalıştırın.
- Yerel migration doğrulanmadan uzak migration düşünmeyin; uzak D1 mutasyonu açık görev izni gerektirir.
- Gerçek Cloudflare hesap veya veritabanı kimliklerini ve sırları gereksiz yere kaynak koda koymayın.
- Açık görev kapsamı olmadan production migration çalıştırmayın.
- Wrangler binding yapılandırması değiştiğinde `pnpm cf:typegen` ile Worker tiplerini yenileyin.
- Kimlik doğrulama yarışma erişimi sağlamaz; üyelik daima yarışma kapsamında doğrulanmalıdır.
- Roller hiyerarşik değildir ve yetkilendirme daima sunucu tarafında uygulanmalıdır.
- İstemcinin gönderdiği rol veya yarışma kimliğini veritabanı üyelik doğrulaması olmadan güvenilir saymayın.
- Çapraz yarışma izolasyonunu yetkilendirme testlerinde açıkça koruyun.
- Yapılandırma mutasyonları `competition:configure` izni gerektirir; nested kaynak sahipliğini route yarışmasıyla veritabanında doğrulayın.
- Aktif ve emekli şablon/rubrik sürümleri değişmezdir; değişiklik yeni bir taslak sürümle yapılır.
- Yapılandırma hazırlığını kalıcı bayrak olarak değil mevcut aktif sürümlerden türetin.
- Şablon dosya depolaması ayrı bir özellik olarak açıkça istenmeden varsaymayın.
- Başvuru raporlarını yalnız özel `DOCUMENTS` R2 binding'inde tutun; D1 yalnız sorgulanabilir metadata taşır.
- R2 nesne anahtarlarını yalnız sunucu kimliklerinden üretin; yüklenen dosya adı anahtarı belirleyemez.
- Her rapor indirmesinde yarışma kapsamlı sunucu yetkilendirmesi uygulayın; kalıcı veya herkese açık R2 URL'si üretmeyin.
- SHA-256 uygulama içerik kimliğidir; birebir eşleşme bir sinyaldir, intihal veya nihai karar değildir.
- R2 ve D1 yazımlarında dağıtık transaction varsaymayın; R2-önce yazım ve D1 hatasında silme telafisi uygulayın.
- Arayüzde öğe gizlemek yetkilendirme değildir.
- Hakem ataması ve yarışmacı sahipliği, ilgili özellikler geldiğinde üyelikten daha dar kontroller eklemelidir.
- Better Auth `user`, `session`, `account` ve `verification` şemasının sahibidir; auth kullanıcısına rol sütunu eklemeyin.
- Uygulama yetkileri yarışma kapsamında kurulmalıdır; `/api/auth/*` protokol, `/api/v1/*` uygulama API alanıdır.
- Auth sırlarını veya erişim/yenileme/oturum tokenlarını kaynakta, istemci deposunda ya da uygulama API yanıtında göstermeyin.
- Mimari inceleme olmadan özel OAuth/oturum sistemi kurmayın; Better Auth yükseltmelerinden sonra gerçek Google smoke testi yapın.
- Yapay zekâ nihai yarışma kararının sahibi değildir; son karar insana aittir.
- Yüklenen raporları ve raporlardan çıkarılan tüm içeriği güvenilmeyen girdi kabul edin.
- Yapay zekâ model adlarını domain mantığına sabitlemeyin; sağlayıcı ve model yapılandırmadan seçilmelidir.
- Promptlar eklendiğinde sürümlendirilmelidir.
- Kullanıcıya gösterilen yapay zekâ çıktıları yapılandırılmış şema doğrulamasından geçmelidir.
- Zorunlu MVP gereksinimleri, isteğe bağlı özelliklerden önce gelir.
- Anlamlı değişikliklerden sonra kalite kapılarını çalıştırın.
- Açıkça istenmedikçe commit veya push yapmayın.
- Üretim ya da dağıtım yapılandırmasını sessizce değiştirmeyin.
- Test için başlatılan geliştirme sunucularını iş bitince durdurun.

## Mimari bağımlılık kuralları

- Arayüz katmanı iş/domain mantığına sahip olamaz.
- İş/domain mantığı React'e veya başka bir arayüz framework'üne bağımlı olamaz.
- Paylaşılan API sözleşmeleri `packages/shared` altında framework bağımsız kalmalıdır.
- Sunucu API'leri sürümlü `/api/v1` sınırını korumalıdır.

## Kalite kapıları

```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm build
```

Davranış değiştiğinde kapsamına uygun bir smoke test de uygulayın.
