# Hakem iş akışı

Bu belge P5 ile eklenen hakem atama modelini, üç panelli hakem çalışma alanını, insan
değerlendirmesinin kalıcılığını ve İnsan–AI karar izini anlatır.

Ürün sınırı: yapay zekâ hakemin yerini almaz. Yapay zekâ kanıta dayalı, açıklanabilir karar desteği
üretir; nihai yarışma kararı daima insanda kalır.

## 1. Erişim modeli: rol yeterli değildir

`REVIEWER` rolü `submission:review` iznini taşır, fakat bu izin tek başına hiçbir başvuruya erişim
vermez. Bir hakem yalnız kendisine açıkça verilmiş bir `ReviewerAssignment` üzerinden bir başvuruyu
açabilir. Atama yoksa istek reddedilir.

| Rol | Atama yönetimi (`review:assign`) | Operasyon görünürlüğü (`competition:view-operations`) | Başvuru değerlendirme (`submission:review`) |
| --- | --- | --- | --- |
| `COMPETITION_MANAGER` | evet | evet | **hayır** |
| `EVALUATION_MANAGER` | evet | evet | **hayır** |
| `REVIEWER` | hayır | hayır | evet, **yalnız atanmış başvurular için** |
| `CONTESTANT` | hayır | hayır | hayır |

Roller hiyerarşik değildir. `submission:review` bilinçli olarak hiçbir yönetici rolüne verilmemiştir:
değerlendirme yöneticisi değerlendirme operasyonunu yürütür ama hakem kimliğine bürünüp puan
veremez. Simetrik olarak hakem, atama yönetimi veya operasyon tablosuna erişemez.

Her hakem ucu iki adımı sırayla uygular:

1. Yarışma kapsamlı üyelik ve `submission:review` izni (`requireCompetitionPermission`).
2. Oturum kullanıcısının sahibi olduğu atamanın yarışma kapsamlı çözümü
   (`getOwnedReviewerAssignment`).

Başka bir hakemin ataması veya başka bir yarışmanın ataması `404` döner, `403` dönmez: yanıt, başka
bir hakemin işi hakkında hiçbir bilgi sızdırmaz.

## 2. Çapraz yarışma izolasyonu veritabanı sınırındadır

`reviewer_assignment` iki composite foreign key taşır:

- `(competition_id, submission_id) → submission(competition_id, id)` — atanan başvuru bu atamanın
  yarışmasına ait olmalıdır.
- `(competition_id, reviewer_user_id) → competition_member(competition_id, user_id)` — hakem aynı
  yarışmada üye olmalıdır.

Bu nedenle çapraz yarışma ataması yalnız uygulama kodunda değil veritabanı düzeyinde imkânsızdır.
Hedef kullanıcının gerçekten `REVIEWER` rolünde olması ayrıca repository INSERT'inin kendi
`WHERE EXISTS` koşuluyla doğrulanır; `competition_id` ve `submission_id` değerleri istemciden değil
`submission` satırının kendisinden yazılır.

`(submission_id, reviewer_user_id)` benzersizdir: aynı hakem aynı başvuruya en fazla bir kez
atanabilir. Aynı başvuruya birden fazla hakem atanabilir ve her hakemin değerlendirmesi tamamen
ayrıdır.

## 3. Tarihsel sabitleme (pinning)

`ReviewerEvaluation` bir atamaya, o atamanın başvurusuna, hakemin gerçekten incelediği
`AnalysisRun`a ve o koşunun kendi `RubricVersion`una sabitlenir. Bir `ReviewerAssignment` en fazla
BİR `ReviewerEvaluation` taşır — `reviewer_evaluation` tablosundaki `UNIQUE(assignment_id)` bunu
veritabanı sınırında zorunlu kılar. İlk taslak oluşturulduğu anda (o anki güncel `AnalysisRun`a
sabitlenerek) atamanın tek değerlendirmesi doğar; taslak hâlindeyken de dahil, aynı atama için ikinci
bir değerlendirme satırı bir daha asla oluşturulamaz. Dört composite foreign key bu sabitlenmiş
kimliği taşır:

- `(assignment_id, submission_id) → reviewer_assignment(id, submission_id)`
- `(submission_id, analysis_run_id) → analysis_run(submission_id, id)`
- `(analysis_run_id, rubric_version_id) → analysis_run(id, rubric_version_id)`

`reviewer_criterion_score` de aynı deseni izler:

