# P5 — Hakem Çalışma Alanı, Atama ve İnsan–AI Karar İzi

## Amaç ve teslim

P5, analiz motoru tamamlandıktan sonra ürünün ana yarışma inceleme deneyimini ekler: yarışma
kapsamlı hakem ataması, hakem kuyruğu, üç panelli hakem çalışma alanı (rapor · AI 4. Göz · Hakem
Rubriği), kanıt→sayfa gezinmesi, normalize insan değerlendirme kalıcılığı, sunucu tarafı toplamlar
ve İnsan–AI karar izi.

Ürün sınırı: yapay zekâ hakemin yerini almaz ve nihai yarışma kararının sahibi değildir. AI puanı bir
ÖNERİdir; hakem puanı ayrı bir kayıttır ve ikisi tek bir puana birleştirilmez.

## Durum

| Alan | Durum |
| --- | --- |
| `ReviewerAssignment` domain, atama/atama kaldırma, yetkilendirme | UYGULANDI |
| Rol + zorunlu atama erişim modeli (`review:assign`, `submission:review`) | UYGULANDI |
| Çapraz yarışma izolasyonu (composite FK + repository koşulları) | UYGULANDI |
| Hakem kuyruğu `/app/review` ve türetilmiş durumlar | UYGULANDI |
| Üç panelli çalışma alanı, tablet çökme davranışı | UYGULANDI |
| Korunan rapor ucu üzerinden PDF paneli, sayfa/zoom kontrolleri | UYGULANDI |
| Kanıt → PDF sayfa gezinmesi (yalnız sunucu-doğrulamalı kanıt) | UYGULANDI |
| AI 4. Göz paneli (deterministik · semantik · benzerlik · rubrik) | UYGULANDI |
| `ReviewerEvaluation` + `ReviewerCriterionScore` normalize kalıcılık | UYGULANDI |
| Tarihsel sabitleme (koşu + rubrik sürümü) ve değişmezlik | UYGULANDI |
| Sunucu tarafı AI/insan toplamları, istemci toplamının reddi | UYGULANDI |
| İnsan–AI karar izi ve sınıflandırma | UYGULANDI |
| Taslak/gönderim semantiği, gönderilmiş kaydın değişmezliği | UYGULANDI |
| Yönetici/değerlendirme yöneticisi operasyon tablosu | UYGULANDI |
| Akıllı Risk Kuyruğu | KAPSAM DIŞI |
| Gönderilmiş değerlendirmeyi yeniden açma / sürümleme | ERTELENDİ |
| Uygulama içi PDF.js render katmanı | ERTELENDİ |
| Hakemler arası uzlaşma / yarışma geneli nihai karar | ERTELENDİ |

Yalnız sentetik test verisi kullanılmıştır. Bu görevde canlı OpenAI veya Workers AI çağrısı
yapılmamış, uzak Cloudflare kaynağı oluşturulmamış veya değiştirilmemiş, dağıtım yapılmamıştır.

## Mimari kararlar

**Rol tek başına erişim vermez; atama zorunludur.** `REVIEWER` rolü `submission:review` iznini taşır
ama her hakem ucu ayrıca oturum kullanıcısının sahibi olduğu bir `ReviewerAssignment` çözer. Başka
bir hakemin veya başka bir yarışmanın ataması `404` döner, `403` dönmez: yanıt başka bir hakemin işi
hakkında bilgi sızdırmaz.

**`submission:review` hiçbir yönetici rolüne verilmemiştir.** `COMPETITION_MANAGER` ve
`EVALUATION_MANAGER` `review:assign` ve `competition:view-operations` izinlerini alır, fakat
`submission:review` almaz. Değerlendirme yöneticisi değerlendirme operasyonunu yürütür ama hakem
kimliğine bürünüp puan veremez. Roller hiyerarşik değildir; bu ayrım açık izin eşlemesiyle korunur ve
testte doğrulanır.

