# Değerlendirme operasyonu ve inceleme önceliği

Bu belge P6 ile eklenen **İnceleme Önceliği** modelini (Smart Risk Queue) ve yönetici
değerlendirme operasyonu görünümünü anlatır.

Ürün sınırı: inceleme önceliği bir **dikkat sinyali sıralamasıdır**. Olasılık, risk yüzdesi,
intihal skoru veya nihai yarışma kararı değildir. Yüksek öncelik "bir insan buna önce bakmalı"
demektir; "bu başvuru reddedilmeli" demek değildir. Nihai karar daima insandadır.

## 1. Türetilmiş projeksiyon, kalıcı değer değil

İnceleme önceliği hiçbir yerde saklanmaz. Bir `risk` tablosu, bir öncelik sütunu veya
önbelleğe alınmış bir skor **yoktur**. Kuyruk her istekte şu hâlihazırda kalıcı kayıtlardan
yeniden türetilir:

| Kaynak | Kullanılan bilgi |
| --- | --- |
| `submission`, `submission_file` | başvuru kimliği, kategori, içerik SHA-256 |
| `analysis_run` | en yeni koşunun durumu/aşaması/hata kodu, en yeni **başarılı** koşu |
| `analysis_check` | `LANGUAGE`, `TEMPLATE_STRUCTURE`, `SECTION_PRESENCE`, `SECTION_CONTENT`, `CATEGORY_FIT`, `SIMILARITY`, `RUBRIC_EVALUATION` durumları ve detayları |
| `rubric_suggestion` | AI öneri toplamı ve kriter bazlı AI/insan farkı |
| `reviewer_assignment` | atanmış hakemler |
| `reviewer_evaluation`, `reviewer_criterion_score` | değerlendirme durumu, hakem toplamı, fark sayısı |

Bunun iki nedeni var. Birincisi, kalıcı bir öncelik özetlediği değişmez kayıtlardan sapabilir;
türetilmiş projeksiyon sapamaz. İkincisi, tüm girdiler tek bir yarışma içinde ucuza yeniden
okunabilir, dolayısıyla kalıcılaştırmanın somut bir gerekçesi yoktur.

**Sıfır yeni yapay zekâ çıkarımı.** Kuyruğu açmak, filtrelemek, sıralamak veya yenilemek hiçbir
model çağrısı, gömme isteği veya vektör sorgusu yapmaz. Yalnız okuma yapılır; hiçbir satır
yazılmaz.

## 2. Referans koşu ayrımı

İki koşu kavramı ayrı tutulur:

- **En yeni koşu** (`latestRun*`): operasyon tablosundaki "Analiz" sütununun bildirdiği koşu.
  Herhangi bir durumda olabilir.
- **Referans koşu** (`referenceRunId`): en yeni **`SUCCEEDED`** koşu. Yalnız bu koşunun
  kalıcı `AnalysisCheck` sonuçları öncelik sinyallerini besler.

Bu ayrım sayesinde devam eden veya başarısız yeni bir koşu, hakemin elindeki gerçek kanıtı sessizce
geçersiz kılmaz: en yeni koşu `FAILED` olsa bile eski başarılı koşunun kontrolleri görünür kalır ve
`ANALYSIS_FAILED` gerekçesi bunun yanına eklenir.

## 3. Deterministik kural: toplama modeli

Model bilinçli olarak sıkıcıdır. Gizli çarpan, kırpma veya geçersiz kılma yoktur:

```
score = Σ weight(reason)

level = HIGH    (score ≥ 6)
        MEDIUM  (score ≥ 3)
        LOW     (aksi hâlde)
```

Sonuç, döndürülen gerekçe listesinin toplamına **tam olarak** eşittir. Bu, şema düzeyinde
zorunludur: `ReviewPriorityAssessmentSchema`, puanı gerekçe ağırlıklarının toplamına eşit olmayan bir
değerlendirmeyi reddeder. Yani yöneticiye gösterilmeyen bir sinyal seviyeyi etkileyemez.

### Gerekçeler ve ağırlıklar

