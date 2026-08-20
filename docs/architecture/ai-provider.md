# Yapay Zekâ Sağlayıcı Mimarisi

## Sınır ve yapılandırma

`packages/ai`, semantik domain ile sağlayıcı SDK'sı arasındaki sınırdır. Uygulama yalnız
`AIProvider.analyzeSectionContent` ve `analyzeCategoryFit` sözleşmelerini bilir; OpenAI istemcisi
Workflow/server sınırında oluşturulur ve tarayıcı modüllerine aktarılmaz. `OPENAI_API_KEY` yalnız
sunucu sırrıdır. GPT-5 ailesindeki gerçek `OPENAI_MODEL` ortamdan okunur. Sağlayıcı, model kimliği
ve `semantic-checks/v1` prompt paketi her `AnalysisRun` oluşturulurken sabitlenir.

OpenAI adaptörü resmi JavaScript SDK'sıyla Responses API kullanır. Her istek `store:false`, sınırlı
timeout ve strict JSON Schema Structured Outputs taşır. Araç, background mode, conversation,
`previous_response_id`, Files API veya PDF/R2 URL'si kullanılmaz. SDK cevabı ayrıca Zod ile
doğrulanır; ham cevap, prompt, sağlayıcı trace'i ve gizli düşünme süreci saklanmaz.

## Hata ve veri kontrolü

Ağ, 429, timeout, refusal, incomplete yanıt, structured parse ve Zod doğrulama durumları güvenli
kodlarla ayrılır. Sağlayıcı body/stack ayrıntısı API'ye veya loga taşınmaz. Workflow'da iki ücretli
çağrı ayrı dayanıklı `step.do()` sınırlarıdır; başarılı adım sonraki D1 retry'ında yeniden çağrılmaz.

Yalnız sentetik geliştirme verisi kullanılır. Rapor metni güvenilmeyen veridir; prompt içindeki
savunma ek katmandır. Asıl sınırlar araç ve yazma yetkisi olmaması, sınırlı girdi, strict şema,
uygulama doğrulaması ve server-side kanıt doğrulamasıdır. Structured Outputs olgusal doğruluk
garantisi vermez.

## Kanıt politikası

Model kısa sayfa/alinti iddiaları döndürür. Sunucu sayfanın artifact'te bulunduğunu ve NFKC +
boşluk normalizasyonundan sonra alıntının aynı sayfada birebir geçtiğini doğrular. Geçersiz kanıt
atılır; sonuç `LOW` kanıtla `PARTIAL`/`REVIEW` seviyesine düşürülür. Normal kullanıcı arayüzüne
yalnız `verified:true` kanıt çıkar. Sayısal güven yüzdesi gösterilmez.

## Canlı sağlayıcı doğrulama durumu

P3-02 otomatik testleri, fake-provider doğrulaması ve P3-02A canlı OpenAI provider smoke'u
sentetik veriyle geçmiştir. Bu smoke gerçek TEKNOFEST raporu kullanmamış ve production deployment
doğrulaması yapmamıştır. P4-01A benzerlik testleri canlı OpenAI ağı gerektirmez.