**Çapraz yarışma ataması veritabanı düzeyinde imkânsızdır.** `reviewer_assignment`,
`(competition_id, submission_id) → submission(competition_id, id)` ve
`(competition_id, reviewer_user_id) → competition_member(competition_id, user_id)` composite foreign
key'lerini taşır. Ayrıca INSERT, `competition_id` ve `submission_id` değerlerini istemciden değil
`submission` satırından yazar ve hedef kullanıcının gerçekten `REVIEWER` rolünde olmasını kendi
`WHERE EXISTS` koşuluyla doğrular. Böylece uyuşmayan kimlikler gönderilerek kapsam genişletilemez.

**Bir atama en fazla bir değerlendirme taşır; tarihsel kimlik `similarity_pair` /
`rubric_suggestion` desenini izler.** `reviewer_evaluation` üzerindeki `UNIQUE(assignment_id)`,
bir `ReviewerAssignment`ın hiçbir zaman ikinci bir `ReviewerEvaluation` biriktiremeyeceğini
veritabanı sınırında garanti eder — taslak hâlindeyken de dahil. İlk taslak oluşturulduğu anda
sabitlenen `analysis_run_id` ve `rubric_version_id`, o değerlendirme üzerinde bir daha asla
değişmez; yeni yapılandırmaya karşı değerlendirme yapmanın tek yolu YENİ bir `ReviewerAssignment`dır.
`ReviewerEvaluation` üç composite foreign key ile atamanın başvurusuna, o başvurunun koşusuna ve o
koşunun rubrik sürümüne sabitlenir; `ReviewerCriterionScore` de kriteri değerlendirmenin pinlenmiş
rubrik sürümü içinde tutar. Zorunlu senaryo doğrulanmıştır: Rubrik v2 etkinleştirilip R2 koşusu
oluştuktan sonra gönderilmiş değerlendirme R1 + Rubrik v1 + eski AI önerileri + insan puanlarıyla,
hatta eski puan ölçeğiyle (10 üzerinden) değişmez kalır ve R2'ye karşı aynı atama için ikinci bir
değerlendirme oluşturma denemesi `UNIQUE(assignment_id)` ile reddedilir. Eşzamanlı/tekrarlanan bir
ilk kayıt isteği de aynı kısıtla yarışır: yarışı kaybeden istek ham bir veritabanı istisnası değil,
denetimli bir `409 ALREADY_EXISTS` çakışması alır (repository `batch()` çağrısını yakalayıp eşler).

**İnsan puanı ile AI önerisi iki ayrı tablodur.** AI önerileri `rubric_suggestion`, insan puanları
`reviewer_criterion_score` içindedir. Yapay zekâ hiçbir koşulda hakem puanını otomatik yazmaz; AI
önerisini kabul etmek, insan giriş alanını dolduran açık bir hakem eylemidir. Puanlanmamış bir kriter
öneriyi sessizce devralmaz. Eski AI önerileri hiçbir zaman güncellenmez.

**Puan sınırı satırlar arası olduğu için CHECK kısıtı olamaz.** `score >= 0` bir CHECK'tir; üst sınır
pinlenmiş `criterion.max_score` değerine bağlı olduğundan repository INSERT'i bu değeri kendi SQL
koşulunda yeniden okur ve uygulama sınırı bunu ayrıca doğrular. Aralık dışı puan reddedilir,
KIRPILMAZ. `0` geçerli ve güvenilen bir hakem yargısıdır.

**Toplamlar daima sunucuda hesaplanır ve asla birleştirilmez.** İstek şeması `.strict()` olduğu için
`humanTotal` / `totalScore` gibi bir alan taşıyan istek `400` ile reddedilir; toplam sessizce yok
sayılmak yerine açıkça geri çevrilir. Aynı `deriveScoreTotals` / `deriveDecisionTrace` saf
fonksiyonları hem sunucu projeksiyonunu hem arayüzdeki canlı geri bildirimi besler, bu yüzden iki
taraf ayrışamaz. Hiç kriter puanlanmamışsa hakem toplamı `null` döner — dokunulmamış bir rubrik
gerçek bir sıfır gibi sunulmaz.

