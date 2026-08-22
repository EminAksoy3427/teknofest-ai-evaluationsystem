# Yarışmacı sahipliği ve yayımlanmış geri bildirim

Bu belge P6.5A ile eklenen `submission_participant` sahiplik modelini ve `contestant_feedback`
yayımlama sınırını anlatır. `docs/architecture/reviewer-workflow.md`'de anlatılan hakem karar izini
tüketir; onu değiştirmez.

Ürün sınırı: bir yarışmacı hiçbir zaman iç analiz veya hakem tablolarını doğrudan sorgulamaz.
Bir yarışmacının görebileceği tek şey, bu belgede tanımlanan **açık, insan onaylı yayım
projeksiyonudur**.

## 1. Sahiplik: rol tek başına yetmez

CONTESTANT rolü var olmasına rağmen P6.5A öncesi hiçbir başvuru sahipliği sınırı yoktu.
`submission_participant`, bir kimliği doğrulanmış CONTESTANT üyesini bir başvuruya bağlayan açık,
yarışma kapsamlı kaydı taşır — `reviewer_assignment`in hakem için yaptığının aynısını yarışmacı
için yapar.

Çapraz yarışma ataması veritabanı sınırında imkânsızdır: iki composite foreign key,
`(competition_id, submission_id) → submission(competition_id, id)` ve
`(competition_id, user_id) → competition_member(competition_id, user_id)`, atanan başvurunun ve
kullanıcının bu satırın kendi yarışmasına ait olmasını zorunlu kılar. Hedef kullanıcının gerçekten
CONTESTANT rolünde olması, `reviewer_assignment`in REVIEWER için yaptığı gibi, repository'nin kendi
`WHERE role = 'CONTESTANT'` koşullu INSERT'iyle doğrulanır — bir composite foreign key sabit bir
değeri filtreleyemez.

Bir başvuruya birden fazla katılımcı eklenebilir (takım); aynı kullanıcı birden fazla başvuruda
katılımcı olabilir. Yalnız `(submission_id, user_id)` çifti benzersizdir.

### Yönetim

`competition:configure` izniyle (yalnız COMPETITION_MANAGER) korunur:

```text
GET    /api/v1/competitions/:competitionId/contestants
GET    /api/v1/competitions/:competitionId/submissions/:submissionId/participants
POST   /api/v1/competitions/:competitionId/submissions/:submissionId/participants
DELETE /api/v1/competitions/:competitionId/submissions/:submissionId/participants/:participantId
```

Bir yarışmacı asla kendini rastgele bir başvuruya ekleyemez; istemci yalnız var olan bir kullanıcı
kimliğini seçer, repository'nin kendi guard'lı INSERT'i geri kalanını doğrular. Arayüz
`apps/web/src/client/submission-participants-page.tsx`'te, başvurular tablosundaki "Katılımcılar"
bağlantısından erişilir.

## 2. ContestantFeedback: kontrollü bir yayım sınırı

`contestant_feedback`, ham analiz veya hakem verisinin bir yansıması değildir; **açık, insan onaylı
bir yayım kaydıdır**. `DRAFT` yöneticiye açık ve düzenlenebilirdir; **varlığı bile** yarışmacıya
asla açıklanmaz. `PUBLISHED`, değişmezdir ve yalnız o zaman yarışmacıya görünür.

### Kaynak: yalnız gönderilmiş bir hakem değerlendirmesi

Bir yayım, yalnız şu koşulları taşıyan bir `ReviewerEvaluation`a dayanabilir:

- `status = 'SUBMITTED'`,
- aynı başvuruya ait,
- aynı yarışmaya ait (atamasının `competition_id`'si üzerinden).

Bu, `(submission_id, source_reviewer_evaluation_id) → reviewer_evaluation(submission_id, id)`
composite foreign key'iyle (kapsam) ve repository'nin kendi `WHERE status = 'SUBMITTED'` koşuluyla
(değer) birlikte doğrulanır — tıpkı diğer tabloların composite FK + değer koşulu ayrımını
kullanması gibi. Bitmemiş (DRAFT) bir hakem değerlendirmesi asla bir yayımın kaynağı olamaz.

Kaynak, ilk taslak oluşturulduğunda sabitlenir: `ReviewerEvaluation.analysisRunId`in kendi
atamasına sabitlenmesiyle aynı tarihsel disiplin. Farklı bir kaynak öneren sonraki bir kayıt
`STALE_SOURCE` çakışmasıyla reddedilir.

### Türetilmiş öneri: sıfır yeni yapay zekâ çıkarımı

`getContestantFeedbackSuggestion` (`packages/db/src/contestant-feedback.ts`), zaten kalıcı ve
doğrulanmış veriden — kaynak değerlendirmenin insan kriter puanlarından ve o AnalysisRun'ın
doğrulanmış `RubricSuggestion.missingPoints` alanından — deterministik bir taslak metni türetir.
Bu **yeni bir yapay zekâ çağrısı değildir**: sayılar ve zaten sunucu tarafından doğrulanmış
dizeler üzerinde aritmetik ve şablonlamadır.

Bu üretilen metin **İÇ KAYNAK VERİSİDİR, yayım içeriği değildir**. Hiçbir zaman doğrudan bir
`ContestantFeedback` satırına yazılmaz; yönetici arayüzünde ayrı bir kutuda gösterilir ve yalnız
açık bir "Öneriyi içeriğe uygula" eylemiyle düzenlenebilir alanlara kopyalanır
(`apps/web/src/client/submission-feedback-page.tsx`). Yapay zekâ metni asla otomatik
yayımlanmaz.

### Yayımlama: insan onayı

DRAFT dilediği kadar eksik kalabilir. Yayımlama (`publishContestantFeedback`) ise Problem 4'ün
yarışmacıya verdiği sözün tamamını gerektirir: boş olmayan bir özet ve **en az birer madde** içeren
güçlü yönler, gelişim alanları ve öneriler listeleri
(`PublishableContestantFeedbackContentSchema`). Eksik içerik `INCOMPLETE` doğrulama hatasıyla
reddedilir. Yalnız boşluk içeren maddeler taslak kaydı sınırında zaten reddedilir, bu nedenle hiçbir
zaman yayıma ulaşamaz.

Sunucu eksik bölümü **tamamlamaz**: yayım içeriğinin yazarı insandır. Bir projenin belirgin bir zayıf
yönü yoksa, yönetici oraya gerçeğe uygun bir geliştirme veya devam önerisi yazar; sistem yayım
sırasında içerik uydurmaz. Yayımlama tamamen insan eylemidir: bu çağrının hiçbir yerinde model
çağrısı yoktur.

Bir başvuru için **en fazla bir** `ContestantFeedback` kaydı vardır (`UNIQUE(submission_id)`) — bu
MVP için yeterlidir. `PUBLISHED` değişmezdir; yeniden açma veya sürümleme bilinçli olarak
ertelenmiştir.

### Yönetim API'si

`competition:view-operations` izniyle korunur — hem COMPETITION_MANAGER hem EVALUATION_MANAGER
erişir, çünkü yayımlama değerlendirme operasyonunun doğal bir uzantısıdır; REVIEWER (yalnız
`submission:review` taşır) ve CONTESTANT erişemez.

```text
GET  /api/v1/competitions/:competitionId/submissions/:submissionId/feedback/sources
GET  /api/v1/competitions/:competitionId/submissions/:submissionId/feedback
GET  /api/v1/competitions/:competitionId/submissions/:submissionId/feedback/suggestion
PUT  /api/v1/competitions/:competitionId/submissions/:submissionId/feedback
POST /api/v1/competitions/:competitionId/submissions/:submissionId/feedback/publish
```

## 3. Yarışmacı yüzeyi: yalnız güvenli, yayımlanmış projeksiyon

Yarışmacı uçları kasıtlı olarak `:competitionId` taşımaz: kimlik yalnız oturumdan gelir, sahiplik
yalnız `submission_participant`ten gelir; istemcinin gönderdiği bir `userId` hiçbir zaman kabul
edilmez.

```text
GET /api/v1/me/submissions
GET /api/v1/me/submissions/:submissionId/feedback
```

`getPublishedFeedbackForContestant`, sahiplik kontrolünü ve `status = 'PUBLISHED'` kontrolünü
**aynı sorguda** yapar: sahip olunmayan bir başvuru ile sahip olunan ama henüz yayımlanmamış
(veya hiç var olmayan) bir sonuç birbirinden ayırt edilemez — ikisi de yalnız `null` döner, hiçbir
zaman farklı bir hata koduyla hangi durumun geçerli olduğu sızdırılmaz. HTTP ucu bunu her zaman
düz `404` + "Değerlendirme sonucu henüz yayımlanmadı." olarak raporlar.

Döndürülen `PublishedContestantFeedbackResponse` kasıtlı olarak şunları **hiçbir zaman**
içermez:

- `AnalysisRun` kimliği veya herhangi bir dahili kimlik,
- hakem kimliği,
- eşleşen başka başvuru veya diğer proje başlığı/kodu,
- benzerlik, öncelik veya AI/insan uyuşmazlık verisi,
- ham `AnalysisCheck` detayları veya yapay zekâ sağlayıcı çıktısı,
- depolama anahtarları,
- sayısal nihai puan.

Son madde bilinçli bir ürün politikasıdır: brief'in gereksinimi nitel geri bildirimdir, yayımlanan
bir puan politikası değildir. Arayüz (`apps/web/src/client/my-results-page.tsx`) yalnız özet, güçlü
yönler, gelişim alanları ve önerileri gösterir.

Bu dört bölüm yanıt şemasında isteğe bağlı değil zorunludur: yayım sınırı zaten hepsini şart
koştuğu için, bu bölümlerden biri olmadan yarışmacıya ulaşan bir sonuç geçerli bir kısmi yanıt değil
sözleşme ihlali olurdu. Okuma sorgusu da aynı tamlık koşulunu tekrar uygular; koşulu sağlamayan bir
satır kısmi olarak sunulmak yerine "henüz yayımlanmadı" gibi ele alınır.

## 4. Tarihsel bütünlük

`Template v2` etkinleştirilse, `Rubric v2` etkinleştirilse ve aynı başvuru için yeni bir
`AnalysisRun R2` oluşsa da, önceden yayımlanmış bir `ContestantFeedback`, kendi sabitlenmiş
`source_reviewer_evaluation_id`sine (ve onun üzerinden E1'in kendi sabitlenmiş AnalysisRun/Rubrik
bağlamına) işaret etmeyi sürdürür. Hiçbir tarihsel yayım v2/R2'ye kaymaz.
Bu senaryo `apps/web/src/server/p6-5a-historical-integrity.test.ts`'te doğrulanmıştır.

## 5. Sıfır yeni yapay zekâ çıkarımı

Bu özelliğin hiçbir parçası — katılımcı yönetimi, taslak kaydetme, öneri türetme, yayımlama,
yarışmacı okuması — bir model çağrısı, gömme isteği veya vektör sorgusu yapmaz. Öneri türetmesi
`packages/db/src/contestant-feedback.ts` içinde saf bir okuma + aritmetik fonksiyondur.