Ağırlıklar `packages/shared/src/review-priority.ts` içindeki
`REVIEW_PRIORITY_REASON_WEIGHTS` tablosunda tek bir yerde durur ve dışa aktarılır; kural gizli
değildir.

| Gerekçe kodu | Ağırlık | Kullanıcıya görünen metin |
| --- | --- | --- |
| `ANALYSIS_FAILED` | 6 | Analiz çalışması tamamlanamadı |
| `SIMILARITY_HIGH` | 6 | Yüksek benzerlik sinyali |
| `ANALYSIS_MISSING` | 4 | Tamamlanmış analiz çalışması yok |
| `EXACT_DOCUMENT_MATCH` | 4 | Birebir belge eşleşmesi |
| `CATEGORY_FIT_FAIL` | 4 | Kategori uyumu uygun değil |
| `SECTION_CONTENT_FAIL` | 3 | Bölüm içeriği beklentiyi karşılamıyor |
| `SECTION_PRESENCE_FAIL` | 3 | Zorunlu başlıklar eksik |
| `LANGUAGE_FAIL` | 3 | Rapor dili beklenen dille uyumlu değil |
| `SIMILARITY_MEDIUM` | 2 | Orta düzey benzerlik sinyali |
| `CATEGORY_FIT_WARN` | 2 | Kategori uyumu incelenmeli |
| `SECTION_CONTENT_WARN` | 2 | Bölüm içeriği incelenmeli |
| `REQUIRED_SECTION_WEAK_EVIDENCE` | 2 | *N* zorunlu bölümde zayıf kanıt |
| `TEMPLATE_STRUCTURE_FAIL` | 2 | Şablon yapısı uygun değil |
| `RUBRIC_WEAK_EVIDENCE` | 2 | *N* kriterde AI kanıtı zayıf |
| `AI_HUMAN_DISAGREEMENT` | 2 | *N* kriterde hakem puanı AI önerisinden farklı |
| `NO_REVIEWER_ASSIGNED` | 2 | Hakem atanmamış |
| `ANALYSIS_IN_PROGRESS` | 1 | Analiz sürüyor |
| `SECTION_PRESENCE_WARN` | 1 | Başlık yapısı incelenmeli |
| `TEMPLATE_STRUCTURE_WARN` | 1 | Şablon yapısı incelenmeli |
| `LANGUAGE_WARN` | 1 | Rapor dili incelenmeli |
| `RUBRIC_SUGGESTION_MISSING` | 1 | Bu koşuda AI rubrik önerisi yok |
| `REVIEW_NOT_STARTED` | 1 | Hakem değerlendirmesi başlamamış |
| `HUMAN_REVIEW_COMPLETED` | 0 | Hakem değerlendirmesi gönderildi |

Ağırlıklar ve iki eşik **geçici ürün politikasıdır**, benzerlik eşikleri gibi. "Bu sinyal ne kadar
dikkat hak ediyor" sorusunu kodlarlar; ölçülmüş bir gerçeği değil. Golden set oluştuğunda
değişmeleri beklenir.

### Bilinçli kural ayrıntıları

- **`HUMAN_REVIEW_COMPLETED` ağırlığı 0'dır.** Tamamlanmış insan incelemesi gerekçe listesinde
  belirtilmeye değer, ama seviyeyi ne yükseltir ne düşürür. Düşürmek, kalan gerçek bir sinyali
  gizleyen bir geçersiz kılma olurdu (bir hakem gönderdikten sonra da yüksek benzerlik gözlemi
  ikinci bir bakışa değer); yükseltmek tamamlanmış işi kuyruğun başına geri iterdi.
- **`SIMILARITY` kontrolünün `PASS`/`WARN` durumu ayrıca sayılmaz.** Bu durum aynı `level`
  değerinden türetilir; ikisini de saymak tek bir gözlemi iki kez ağırlıklandırırdı.
- **Zayıf kanıt, zayıf değerlendirmeden ayrıdır.** `SECTION_CONTENT` değerlendirmesi zaten
  `WARN`/`FAIL` gerekçesini üretir; `REQUIRED_SECTION_WEAK_EVIDENCE` yalnız `evidenceStrength`
  değeri `LOW` olan zorunlu bölümleri sayar.
