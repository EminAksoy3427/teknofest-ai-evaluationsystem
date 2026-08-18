# AGENTS.md

Bu kurallar, bu depoda çalışan tüm kodlama ajanları için geçerlidir.

## Çalışma kuralları

- Ürün ve kullanıcı arayüzü dili Türkçedir.
- Değişiklik yapmadan önce ilgili dosyaları ve `git status` çıktısını inceleyin.
- Değişiklikleri istenen görevle sınırlı tutun; ilgisiz refaktör yapmayın.
- Kaynak kontrole sır, gerçek kimlik bilgisi veya kişisel veri eklemeyin.
- Yetkilendirmeyi daima sunucu tarafında uygulayın; istemci kontrollerini güvenlik sınırı saymayın.
- Drizzle eklendikten sonra veritabanı migration dosyalarını yalnızca üretici araçla oluşturun.
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
