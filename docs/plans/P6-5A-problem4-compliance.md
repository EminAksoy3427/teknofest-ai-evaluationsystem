# P6.5A — Problem 4 Uygunluk Kapanışı

## Amaç ve teslim

P6.5A, Problem 4 MVP'sinin geride kalan **iki** ürün açığını kapatır:

**A) Resmî güncel rapor şablonu dosya sürümlemesi.** Bir `TemplateVersion`, artık yalnız yapısal
profili değil, yarışmacılara verilecek resmî PDF şablonunu da taşır; bir sürüm resmî dosyası
olmadan etkinleştirilemez.

**B) Yarışmacı sahipli başvuru + insan onaylı yayımlanmış geri bildirim.** CONTESTANT rolü artık
somut başvuru sahipliği taşır (`submission_participant`) ve yönetici, zaten kalıcı olan hakem
değerlendirmesinden nitel bir geri bildirim yayımlayabilir (`contestant_feedback`); yarışmacı yalnız
bu açık, insan onaylı yayımı görür.

Bu görev **büyük bir ön yüz yeniden tasarımı yapmaz** (P6.5B'ye bırakılmıştır), **hiçbir yeni yapay
zekâ sağlayıcısı eklemez, canlı OpenAI/Workers AI çağrısı yapmaz, uzak Vectorize'a erişmez**,
dağıtım yapmaz ve uzak kaynak değiştirmez.

## Durum

| Alan | Durum |
| --- | --- |
| Resmî şablon dosyası: R2 yükleme/değiştirme/indirme | UYGULANDI |
| Resmî şablon dosyası: aktivasyon kapısı | UYGULANDI |
| Resmî şablon dosyası: başlık doğrulaması (deterministik) | UYGULANDI |
| Şablon dosyası tarihsel sabitleme (upgrade testiyle doğrulandı) | UYGULANDI |
| `submission_participant` sahiplik modeli + yönetim API'si | UYGULANDI |
| `contestant_feedback` taslak/yayım yaşam döngüsü | UYGULANDI |
| Deterministik geri bildirim önerisi (sıfır yeni AI çağrısı) | UYGULANDI |
| Yarışmacı yüzeyi (`/api/v1/me/...`) ve güvenli projeksiyon | UYGULANDI |
| Minimal ön yüz: şablon dosya yükleme, katılımcı yönetimi, geri bildirim editörü, "Sonuçlarım" | UYGULANDI |
| Tarihsel bütünlük senaryosu (Template v1→v2, Rubric v1→v2, R1→R2, F1 sabit) | UYGULANDI ve TEST EDİLDİ |
| Büyük ön yüz yeniden tasarımı | KAPSAM DIŞI (P6.5B) |
| Yayımlanmış geri bildirimin yeniden açılması/sürümlenmesi | BİLİNÇLİ OLARAK ERTELENDİ |
| Yeni yapay zekâ sağlayıcısı / canlı çağrı / uzak Vectorize | YAPILMADI |

Yalnız sentetik test verisi kullanılmıştır. Bu görevde canlı OpenAI veya Workers AI çağrısı
yapılmamış, uzak Cloudflare kaynağı oluşturulmamış veya değiştirilmemiş, dağıtım yapılmamıştır.

## Mimari kararlar

**Dosya ve profil aynı sürümün iki yüzüdür, ayrı bir tablo değildir.** `template_version`'ın
P1-01'den kalan rezerve `storage_key`/`sha256` sütunları gerçek amacına kavuşturulmuş, yanlarına
görüntüleme metadata'sı eklenmiştir. Ayrıntı `docs/architecture/template-files.md` içindedir.

**Dosya-gerektiren aktivasyon kapısı bilinçli olarak uygulama katmanındadır, tablo genelinde bir
CHECK constraint değildir.** `activateTemplateVersion` bu kuralı uygulayan **tek** kod yoludur; bir
CHECK constraint bunu P6.5A öncesi etkinleştirilmiş (dosyasız) her tarihsel `TemplateVersion`a
retroaktif olarak uygulardı ve tabloyu yeniden oluşturan herhangi bir gelecek migration'ı
sonsuza dek bozardı. `packages/db/scripts/p6-5a-schema.test.mjs`, P6 checkpoint'inden tam olarak bu
tarihsel durumu seçip upgrade sonrası dokunulmamış kaldığını doğrular.

**Tarihsel uyumluluk güncel yapılandırma anlamına gelmez.** Dosyasız ACTİF bir eski
`TemplateVersion` korunur ve ona sabitlenmiş eski koşular okunabilir kalır, fakat yeni işi
besleyemez: hazırlık projeksiyonu ayrı bir `activeTemplateFile` bayrağı taşır ve bu bayrak yoksa
yarışma `ready` bildirilmez; `createQueuedAnalysisRun` yalnız `storage_key`i null olmayan ACTİF
şablona sabitlenir, aksi hâlde denetimli `CONFIGURATION_NOT_READY` (`409`) döner. Eski satır ne
silinir ne de otomatik emekliye ayrılır. Regresyon kapsamı:
`apps/web/src/server/p6-5a-legacy-template-compliance.test.ts`.

**Yayım, brief'in yarışmacıya verdiği sözün tamamını gerektirir.** DRAFT eksik kalabilir; PUBLISHED
için özet ve en az birer maddelik güçlü yönler, gelişim alanları ve öneriler zorunludur
(`PublishableContestantFeedbackContentSchema`). Eksik içerik reddedilir, sunucu tarafından
tamamlanmaz; belirgin bir zayıf yön yoksa gerçeğe uygun bir devam/geliştirme önerisini insan yazar.

**Başlık doğrulaması, submission analizinin aynı deterministik primitiflerini yeniden kullanır,
kopyalamaz.** `validateOfficialTemplateHeadings`
(`apps/web/src/server/competition-configuration-routes.ts`), P3-01'in `extractDocument` ve
`evaluateSections` fonksiyonlarını geçici, bellek içi bir kontrol için çağırır; hiçbir artifact R2'ye
veya sahte `AnalysisCheck` D1'e yazılmaz. Metin çıkarılamazsa doğrulama asla sessizce atlanmaz;
açık bir hata döner. Ayrıntı `docs/architecture/template-files.md` bölüm 4'tedir.

**Paylaşılan PDF yükleme yardımcısı, kopya güvenlik mantığını ortadan kaldırır.**
`apps/web/src/server/storage/pdf-upload.ts`, submission raporu ve resmî şablon dosyasının
**aynı** sınırlı-akış okuma, gerçek `%PDF-` imza kontrolü ve sunucu tarafı SHA-256 mantığını
paylaşmasını sağlar; `submission-routes.ts` bunu kullanacak şekilde yeniden düzenlenmiştir.

**Yarışmacı sahipliği, `reviewer_assignment`in izlediği aynı deseni izler.**
`submission_participant`, composite foreign key'lerle çapraz yarışma atamasını veritabanı
sınırında imkânsız kılar; rol koşulu (CONTESTANT) repository'nin kendi guard'lı INSERT'inde
doğrulanır. Ayrıntı `docs/architecture/contestant-feedback.md` bölüm 1'dedir.

**Geri bildirim, ham veriyi değil açık bir yayımı temsil eder.** `contestant_feedback`, kaynağı
(bir SUBMITTED `ReviewerEvaluation`) composite foreign key + değer koşuluyla sabitler; DRAFT
yarışmacıya asla açıklanmaz (varlığı bile); PUBLISHED değişmezdir. Türetilmiş öneri zaten kalıcı ve
doğrulanmış veriden gelir ve **yeni bir yapay zekâ çağrısı içermez**; iç kaynak verisi olarak
işaretlenir ve yalnız açık bir yönetici eylemiyle yayım içeriğine kopyalanır. Ayrıntı
`docs/architecture/contestant-feedback.md` bölüm 2'dedir.

**Yarışmacı yüzeyi kimliği yalnız oturumdan alır.** `/api/v1/me/*` uçları `:competitionId` veya
`userId` taşımaz; sahiplik `submission_participant` üzerinden sunucuda çözülür. Sahip olunmayan bir
başvuru ile sahip olunan-ama-yayımlanmamış bir sonuç, aynı `null` sonucuyla ayırt edilemez hâle
getirilir — hangi durumun geçerli olduğunu sızdıran farklı bir hata kodu asla üretilmez.

## Güvenlik

Bkz. `docs/architecture/template-files.md` bölüm 8 ve `docs/architecture/contestant-feedback.md`
bölüm 1-3 için tam izin matrisi. Özet:

| Yüzey | COMPETITION_MANAGER | EVALUATION_MANAGER | REVIEWER | CONTESTANT |
| --- | --- | --- | --- | --- |
| Şablon dosyası yükle/indir | evet (`competition:configure`) | hayır | hayır | hayır |
| Katılımcı yönetimi | evet (`competition:configure`) | hayır | hayır | hayır (kendini de ekleyemez) |
| Geri bildirim taslak/yayım | evet (`competition:view-operations`) | evet (`competition:view-operations`) | hayır | hayır |
| `/api/v1/me/*` | n/a | n/a | n/a | evet, yalnız kendi katıldığı başvurular |

Çapraz yarışma sızıntısı her katmanda engellenir: composite foreign key'ler (veritabanı), route
guard'ları (uygulama) ve `getPublishedFeedbackForContestant`'ın sahiplik+yayım kontrolünü aynı
sorguda birleştirmesi (sızdırmayan `404`).

## Migration disiplini

İki yeni migration üretilmiştir (`0016_loud_vance_astro.sql`, `0017_noisy_tomas.sql`), ikisi de
`drizzle-kit generate` ile üretilmiş ve **elle düzenlenmemiştir**. İlk deneme
(`drizzle-kit`'in tek adımda ürettiği migration) SQLite'ın tablo-yeniden-oluşturma + yeni sütun
ekleme birleşimini yanlış SELECT listesiyle üretti (var olmayan bir sütunu eski tablodan seçmeye
çalışıyordu); bu **elle düzeltilmemiş**, bunun yerine şema değişikliği iki adıma bölünmüş
(önce düz sütun ekleme, sonra CHECK constraint'li yeniden oluşturma) ve `drizzle-kit` her adımda
yeniden çalıştırılmıştır — üretici aracın kendisi doğru SQL'i üretene kadar. Doğrulama:

- **Temiz zincir:** 18 migration, sıfır foreign key ihlali.
- **Upgrade yolu:** P6 checkpoint'inin 0000-0015 zincirinden, dosyasız ACTİF bir `TemplateVersion`
  seed edilip 0016-0017 üzerine uygulanmış; satır değişmeden hayatta kalmıştır.
- **Bekleyen: YOK, sapma: YOK.**

Doğrulama betiği: `packages/db/scripts/p6-5a-schema.test.mjs` (`pnpm --filter @teknofest-ai/db
test` zincirine eklenmiştir).

## Sentetik dünya

`apps/web/src/server/test-fixtures/p65a-world-seed.ts`, tam senaryoyu tek bir yerde kurar:
Template v1 (ACTİF, dosyalı) + Rubrik v1 (ACTİF), Submission S1 → AnalysisRun R1 (SUCCEEDED),
ReviewerEvaluation E1 (SUBMITTED), ContestantFeedback F1 (PUBLISHED), katılımcı contestantOne (S1
sahibi) ve contestantTwo (hiçbir şeyin sahibi değil). `activateNewVersionsAndAnalyze` yardımcı
fonksiyonu Template v2 + Rubrik v2'yi etkinleştirir ve aynı başvuru için AnalysisRun R2 oluşturur —
tarihsel bütünlük testlerinin tam olarak ihtiyaç duyduğu geçiş. Yarışma B, izolasyonu kanıtlamak
için tamamen ayrı bir sentetik dünyadır. Hiçbir gerçek TEKNOFEST raporu, yarışmacısı veya hakemi
kullanılmamıştır.

## Doğrulama

| Test dosyası | Kapsam |
| --- | --- |
| `packages/db/scripts/p6-5a-schema.test.mjs` | temiz zincir, upgrade yolu, dosya all-or-nothing, katılımcı/geri bildirim sahiplik CHECK/FK'leri |
| `apps/web/src/server/template-file-routes.test.ts` | yükleme yetkilendirmesi, doğrulama, depolama anahtarı gizliliği, değiştirme telafisi, aktivasyon kapısı (19 test) |
| `apps/web/src/server/submission-participant-routes.test.ts` | yetkilendirme, sahiplik kuralları, uygun yarışmacı listesi (13 test) |
| `apps/web/src/server/contestant-feedback-routes.test.ts` | yetkilendirme, kaynak seçimi (aynı yarışma + aynı başvuru), taslak/yayım yaşam döngüsü, değişmezlik (11 test) |
| `apps/web/src/server/contestant-routes.test.ts` | kimlik/sahiplik, güvenli projeksiyon, sızdırmayan 404 (9 test) |
| `apps/web/src/server/p6-5a-historical-integrity.test.ts` | zorunlu v1→v2/R1→R2/F1 senaryosu (4 test) |

Toplam yeni vitest testi: **56** (19+13+11+9+4). Ayrıca yeni bir düzeyli `node:sqlite` betiği
(`p6-5a-schema.test.mjs`, birden çok `assert` içerir) ve mevcut `analysis-run-schema.test.mjs`
içindeki migration sayısı iddiası (16→18) güncellenmiştir. Kapı: `pnpm smoke:p6-5a`.

## Eski belgelerin güncellenmesi

`docs/architecture/competition-configuration.md` ve `ARCHITECTURE.md`, "Yetkili şablon dosyası R2
aşamasına ertelenmiştir" ve "yarışmacı sahipliği ve geri bildirim yüzeyi ... ertelenmiştir"
ifadelerini artık doğru olmayan biçimde taşıyordu; bu görev onları gerçek duruma güncellemiştir.