**Farklılık hata değildir.** Karar izi `AI İLE AYNI` / `AI'DAN FARKLI` / `AI ÖNERİSİ YOK` üretir ve
farklılık uyarı biçimlendirmesi almaz. Gerekçe isteğe bağlıdır: her override için gerekçe zorunlu
kılmak bilinçli olarak yapılmamıştır, çünkü mevcut UX bunu doğrulamamıştır ve zorunlu alan hakemi
anlamsız metin yazmaya iter. Puanlanmamış bir kriter `AI İLE AYNI` sayılmaz.

**Gönderilmiş değerlendirme değişmezdir.** Her repository yazımı `status = 'DRAFT'` koşuluyla
korunur; gönderim, tüm kriter puanları yazıldıktan SONRA en son adımda durumu çevirir. Eski bir
istek tekrar oynatılsa da gönderilmiş kayıt değişmez. Yeniden açma/sürümleme ertelenmiştir. Atama
kaldırma, gönderilmiş bir değerlendirme varsa reddedilir; yalnız taslak varsa atama ve taslak
birlikte silinebilir.

**Rapor erişimi hakemin kendi ataması üzerindendir.** Yeni bir hakem ucu eklendi; mevcut yönetici
ucu değiştirilmedi. İki uç, R2 anahtarını sunucuda tutan ve `private, no-store` döndüren tek bir
`reportResponse` yardımcısını paylaşır (saf çıkarma, yeniden tasarım değil). Kalıcı veya
paylaşılabilir bir R2 URL'si üretilmez.

**PDF için tarayıcının yerleşik görüntüleyicisi seçildi.** Gövde bir kez `fetch` ile alınır, object
URL olarak gömülür; sayfa ve yakınlaştırma URL fragment'ında taşınır ve fragment sunucuya gitmez.
Sayfa değiştiğinde çerçeve yeniden anahtarlanır; kanıt tıklamasının belgeyi hareket ettiren mekanizma
budur. PDF.js paketlemesi ertelendi: yerleşik görüntüleyici sayfa gezinme, yakınlaştırma ve metin
seçmeyi paket maliyeti olmadan sağlıyor ve PDF.js yalnız bu milestone'un iddia etmediği özellikler
(sayfa üstü vurgulama katmanı, açıklama) için gerekir.

Object URL yaşam döngüsü — oluşturma, iz sürme ve serbest bırakma — `report-object-url.ts` içinde
saf, React'e bağımsız bir fonksiyon olarak dışa çıkarılmıştır (`ReportPanel`'in efekti artık bu
fonksiyonu çağırır, mantığı tekrar etmez). Bu, gerçek yaşam döngüsünü jsdom veya bir React renderer
eklemeden birim testiyle doğrulamayı sağlar: URL yalnız blob geldiğinde oluşturulur; dönen `teardown`
çağrıldığında (rota değişimi veya unmount) serbest bırakılır; hâlâ kullanımdayken asla serbest
bırakılmaz; ve teardown zaten çalıştıktan sonra gelen bir yanıt hiçbir zaman URL oluşturmaz — bu
yüzden asla iz sürülmeyen bir sızıntı da oluşmaz.

**Kanıt gezinmesi yalnız sunucu-doğrulamalı kanıtla çalışır.** `evidenceTargetPage` doğrulanmamış bir
kanıt için `null` döner ve hedef sayfa, koşunun çıkarımında kaydedilmiş `pageCount` değerine göre
sınırlanır. Modelin iddia ettiği rastgele bir sayfa numarası hakemi yönlendiremez.

