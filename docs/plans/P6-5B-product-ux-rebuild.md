# P6.5B — Ürün UX Yeniden Kurulumu

## Amaç

P6.5A sonrası işlevsel olarak tam olan MVP'yi, ilk kez gören bir kişinin birkaç saniye içinde
anlayacağı operasyonel bir ürüne dönüştürmek. Backend, yetkilendirme, skor semantiği ve risk
ağırlıkları değişmedi. Yeni yapay zekâ çağrısı, uzak kaynak mutasyonu, dağıtım, commit veya
push yoktur.

## Rol-farkındalıklı bilgi mimarisi

Gezinme, oturum üyeliklerinden türetilir; gizlenen bağlantı yetki sınırı değildir. Her rota
sunucuda yeniden yetkilendirilir.

| Rol | Görünen gezinme |
| --- | --- |
| Yarışma yöneticisi | Genel Bakış, Kurulum, Başvurular, Hakemler, Değerlendirme |
| Değerlendirme yöneticisi | Genel Bakış, Hakemler, Değerlendirme |
| Hakem | Genel Bakış, Atamalarım |
| Yarışmacı | Genel Bakış, Sonuçlarım |

Değerlendirme yöneticisi başvuru listesini göremez (`submission:list` yok). Hakem atamasında
başvuru seçici yerine kimlik alanı kalır; bu bir yetkilendirme yeniden tasarımı değil, mevcut
sınırın kullanıcı dilindeki ifadesidir.

## Kurulum görev listesi

Çift sekme hiyerarşisi kaldırıldı. Ana ekran beş görevdir:

1. Yarışma bilgileri
2. Kategoriler
3. Rapor formatı (resmî PDF + yapısal profil)
4. Değerlendirme rubriği
5. Son kontrol

Görevler esnek tamamlanır; hazırlık türetilmiş `readiness` projeksiyonundan okunur.

## Hakem çalışma alanı

Masaüstünde tek bir çalışma alanı, yaklaşık 42 / 28 / 30 oranında üç panel:

- Rapor PDF
- AI 4. Göz (Ön Kontroller, İçerik, Benzerlik, AI Rubrik)
- Hakem Kararı

Dar ekranda mevcut panel seçici kullanılır; paneller DOM'dan kaldırılmaz. Korunan rapor ucu
ve object-URL yaşam döngüsü değişmedi. PDF.js eklenmedi.

## Yarışmacı sonuçları

`/app/results` yalnız sahip olunan başvuruları listeler. Yayımlanmamış sonuç:
"Değerlendirme sonucu henüz yayımlanmadı." Yayımlanmış sonuç: özet, güçlü yönler, gelişime
açık alanlar, öneriler. Analiz, benzerlik, hakem kimliği, öncelik ve sayısal puan yayımlanmaz.

## Görsel token yönü

T3 / TEKNOFEST kimliğinden türetilmiş sakin operasyon paleti: `canvas`, `surface`, `ink`,
`brand` (#006BA6 ailesi), `warning`, `critical` (yalnız gerçek hata/yıkıcı durum). Tipografi
ve boşluk `styles.css` token katmanındadır. Ağır bir tasarım sistemi eklenmedi.

## Tarayıcı doğrulaması

Yerel `http://localhost:5173` (mevcut `pnpm dev`; ikinci sunucu açılmadı). Sentetik
`p6-5b-demo-seed` dünyası. Cursor Browser + `Emulation.setDeviceMetricsOverride`.

| Ekran | Rota | Viewport | Sonuç | Konsol / ağ |
| --- | --- | --- | --- | --- |
| Landing hero | `/` | 1440×900 | Hero, CTA, ürün önizlemesi (Rapor / AI 4. Göz / Hakem) | API yok; kaynaklar 200 |
| Landing akış | `/` | 1440 | 6 kontrol, 4 adımlı akış, “AI karar vermez. Kanıt sunar.” | — |
| Landing | `/` | 1024 | Hero + 2–3 sütun kontrol kartları | — |
| Landing | `/` | 390×844 | Tek sütun, “Giriş yap” + hero metni | — |
| Genel bakış | `/app` | 1440 | Kenar çubuğu, 4 metrik, “Devam etmeniz gerekenler” | `get-session` + memberships 200 |
| Genel bakış | `/app` | 1024 | Kenar çubuğu açık (`lg`) | — |
| Genel bakış | `/app` | 900 | Kenar çubuğu kapalı, hamburger | — |
| Kurulum | `/app/competitions/demo-comp-2026/setup` | 1440 | 5/5 görev listesi | 200 |
| Başvurular | `.../submissions` | 1440 | Tablo + “+ Başvuru yükle” | 200 |
| Hakemler | `.../reviewers` | 1440 | Atama tablosu | 200 |
| Değerlendirme | `.../operations` | 1440 | Metrikler + Smart Risk kuyruğu | 200 |
| Atamalarım | `/app/review` | 1440 | 3 atama, durum CTA’ları | 200 |
| Çalışma alanı | `/app/review/demo-comp-2026/demo-assign-4` | 1440 | 42/28/30 paneller, viewport yüksekliği | workspace + report 200 |
| Çalışma alanı | aynı | 390 | Panel seçici; 2 panel `hidden` (unmount yok) | 200 |
| Sonuçlarım | `/app/results` | 1440 | Yayımlanmış + “henüz yayımlanmadı” | 200 |

Uygulama sırasındaki düzeltmeler:

- Çalışma alanı `h-dvh` + panel içi kaydırma (önce ~2800px sayfa boyu).
- Kanıt “Sayfa 3” tıklanınca rapor “Sayfa 3 / 8” oldu.
- Yarışmacı genel bakışından “+ Yeni yarışma” kaldırıldı (yalnız yöneticide veya üyeliksiz boş durumda).

Yerel D1’de `demo-session-reviewer` satırı eksikti; tarayıcı doğrulaması için aynı
token ile yeniden eklendi. Ürün kodu değişmedi.

## Investor-grade visual pass

P6.5B işlevi korundu; bu geçiş ürünün görsel yönünü ve ürün dilini hedefledi.
Yarışma/proje sinyalleri normal arayüzden çıkarıldı. Kimlik tipografik wordmark’tır:
**TEKNOFEST AI** / **Değerlendirme Platformu**. Resmî T3 logosu taklit edilmedi.
Kurumsal atıf yalnızca landing altbilgisinde “T3 Vakfı” olarak durur.

Tipografi sistem yığınıdır (uzak font yok). Hiyerarşi: landing display ~56px,
sayfa başlığı 30–36px, bölüm 20–24px, gövde 14–15px. Tokenlar: `canvas`, `surface`,
`surface-raised`, `surface-selected`, `ink` / `ink-muted` / `ink-subtle`, `brand`
(#006BA6 ailesi), `warning` (amber, dikkat), `critical` (yalnız hata/yıkıcı).
Yarıçap 6/8/12; gölge neredeyse yok. Kenar çubuğu sakin, çıkış kullanıcı menüsündedir.

Hakem çalışma alanı (42/28/30) ürünün görsel merkezidir ve landing önizlemesi aynı
sistemi yansıtır. Altı kontrol editöryal ızgaradır; güven bölümü koyu CTA kartı değil.

Tarayıcıda doğrulanan viewport’lar: 1440, 1024, 768, 390. Mevcut `localhost:5173`.