- `(reviewer_evaluation_id, rubric_version_id) → reviewer_evaluation(id, rubric_version_id)`
- `(rubric_version_id, criterion_id) → criterion(rubric_version_id, id)`

Zorunlu senaryo şudur: R1 koşusu Rubrik v1'e sabitlenir, hakem R1'i değerlendirir, sonra Rubrik v2
etkinleştirilir ve yeni bir R2 koşusu oluşur. Değerlendirme R1 + Rubrik v1 + o koşunun AI önerileri +
insan puanlarıyla değişmez kalır; ne taslak ne gönderilmiş hâldeyken `analysis_run_id` veya
`rubric_version_id` v2/R2'ye kayabilir — bu alanlar atamanın tek değerlendirmesi üzerinde asla
güncellenmez. Yeni yapılandırmaya karşı değerlendirme yapmanın tek yolu YENİ bir `ReviewerAssignment`
oluşturmaktır (mevcut atamayı kaldırıp yeniden atamak). Eşzamanlı veya tekrarlanan bir ilk kayıt
isteği bu benzersizlik kısıtını çiğneyemez: yarışı kaybeden istek denetimli bir `409` çakışması alır,
sessizce ikinci bir satır oluşturmaz veya beklenmeyen bir sunucu hatasına düşmez.

Çalışma alanı hangi koşuya sabitlenir:

- Atamanın bir değerlendirmesi (taslak veya gönderilmiş) varsa o değerlendirmenin kendi
  `analysisRunId`si.
- Yoksa başvurunun en yeni `SUCCEEDED` koşusu — ilk taslak kaydedildiğinde değerlendirme işte bu
  koşuya sabitlenir.
- Tamamlanmış koşu yoksa uç `409` döner ve arayüz "analiz hazır değil" durumunu gösterir.

## 4. Üç panelli çalışma alanı

Rota: `/app/review/:competitionId/:assignmentId`. Hakem kuyruğu: `/app/review`.

| Panel | İçerik |
| --- | --- |
| SOL | Başvuru raporu (PDF), sayfa gezinme ve yakınlaştırma |
| ORTA | AI 4. Göz — koşuda kayıtlı deterministik, semantik, benzerlik ve rubrik sinyalleri |
| SAĞ | Hakem Kararı — kriter başına AI önerisi ve ayrı insan puanı girişi |

Masaüstünde (`xl` ve üzeri) üç panel aynı anda operasyoneldir. Daha dar ekranlarda paneller tek tek
görüntülenir; seçim düğmeleri panelleri değiştirir ama panelleri DOM'dan kaldırmaz, bu yüzden panel
değiştirmek raporu yeniden yüklemez ve kaydedilmemiş bir puanı kaybetmez. Geniş içerik (tablolar,
alıntılar) kendi kabında kaydırılır; sayfa gövdesi yatay taşmaz.

### Rapor paneli

Rapor, hakemin kendi ataması üzerinden korunan uçtan okunur:
`GET /api/v1/competitions/:competitionId/review/assignments/:assignmentId/report`. R2 nesne anahtarı
sunucuda tutulan metadata'dan çözülür; anahtar, bucket adı veya kalıcı/paylaşılabilir bir URL
tarayıcıya asla verilmez. Yanıt `private, no-store` ile işaretlenir.

PDF gövdesi bir kez `fetch` ile alınır ve tarayıcının yerleşik görüntüleyicisine bir object URL
olarak verilir. Sayfa ve yakınlaştırma görüntüleyici URL fragment'ında taşınır; fragment sunucuya
gitmez, dolayısıyla korunan ucun döndürdüğü şeyi genişletemez. Sayfa numarası değiştiğinde çerçeve
yeniden anahtarlanır — kanıt tıklamasının belgeyi gerçekten hareket ettiren mekanizma budur.

Bilinçli olarak ertelenen: PDF.js'in uygulama içinde paketlenmesi. Yerleşik görüntüleyici sayfa
gezinme, yakınlaştırma ve metin seçmeyi paket maliyeti olmadan sağlıyor; PDF.js yalnız bu
milestone'un iddia etmediği özellikler (sayfa üzerinde vurgulama katmanı, açıklama) için gerekir.

### Kanıt → sayfa gezinmesi

Bu, ürünün çekirdek etkileşimidir. AI panelindeki her sunucu-doğrulamalı kanıt alıntısının yanında
"Sayfa N" gerçek bir `<button>` olarak durur: klavyeyle erişilebilir, Enter/Space ile
etkinleştirilebilir ve odak göstergesi görünür.

