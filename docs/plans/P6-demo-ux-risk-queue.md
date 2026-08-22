# P6 — Demoya Hazır Deneyim ve İnceleme Önceliği Kuyruğu

## Amaç ve teslim

P6, hâlihazırda çalışan ürünü demoya hazır hâle getirir ve kalan en yüksek değerli MVP+
farklılaştırıcısını **sıfır yeni yapay zekâ çıkarımıyla** ekler: deterministik, yarışma kapsamlı
**İnceleme Önceliği** kuyruğu (Smart Risk Queue) ve yöneticinin değerlendirme operasyonu görünümü.

Ürün sınırı: inceleme önceliği bir dikkat sinyali sıralamasıdır. Olasılık, risk yüzdesi, intihal
skoru veya nihai yarışma kararı değildir. Nihai karar daima insandadır.

## Durum

| Alan | Durum |
| --- | --- |
| Deterministik inceleme önceliği modeli (`packages/shared`) | UYGULANDI |
| Türetilmiş operasyon projeksiyonu (`packages/db`) | UYGULANDI |
| `GET /review-operations` ucu ve `competition:view-operations` kapısı | UYGULANDI |
| Yönetici operasyon sayfası, filtreleme ve sıralama | UYGULANDI |
| Görünür gerekçelerle açıklanabilirlik | UYGULANDI |
| Hakem çalışma alanı görsel hiyerarşi ve durum netliği | UYGULANDI |
| Yönetici/hakem akış gezinmesi ve breadcrumb | UYGULANDI |
| Semantik token katmanı ve durum çipleri | UYGULANDI |
| Boş/hata durumları | UYGULANDI |
| Sentetik golden demo senaryoları (A–F) | UYGULANDI |
| Yeni AI çağrısı, yeni sağlayıcı, yeni migration | YAPILMADI (kapsam dışı) |
| Kalıcı risk tablosu | BİLİNÇLİ OLARAK EKLENMEDİ |
| Eşik/ağırlık kalibrasyonu (golden set) | ERTELENDİ |
| Hakemler arası uzlaşma / yarışma geneli nihai karar | ERTELENDİ |
| Production seed altyapısı | KAPSAM DIŞI |

Yalnız sentetik test verisi kullanılmıştır. Bu görevde canlı OpenAI veya Workers AI çağrısı
yapılmamış, Vectorize'a erişilmemiş, uzak Cloudflare kaynağı oluşturulmamış veya değiştirilmemiş,
dağıtım yapılmamıştır. Yeni bir veritabanı migration'ı üretilmemiştir.

## Mimari kararlar

**Kuyruk türetilmiş bir projeksiyondur.** Öncelik hiçbir yere yazılmaz; her istekte mevcut
`submission`, `analysis_run`, `analysis_check`, `rubric_suggestion`, `reviewer_assignment`,
`reviewer_evaluation` ve `reviewer_criterion_score` satırlarından yeniden hesaplanır. Kalıcı bir
öncelik, özetlediği değişmez kayıtlardan sapabilirdi; türetilmiş projeksiyon sapamaz. Girdilerin
tümü tek bir yarışma içinde ucuza okunabildiği için kalıcılaştırmanın somut gerekçesi yoktur.
Ayrıntılar `docs/architecture/review-operations.md` içindedir.

**Sıfır yeni yapay zekâ çıkarımı, yapı gereği.** Öncelik türetmesi `packages/shared` içinde saf bir
fonksiyondur ve `packages/ai`'ye, sağlayıcıya, gömme adaptörüne veya vektör sağlayıcısına hiçbir
bağımlılığı yoktur. Repository katmanı yalnız `SELECT` çalıştırır. Kuyruğu açmak, filtrelemek,
sıralamak ve yenilemek hiçbir model çağrısı yapmaz.

