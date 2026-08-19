# P3-02 — Kanıta Dayalı Semantik Kontroller

## Teslim kapsamı

Pipeline `INGEST_AND_EXTRACT → STRUCTURAL_CHECKS → SEMANTIC_CHECKS` olarak genişletildi.
`SECTION_CONTENT`, sabitlenmiş TemplateVersion açıklamalarına göre bölümde beklenen bilgi türünü;
`CATEGORY_FIT`, koşu başında sabitlenen kategori açıklaması/kapsamına göre uyumu inceler.

Her iki sonuç karar desteğidir. Bölüm kontrolü rubrik puanı vermez; kategori kontrolü kategori
önermez/değiştirmez ve başvuruyu reddetmez. Olumsuz kontrol sonucu pipeline hatası değildir.

## Uygulama kararları

- Resmi OpenAI SDK ve Responses API; ortamdan GPT-5 ailesi model, `store:false`, araçsız strict
  Structured Outputs ve ikinci Zod doğrulaması.
- Tek toplu bölüm çağrısı ve tek kategori çağrısı; bölüm başına çağrı yok.
- Bölüm sınırı, yapılandırılmış ilk başlıktan sonraki satır ile sonraki yapılandırılmış başlık
  arasındadır. Eksik başlık `MISSING_SECTION/NOT_EVALUATED` olur.
- Bölüm girdisi en fazla 6 sayfa/12.000 karakter; kategori girdisi 12 sayfa/24.000 karakterdir.
  Aşım deterministik başlangıç/orta/son örneklemesiyle `SAMPLED` olarak işaretlenir.
- Kanıt alıntısı en fazla 400 karakterdir; yanlış sayfa veya birebir normalize eşleşmeyen alıntı
  silinir ve sonuç ihtiyatlı seviyeye düşürülür.
- `AnalysisRun` sağlayıcı/model/prompt/kategori snapshot'ını taşır; P3-02 öncesi satırlar null kalır.
- İki Responses çağrısı ayrı Workflow adımıdır; sonuçlar kontrol türü başına upsert edilir. Kısmi
  semantik kalıcılık olabilir, ancak iki kontrol olmadan koşu `SUCCEEDED` olmaz.

## Ertelenenler

Benzerlik/embedding/Vectorize, rubrik AI puanlama, feedback sentezi, hakem ataması ve çalışma alanı,
risk kuyruğu, yarışmacı feedback'i, OCR ve gerçek TEKNOFEST verisi bu milestone kapsamında değildir.

## Doğrulama durumu

P3-02 otomatik testleri ve fake-provider doğrulaması geçmiştir. Gerçek OpenAI sağlayıcısına çağrı
henüz çalıştırılmamıştır; yerel `OPENAI_API_KEY` ve `OPENAI_MODEL` kimlik bilgileri
yapılandırılmamıştır. Bu doğrulama bilinçli olarak **P3-02A — Live OpenAI Provider Smoke** işine
ertelenmiştir. P3-02A yalnız sentetik veri kullanacak; gerçek bir TEKNOFEST raporu hiçbir koşulda
kullanılmayacaktır. Canlı smoke testinin henüz yapılmamış olması, sağlayıcının production ortamı
için doğrulandığı anlamına gelmez.