Yalnız `verified: true` kanıt gezinme hedefi üretir. `evidenceTargetPage` doğrulanmamış bir kanıt için
`null` döner; ayrıca hedef sayfa, koşunun çıkarım aşamasında kaydedilmiş `pageCount` değerine göre
sınırlanır. Modelin iddia ettiği rastgele bir sayfa numarası hakemi hiçbir zaman yönlendiremez.

### AI 4. Göz paneli

Panel dört grupta sunar:

- **Ön Kontroller:** Dil, Rapor Formatı, Zorunlu Bölümler
- **İçerik:** Bölüm İçeriği, Kategori Uyumu
- **Benzerlik:** benzerlik sinyali, eşleşen başvurular, bölüm kanıtı ve sayfaları
- **AI Rubrik:** AI öneri toplamı ve dikkat gerektiren kriterler (kriter bazındaki
  öneriler sağ panelde puan girişinin yanında durur)

Durum etiketleri `Uygun` / `İncelenmeli` / `Uygun değil`; durum yalnız renkle değil metinle de
belirtilir. `FAIL` bir karar veya ret değildir, en güçlü inceleme sinyalidir. Benzerlik bir inceleme
sinyalidir; intihal tespiti, kopya kararı veya nihai karar değildir ve birebir eşleşme de bunu
değiştirmez.

## 5. İnsan puanı AI önerisinden ayrıdır

AI önerileri `rubric_suggestion` tablosunda, insan puanları `reviewer_criterion_score` tablosunda
durur. Bu iki kayıt hiçbir zaman birleştirilmez, üst üste yazılmaz veya birbirine kopyalanmaz.

Yapay zekâ hiçbir koşulda hakem puanını otomatik olarak yazmaz. AI önerisini kabul etmek açık bir
hakem eylemidir: "AI önerisini puan olarak kullan" düğmesi insan giriş alanını doldurur, hakem
isterse aynı, daha düşük veya daha yüksek bir puan verir. Puanlanmamış bir kriter puanlanmamış
kalır; öneriyi sessizce devralmaz.

Uygulama sınırında her puan pinlenmiş `criterion.max_score`a karşı doğrulanır. `0` geçerli ve
güvenilen bir hakem yargısıdır. Aralık dışındaki bir puan reddedilir, kırpılmaz. Kriterin pinlenmiş
rubrik sürümüne ait olmadığı durum da reddedilir. `0..max_score` üst sınırı satırlar arası olduğu
için CHECK kısıtı olamaz; repository INSERT'i pinlenmiş `criterion.max_score` değerini kendi SQL
koşulunda yeniden okur.

## 6. İnsan–AI karar izi

Kriter başına gösterilen ve türetilen alanlar:

```
AI önerisi: 7/10
Hakem puanı: 5/10
Fark: -2
```

Sınıflandırma `AI İLE AYNI`, `AI'DAN FARKLI` veya `AI ÖNERİSİ YOK` olur. Sınıflandırma
`deriveDecisionTrace` ile üretilir; aynı saf fonksiyon sunucuda projeksiyonu, arayüzde canlı
geri bildirimi besler, bu yüzden iki taraf birbirinden ayrışamaz.

Farklılık hakem hatası değildir ve uyarı gibi biçimlendirilmez. Farklı puan verildiğinde kısa bir
gerekçe yazılabilir; bu zorunlu değildir. Her override için gerekçe zorunlu kılmak bilinçli olarak
yapılmamıştır: mevcut UX bunun faydalı olduğunu kanıtlamamıştır ve zorunlu alan, hakemi anlamsız
metin yazmaya iter.

Henüz puanlanmamış bir kriter `AI İLE AYNI` olarak sınıflandırılmaz — dokunulmamış bir rubrik
mutabakat gibi okunamaz.

Karar izi tarihsel olarak yeniden kurulabilir kalır; kaynaklar değişmezdir:

- `AnalysisRun` (pinlenmiş kategori, şablon, rubrik sürümü, kaynak SHA-256, model ve prompt sürümü)
- `RubricSuggestion` (koşu ve kriter başına AI önerisi)
- `ReviewerEvaluation` (pinlenmiş koşu ve rubrik sürümü, durum, gönderim zamanı)
- `ReviewerCriterionScore` (kriter başına insan puanı ve gerekçesi)