**Yeni yapay zekâ maliyeti yoktur.** Çalışma alanını açmak, kanıda tıklamak, puan değiştirmek,
taslak kaydetmek ve göndermek yalnız kalıcı kayıtları okur/yazar. Normal bir inceleme için gereken
çıkarım sıfırdır.

**Şema değişikliği üç ayrı migration'dır.** SQLite bir foreign key'in ebeveyn sütunlarında zaten bir
UNIQUE indeks bulunmasını ister; bir tabloyu ve onun FK hedefi olan indeksi aynı migration içinde
ters sırada oluşturmak "foreign key mismatch" üretir (P4-02'de karşılaşılmıştı). Bu nedenle
`reviewer_assignment` (`0013`), `reviewer_evaluation` (`0014`) ve `reviewer_criterion_score`
(`0015`) ayrı migration'larda oluşturulmuştur; her çocuk tablo, ebeveyninin parent key indeksi zaten
mevcutken oluşur.

**Test fixture düzeltmesi.** Test-only yerel D1 harness'ı `raw()` sonucunu satır nesnesinin
`Object.values()` çıktısından türetiyordu. Birleştirmeli (`JOIN`) bir SELECT aynı sütun adını iki
tabloda taşıyabilir (`criterion.id` ve `rubric_suggestion.id`); nesne biçimi bu yinelenenleri sessizce
birleştirir ve Drizzle birleştirmeli seçimleri konuma göre eşlediği için ilk çakışmadan sonraki her
sütun kayar. Harness artık `node:sqlite`'ın konumsal satır modunu kullanıyor ve `batch()` desteği
(D1'in örtük transaction semantiğiyle) eklendi. Bu yalnız fixture doğruluğudur; üretim davranışı
değişmedi.

## Veri modeli

```
reviewer_assignment
  id, competition_id, submission_id, reviewer_user_id, assigned_by_user_id, created_at, updated_at
  UNIQUE (submission_id, reviewer_user_id)
  UNIQUE (id, submission_id)                                  -- child parent key
  FK (competition_id, submission_id)      → submission(competition_id, id)
  FK (competition_id, reviewer_user_id)   → competition_member(competition_id, user_id)

reviewer_evaluation
  id, assignment_id, submission_id, analysis_run_id, rubric_version_id,
  status (DRAFT|SUBMITTED), overall_note, created_at, updated_at, submitted_at
  UNIQUE (assignment_id)                                       -- en fazla bir değerlendirme, hiç
  UNIQUE (id, rubric_version_id)                               -- child parent key
  FK (assignment_id, submission_id)       → reviewer_assignment(id, submission_id)
  FK (submission_id, analysis_run_id)     → analysis_run(submission_id, id)
  FK (analysis_run_id, rubric_version_id) → analysis_run(id, rubric_version_id)
  CHECK status ∈ {DRAFT, SUBMITTED}; (SUBMITTED ⇔ submitted_at IS NOT NULL)

reviewer_criterion_score
  id, reviewer_evaluation_id, rubric_version_id, criterion_id, score, note, created_at, updated_at
  UNIQUE (reviewer_evaluation_id, criterion_id)                -- kriter başına tek insan puanı
  FK (reviewer_evaluation_id, rubric_version_id) → reviewer_evaluation(id, rubric_version_id)
  FK (rubric_version_id, criterion_id)           → criterion(rubric_version_id, id)
  CHECK score >= 0                                             -- üst sınır uygulama + INSERT koşulu
```

Migration'lar: `0013_noisy_kitty_pryde.sql`, `0014_white_wilson_fisk.sql`,
`0015_dashing_lionheart.sql`. Hepsi Drizzle üretici aracıyla oluşturulmuştur; commit edilmiş hiçbir
migration düzenlenmemiştir. (0014/0015 bu doğrulama turunda `UNIQUE(assignment_id)` kısıtını
yansıtacak şekilde, henüz commit edilmemişken yeniden üretildi — üretici araçla, elle SQL
düzenlenmeden.)

## API yüzeyi

Hakem uçları (`submission:review` + atama sahipliği):

```
GET  /api/v1/competitions/:competitionId/review/assignments
GET  /api/v1/competitions/:competitionId/review/assignments/:assignmentId/workspace
GET  /api/v1/competitions/:competitionId/review/assignments/:assignmentId/report
PUT  /api/v1/competitions/:competitionId/review/assignments/:assignmentId/evaluation
POST /api/v1/competitions/:competitionId/review/assignments/:assignmentId/evaluation/submit
```

Atama ve operasyon uçları (`review:assign`):

```
GET    /api/v1/competitions/:competitionId/reviewers
GET    /api/v1/competitions/:competitionId/reviewer-assignments
POST   /api/v1/competitions/:competitionId/reviewer-assignments
DELETE /api/v1/competitions/:competitionId/reviewer-assignments/:assignmentId
```

Arayüz rotaları: `/app/review`, `/app/review/:competitionId/:assignmentId`,
`/app/competitions/:competitionId/reviewers`.

## Doğrulama

```bash
pnpm typecheck   # temiz
pnpm test        # shared 53 · ai 13 · db 7 script · web 339
pnpm lint        # temiz
pnpm build       # temiz, build output secret güvenlik kontrolü dahil
pnpm smoke:p5
pnpm smoke:p4-01b
pnpm smoke:p4-01a
pnpm smoke:p3-02
pnpm smoke:p3-01
pnpm smoke:p2-03
pnpm db:migrate:local
pnpm db:migrations:list:local
git diff --check
```

Yeni `pnpm smoke:p5` gate'i hakem yetkilendirmesi, değerlendirme kalıcılığı, izin eşlemesi, çalışma
alanı panelleri, kanıt gezinmesi, PDF object URL yaşam döngüsü ve P4-02 rubrik regresyonunu birlikte
çalıştırır.

**Kalıcı doğrulama turu (bu belgenin ilk sürümünden sonra):** `reviewer_evaluation` şeması
`UNIQUE(assignment_id, analysis_run_id)` + kısmi "en fazla bir açık taslak" indeksinden tek,
kapsayıcı `UNIQUE(assignment_id)` kısıtına geçirilmiştir; bu, 0014/0015 migration'larının (henüz
commit edilmemişken) üretici araçla yeniden üretilmesini ve repository/route katmanının "atamanın
güncel değerlendirmesi" seçme mantığından "atamanın TEK değerlendirmesi" mantığına
sadeleştirilmesini gerektirmiştir. Ayrıca test-only yerel D1 harness'ının `batch()` şimi, aynı
bağlantı üzerinde çakışan `BEGIN`lerin "cannot start a transaction within a transaction" hatası
vermesini önlemek için ardışık bir promise zincirine bağlanmıştır — gerçek D1 her `batch()`'i kendi
atomik birimi olarak çalıştırdığından bu saf bir fixture düzeltmesidir, üretim davranışını
değiştirmez, ve bu düzeltme olmadan eşzamanlı/tekrarlanan bir ilk kayıt isteğini kapsayan test
gerçek bir yarış koşulu yerine fixture'ın kendi kısıtını gözlemliyordu.

Uzak smoke gerekmez ve yapılmamıştır.

## Kapsam dışı ve ertelenenler

- Akıllı Risk Kuyruğu (bu görevde açıkça kapsam dışı)
- gönderilmiş değerlendirmeyi yeniden açma veya sürümleme
- birden çok hakemin puanlarından yarışma geneli uzlaşma veya nihai karar üretme
- uygulama içi PDF.js render katmanı ve sayfa üstü vurgulama
- yarışmacı geri bildirim yüzeyi (`feedback:view-own`)
- dağıtım, uzak D1/R2/Vectorize kaynağı, production Vectorize index'i