**Model saf toplamadır ve seviye gerekçelerin toplamına eşittir.** `score = Σ weight(reason)`,
`level` iki eşikten türer. Gizli çarpan, kırpma veya geçersiz kılma yoktur. Bu, şemayla zorunlu
kılınır: `ReviewPriorityAssessmentSchema`, puanı gerekçelerinin toplamına eşit olmayan bir
değerlendirmeyi reddeder. Dolayısıyla yöneticiye gösterilmeyen bir sinyal seviyeyi etkileyemez.

**Ağırlıklar gizlenmemiştir.** `REVIEW_PRIORITY_REASON_WEIGHTS` dışa aktarılan tek bir tablodur ve
belgede tam olarak listelenir. Ağırlıklar ve eşikler geçici ürün politikası olarak işaretlidir:
"bu sinyal ne kadar dikkat hak ediyor" sorusunu kodlarlar, ölçülmüş bir gerçeği değil.

**Olasılık üretilmez.** Dahili `score` yalnız sıralama anahtarıdır. Hiçbir yüzeyde yüzde, gösterge
veya güven değeri gösterilmez; `styles.css` içinde bir metre/gauge bileşeni bilinçli olarak
tanımlanmamıştır. Yasak sözcük dağarcığı (`intihal`, `kopya`, `diskalifiye`, `kesin`, `olasılık`,
`%`) testle korunur.

**Referans koşu ile en yeni koşu ayrıdır.** Sinyaller yalnız en yeni `SUCCEEDED` koşunun kalıcı
kontrollerinden okunur; "Analiz" sütunu ise en yeni koşuyu bildirir. Böylece devam eden veya
başarısız yeni bir koşu, hakemin elindeki gerçek kanıtı sessizce geçersiz kılmaz: en yeni koşu
`FAILED` olsa bile eski başarılı koşunun kontrolleri görünür kalır ve `ANALYSIS_FAILED` gerekçesi
yanına eklenir.

**Filtreleme/sıralama sunucu parametresi değildir.** Sunucu sınırlı ve zaten yetkilendirilmiş bir
liste döndürür; daraltma ve sıralama saf istemci fonksiyonlarıdır (`review-operations-view.ts`).
Yönetici aynı veriyi birkaç sıralamayla görmek ister, ve sözleşmeyi parametresiz tutmak enjekte
edilebilir seçici sınıfını tümüyle ortadan kaldırır. Bir filtre yalnız çağıranın görmeye zaten
yetkili olduğu satırları eleyebilir.

**`HUMAN_REVIEW_COMPLETED` ağırlığı sıfırdır.** Tamamlanmış insan incelemesi gerekçe listesinde
belirtilir ama seviyeyi değiştirmez. Düşürmek, kalan gerçek bir sinyali gizleyen bir geçersiz kılma
olurdu — bir hakem gönderdikten sonra da yüksek benzerlik gözlemi ikinci bir bakışa değer.

**Token katmanı küçük tutuldu.** Durum renkleri analiz özeti, hakem kuyruğu, çalışma alanı ve
operasyon tablosunda ayrı ayrı ham palet sınıfı olarak tekrarlanıyordu; aynı sunucu sinyali iki
ekranda farklı görünebiliyordu. Yüzey, kenarlık ve metin renkleri `@theme` içinde semantik token
olarak (`--color-surface`, `--color-line`, `--color-ink*`) bir kez adlandırıldı ve `surface-panel`,
`data-table`, `table-scroll`, `breadcrumb`, `workspace-pane*`, `pane-note` bileşen sınıfları bu
tokenları tüketiyor. Durum ölçeği ise renk tokenı değil adlandırılmış bileşen varyantıdır
(`status-chip-*`, `priority-pill-*`), çünkü bir durum kenarlık + zemin + ön plan rengini birlikte
gerektirir. Her iki yolda da her anlam tam olarak bir yerde tanımlıdır. Yeni bir bağımlılık
eklenmedi ve mevcut sayfalar yeniden tasarlanmadı.

## Güvenlik