- **Atanmamış ve başlamamış birlikte raporlanmaz.** Hakem yoksa `NO_REVIEWER_ASSIGNED`; hakem var
  ama değerlendirme yoksa `REVIEW_NOT_STARTED`.
- **Gerekçe sırası deterministiktir:** ağırlığa göre azalan, eşitlikte
  `REVIEW_PRIORITY_REASON_CODE_VALUES` içindeki kanonik sıraya göre. Aynı sinyal kümesi her zaman
  bayt bayt aynı listeyi üretir.

## 4. Olasılık yok

Hiçbir yüzey yüzde, olasılık, gösterge (gauge) veya güven değeri göstermez. Dahili `score` alanı
yalnız sıralama anahtarıdır; taşınmasının nedeni satırların kararlı sıralanabilmesi ve
ağırlıklandırmanın denetlenebilir kalmasıdır. Arayüzde asla sayı olarak sunulmaz ve `styles.css`
içinde bir gösterge/metre bileşeni bilinçli olarak tanımlanmamıştır.

Yasak sözcük dağarcığı testle korunur: `intihal`, `kopya`, `diskalifiye`, `kesin`, `olasılık`, `%`
ifadeleri öncelik gerekçelerinde ve operasyon tablosu çıktısında aranır ve bulunmamalıdır.

## 5. Yetkilendirme ve yarışma kapsamı

`GET /api/v1/competitions/:competitionId/review-operations` yalnız
`competition:view-operations` izniyle çalışır.

| Rol | Erişim |
| --- | --- |
| `COMPETITION_MANAGER` | evet |
| `EVALUATION_MANAGER` | evet |
| `REVIEWER` | **hayır** (`submission:review` taşır, operasyon izni taşımaz) |
| `CONTESTANT` | hayır |

Roller hiyerarşik değildir; hakem operasyon kuyruğuna erişmez, yönetici de hakem kimliğine bürünüp
puan veremez. Yetkilendirme sunucudadır; arayüzde bağlantı gizlemek yetkilendirme sayılmaz ve her
hedef rota oturumu yeniden doğrular.

Yarışma kapsamı her ifadede uygulanır:

- başvuru sorgusu `submission.competition_id = ?` ile sınırlıdır
- kontrol sorgusu yalnız **bu** yarışmanın başvurularının referans koşularını seçer
- hakem projeksiyonu `listReviewerAssignmentOperations` üzerinden yarışma kapsamlı okunur
- birebir içerik eşleşmesi yalnız aynı yarışma içindeki SHA-256 tekrarından türetilir; başka bir
  yarışmadaki birebir aynı rapor burada sinyal değildir

Bu izolasyon testle doğrulanır: iki yarışmada aynı içerik hash'i ve diğer yarışmada bir yüksek
benzerlik gözlemi bulunan sentetik bir dünyada, hiçbiri bu kuyruğa sızmaz.

## 6. Sınırlar

- En fazla `MAX_REVIEW_OPERATIONS_ITEMS = 200` başvuru döner.
- Başvuru başına en fazla `MAX_REVIEW_OPERATIONS_REVIEWERS = 20` hakem döner.
- Filtreleme ve sıralama sunucu parametresi değil, sınırlı liste üzerinde istemci tarafı
  sunumdur: yönetici aynı veriyi birkaç sıralamayla görmek ister, ve sözleşmeyi parametresiz
  tutmak enjekte edilebilir seçici sınıfını tümüyle ortadan kaldırır. Bir filtre yalnız çağıranın
  görmeye zaten yetkili olduğu satırları eleyebilir; hiçbir zaman genişletemez.

## 7. Wording

| Kullanılan | Kullanılmayan |
| --- | --- |
| İnceleme Önceliği: Yüksek / Orta / Düşük | risk skoru, olasılık, yüzde |
| Uygun / İncelenmeli / Uygun değil | AI kararı, kesin ret |
| AI önerisi · hakem kararı değildir | kesin puan |
| Benzerlik bir inceleme sinyalidir | intihal tespit edildi, diskalifiye |
| Uzman incelemesi önerilir | otomatik eleme |