Eski AI önerileri asla güncellenmez.

## 7. Toplam puan

Her iki toplam da sunucuda hesaplanır. İstemcinin gönderdiği bir toplam güvenilmez: istek şeması
`.strict()` olduğu için `humanTotal`, `totalScore` gibi bir alan taşıyan istek `400` ile reddedilir,
sessizce yok sayılmaz.

AI önerisi toplamı ile hakem toplamı görsel ve metinsel olarak ayrıdır ve tek bir puana
birleştirilmez:

```
AI önerisi: 72/100
Hakem puanı: 68/100
```

Hiç kriter puanlanmamışsa hakem toplamı `null` döner — dokunulmamış bir rubrik gerçek bir sıfır puan
gibi sunulmaz. Bilinçli verilen `0` ise puanlanmış bir kriter olarak sayılır.

`deriveScoreTotals` saf fonksiyonu çalışma alanı projeksiyonunu besler; operasyon tablosundaki
toplu toplamlar aynı kalıcı satırlardan veritabanı tarafında toplanır.

## 8. Taslak ve gönderim

Hakem her an bir taslak kaydedebilir (`PUT .../evaluation`). Taslak kaydı kısmi olabilir; yalnız
girilen puanlar yazılır ve temizlenen bir puan bayat değer bırakmadan silinir.

Gönderim (`POST .../evaluation/submit`) şunları gerektirir:

- pinlenmiş rubriğin tüm kriterleri puanlanmış olmalı
- her puan `0..criterion.max_score` aralığında olmalı
- atama hâlâ geçerli ve oturum kullanıcısına ait olmalı
- pinlenmiş `AnalysisRun` hâlâ mevcut ve `SUCCEEDED` olmalı

Gönderim yalnız BU HAKEMİN değerlendirmesini tamamlar. Projeyi elemez, kazanan seçmez, yarışma
genelinde nihai bir karar üretmez ve başka bir hakemin değerlendirmesini etkilemez.

Gönderilmiş değerlendirme değişmezdir: her repository yazımı `status = 'DRAFT'` koşuluyla korunur,
bu yüzden eski bir istek tekrar oynatılsa da gönderilmiş kayıt değişmez. Gönderilmiş bir
değerlendirmeyi yeniden açma veya sürümleme yeteneği bilinçli olarak ertelenmiştir; gerekirse yeni
bir `AnalysisRun` için yeni bir değerlendirme açılır.

Atama kaldırma: gönderilmiş bir değerlendirme varsa atama kaldırılamaz — tamamlanmış insan
değerlendirmesi kaydı korunur. Yalnız taslak varsa atama kaldırılabilir ve taslak onunla birlikte
silinir.

## 9. Operasyon görünürlüğü

`COMPETITION_MANAGER` ve `EVALUATION_MANAGER` için `/app/competitions/:competitionId/reviewers`
minimum atama ve değerlendirme durumunu gösterir: atanan hakem, değerlendirme durumu, gönderilmiş
hakem toplamı, AI öneri toplamı ve AI önerisinden farklı kriter sayısı. AI öneri toplamı ve hakem
toplamı ayrı sütunlardır.

Akıllı Risk Kuyruğu bu kapsamda bilinçli olarak yoktur.

## 10. Yeni yapay zekâ maliyeti yoktur

Hakem çalışma alanı yalnız kalıcı hâle getirilmiş analizi tüketir. Aşağıdaki eylemlerin hiçbiri model
çağrısı yapmaz:

- çalışma alanını açmak
- kanıt sayfasına tıklamak
- puan değiştirmek
- taslak kaydetmek
- değerlendirmeyi göndermek

Normal bir inceleme için gereken yapay zekâ çıkarımı sıfırdır.

## 11. Erişilebilirlik

- tüm kontroller klavyeyle erişilebilir; kanıt sayfa bağlantıları gerçek `<button>` öğeleridir
- odak göstergesi görünür (`focus-visible` çıktısı)
- her form alanının bağlı bir `<label>`ı vardır; görsel olarak gizli etiketler `sr-only` kullanır
- durum metinle belirtilir, yalnız renkle taşınmaz
- yükleniyor, boş, hata ve "analiz hazır değil" durumları açıkça yazılır
- aralık dışı puan `aria-invalid` ve `role="alert"` ile bildirilir
- panel seçimi `<fieldset>`/`<legend>` ile gruplanır; klavye tuzağı yoktur