`GET /api/v1/competitions/:competitionId/review-operations` yalnız `competition:view-operations`
iznini kabul eder: `COMPETITION_MANAGER` ve `EVALUATION_MANAGER` erişir; `REVIEWER` ve `CONTESTANT`
`403` alır. `REVIEWER`, `submission:review` iznini taşımasına rağmen yarışma geneli kuyruğa
erişemez; roller hiyerarşik değildir.

Yarışma kapsamı her ifadede uygulanır. Kontrol sorgusu yalnız bu yarışmanın başvurularının referans
koşularını seçer; birebir içerik eşleşmesi yalnız aynı yarışma içindeki SHA-256 tekrarından türer.
Testler, iki yarışmada aynı içerik hash'i ve diğer yarışmada bir yüksek benzerlik gözlemi bulunan
sentetik bir dünyada hiçbir sızıntı olmadığını doğrular.

## Demo akışı

### Yönetici yolu

1. **Yarışmalar** (`/app`) — üyelik kartından rol etiketi ve giriş noktaları.
2. **Yapılandırma** — kategori, şablon, rubrik sürümleri.
3. **Başvurular** — PDF yükleme, analiz başlatma, koşu durumu.
4. **Hakem Atamaları** — atama, atama kaldırma, atama durumu.
5. **Değerlendirme Operasyonu** — inceleme önceliği kuyruğu; öncelik/analiz/hakem/kategori
   filtreleri ve altı sıralama.

Adımlar her yönetici sayfasında `ManagerStepNav` sekme şeridinden ve breadcrumb'dan doğrudan
erişilebilir; akış çıkmaz sokakla bitmez.

### Hakem yolu

1. **Atamalarım** (`/app/review`) — yalnız açıkça atanmış başvurular; sayfa başında akış özeti.
2. **Başvuruyu Aç** — üç panelli çalışma alanı.
3. **Rapor + AI 4. Göz + Hakem Rubriği** — kanıt bağlantıları raporu ilgili sayfaya götürür.
4. **Taslağı kaydet** — panelin altında sabitlenmiş eylem.
5. **Değerlendirmemi gönder** — tüm kriterler puanlandığında etkinleşir; gönderilen kayıt değişmez.

### Sentetik golden senaryolar

`apps/web/src/server/test-fixtures/review-operations-seed.ts` altı deterministik senaryoyu iki
yarışmaya kurar. Aynı senaryolar hem otomatik testleri hem demo anlatısını besler, dolayısıyla demo
tam olarak testlerin sabitlediği davranışı gösterir.

| # | Kod | Senaryo | Beklenen öncelik | Görünür gerekçeler |
| --- | --- | --- | --- | --- |
| A | `OPS-A` | Temiz ve güçlü başvuru, hakem değerlendirmesi gönderilmiş | Düşük | Hakem değerlendirmesi gönderildi |
| B | `OPS-B` | Yapısal olarak sorunlu rapor, hakem atanmamış | Yüksek | Zorunlu başlıklar eksik · Şablon yapısı uygun değil · Hakem atanmamış · Rapor dili incelenmeli |
| C | `OPS-C` | Kategori uyumu ve bölüm içeriği tartışmalı, kanıt zayıf | Yüksek | Kategori uyumu incelenmeli · Bölüm içeriği incelenmeli · 2 zorunlu bölümde zayıf kanıt · Hakem değerlendirmesi başlamamış |
| D | `OPS-D` | Yüksek benzerlik gözlemi | Yüksek | Yüksek benzerlik sinyali · Hakem atanmamış |
| E | `OPS-E` | AI/hakem rubrik farkı ve zayıf AI kanıtı | Orta | 1 kriterde AI kanıtı zayıf · 2 kriterde hakem puanı AI önerisinden farklı · Hakem değerlendirmesi gönderildi |
| F | `OPS-F` | Analiz çalışması tamamlanamadı | Yüksek | Analiz çalışması tamamlanamadı · Hakem atanmamış |

Ek olarak ikinci yarışmada (`OPS-Z`), `OPS-A` ile **birebir aynı içerik hash'i** ve kendi yüksek
benzerlik gözlemi bulunan bir başvuru vardır. Bu satır yalnız izolasyonu göstermek için vardır ve
birinci yarışmanın kuyruğunda hiçbir etkisi olmaz.

Hiçbir gerçek TEKNOFEST raporu, yarışmacısı veya başvurusu kullanılmamıştır; her belge, alıntı, puan
ve isim bu fixture için uydurulmuştur.

## Erişilebilirlik ve responsive

- Durum hiçbir yerde yalnız renkle taşınmaz: her çip ve her hap durum sözcüğünü metin olarak da
  içerir (`Uygun`, `İncelenmeli`, `Uygun değil`, `İnceleme Önceliği: Yüksek`).
- Öncelik seviyesi her zaman gerekçe listesiyle birlikte gösterilir.
- Kanıt sayfaları gerçek `<button>` öğeleridir; klavyeyle erişilebilir ve Enter/Space ile
  çalıştırılabilir. Sunucunun doğrulamadığı kanıt hiçbir zaman gezinme hedefi üretmez.
- Tüm filtre ve sıralama denetimleri etiketli `<label for>` + `<select>`/`<input>` çiftidir.
- Breadcrumb `<nav aria-label>` içinde, geçerli sayfa `aria-current="page"` ile işaretlidir.
- Yönetici sekme şeridi `aria-current="page"` taşır; konum yalnız renkle bildirilmez.
- Tablo `<caption class="sr-only">` ve `<th scope="col">` ile okunur; yatay taşma tablonun kendi
  `overflow-auto` kabına sınırlıdır.
- Sayfa gövdesi hiçbir kırılma noktasında yana kaymaz: geniş içerik (operasyon tablosu, başvuru
  tablosu) kendi `overflow-auto` kabında kaydırılır ve üç panelli grid `minmax(0, …)` + `min-w-0`
  ile şişmez. `body` üzerinde `overflow-x: hidden` bilinçli olarak KULLANILMAZ; kırpmak, ulaşılamayan
  içerik üretip gerçek bir yerleşim hatasını gizlerdi.
- Hakem çalışma alanı `xl` ve üzerinde üç panel; altında mevcut panel değiştirme davranışı korunur.
  Etkin olmayan panel **kaldırılmaz**, yalnız `hidden` ile gizlenir; panel değiştirmek raporu
  yeniden yüklemez ve kaydedilmemiş puanı kaybetmez. Bu değişmez testle sabitlenmiştir.
- Odak görünürlüğü mevcut `focus-visible` yardımcılarıyla korunur; klavye tuzağı eklenmemiştir.

## Testler

| Test | Kapsam |
| --- | --- |
| `packages/shared/src/review-priority.test.ts` | deterministik model, gerekçe toplamı, sıralama, yasak sözcük dağarcığı, her sinyal ailesi |
| `apps/web/src/server/review-operations-routes.test.ts` | yetkilendirme (401/403/200), yarışma izolasyonu, altı golden senaryonun seviyesi, tekrar eden istekte aynı çıktı, atama sonrası gerekçe değişimi, yeni koşu başarısızken eski kanıtın korunması, aynı yarışmada birebir eşleşme |
| `apps/web/src/client/review-operations-page.test.tsx` | türetilmiş durumlar, dört filtre + arama, altı sıralama, null'ların sona sıralanması, açıklanan seviye, yüzde/olasılık/verdikt üretilmemesi |
| `apps/web/src/client/review-workspace-page.test.tsx` | taslak/gönderildi netliği, AI önerisi ile hakem kararı ayrımı, boş rubrik, başarısız koşu, kayıtlı kontrol yok, AI rubrik önerisi yok |
| `apps/web/src/client/review/workspace-panes.test.ts` | responsive panel durumu: `xl`'de üç panel, altında etkin olmayan panelin mount kalması |

Kapı: `pnpm smoke:p6`.
