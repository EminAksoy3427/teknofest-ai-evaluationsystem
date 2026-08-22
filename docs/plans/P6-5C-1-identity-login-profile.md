# P6.5C-1 — Kimlik, giriş ve hesap deneyimi

P6.5B ürün yüzeyi korunur. Bu dilim yalnız hesap girişini, görsel kimliği ve kullanıcının
kendi profilini tamamlar. Üye daveti, rol yönetimi, Submission 360 ve operasyon yeniden
tasarımı P6.5C-2 / P6.5C-3 kapsamındadır.

## Kimlik

Ürün wordmark'ı **TEKNOFEST AI** / **Değerlendirme Platformu** olarak kaldı. Resmî T3 Vakfı,
TEKNOFEST veya T3 AI logosu eklenmedi.

T3 Vakfı kurumsal kimlik kaynağı (`https://www.t3vakfi.org/tr/hakkimizda/kurumsal-kimlik/`)
T3 AI logosunu ayrı bir ürün olarak yayımlar: T3 AI, vakfın büyük dil modeli / açık kaynak
yapay zekâ projesidir. Bu depo bir TEKNOFEST değerlendirme platformudur. T3 AI markasını
ürün işareti olarak kullanmak yanıltıcı olurdu; TEKNOFEST veya T3 Vakfı logosunu ürün
işareti yapmak da bu bağlamda belirsiz ve orantısızdı. Kimlik, T3 paleti ve landing
altbilgisindeki “T3 Vakfı” atfı ile bağlanır.

## Palet

Tokenlar `apps/web/src/client/styles.css` içindedir.

| Rol | Değer | Kullanım |
| --- | --- | --- |
| Birincil | `#006BA6` | CTA, odak, seçili gezinme |
| Hover | `#005584` | Birincil düğme hover |
| Amber | `#FFB81C` ailesi | Dikkat / inceleme uyarısı; auth önizlemesinde ince vurgu |
| Kırmızı | `#DA291C` marka; metin için daha koyu erişilebilir kardeş | Yalnız gerçek hata / yıkıcı eylem |
| Charcoal | `#212322` | Birincil metin |
| Cool gray | `#CFCECD` | Güçlü kenarlık / nötr |

Normal formlar amber değildir. Yüksek inceleme önceliği kırmızı değildir. Kimliği doğrulanmış
tuval sakin kalır; güçlü T3 anları landing, `/login`, odak ve birincil CTA'dadır.

## /login ve /register

`/` tanıtım sayfasıdır. “Platforma giriş” OAuth başlatmaz; `/login` yoluna gider.

Masaüstünde kimlik yüzeyi merkezî bir kabuktur (yaklaşık 1216px, form ~44% / ürün ~56%).
Ürün paneli Rapor / AI 3. Göz / Hakem Kararı çalışma alanı önizlemesini taşır. 768 ve 390'da
form öne çıkar; dekoratif panel viewport'u yemez.

Giriş: e-posta, şifre, görünürlük anahtarı, şifremi unuttum, Giriş yap, “veya”, Google,
kaydol bağlantısı. Kayıt: ad, e-posta, şifre, şifre doğrulama, hesap oluştur, Google,
giriş bağlantısı. Oturumu açık kullanıcı `/login` ve `/register` yerine `/app` yoluna alınır.

Kayıt yalnız Better Auth kullanıcısı üretir. Hiçbir yarışma üyeliği veya rolü yazılmaz.

## Profil (Hesap merkezi)

`/app/profile` dört bölümlü hesap merkezidir; yarışma yönetim ekranı değildir. Sıfır üyelikli
oturum da açar. Masaüstünde sol gezinme ve sağda yalnız seçili bölüm görünür.
Derin bağlantılar: `/app/profile`, `#security`, `#roles`, `#account`.

1. Profil — görünen ad (Better Auth `updateUser`), salt okunur e-posta, Google görseli veya
   baş harf avatarı. Özel görsel yükleme yok.
2. Güvenlik — bağlı yöntemler. Credential hesapta şifre değiştirme ve diğer oturumları kapatma.
   Google-only hesapta mevcut-şifre formu yok. 2FA yok.
3. Roller ve Yarışmalar — salt okunur üyelikler, insan dilinde roller ve rol-uygun CTA.
4. Hesap — kimlik özeti, yöntemler, çıkış. Hesap silme yok.

Rol etiketleri: Yarışma Yöneticisi, Değerlendirme Yöneticisi, Hakem, Yarışmacı.
`/api/v1/me` ve `/api/v1/me/memberships` projeksiyonları değişmedi. Ek özetler N+1 olmaması
için mevcut üyelik listesinden türetilir.

## AI 3. Göz

Kullanıcıya dönük yetenek adı **AI 3. Göz** olarak kaldı. Destek cümlesi:
“Kanıta dayalı karar desteği”. Gerekli yerde: “Hakem kararının yerine geçmez.”

Kalıcılık kimlikleri, API kontrol türleri, migration'lar ve tarihsel plan belgeleri
(P5, P6.5B) bilinçli olarak değiştirilmedi.

## Ertelenenler (teslimat / P6.5C-2+)

- Şifre sıfırlama e-postası: giden e-posta göndericisi yok; sahte başarı yok.
- Doğrulanmış e-posta değişikliği: Better Auth `changeEmail` kapalı.
- Telefon: OTP/SMS yok; şema eklenmedi.
- Google-only kullanıcıya şifre bağlama: `setPassword` istemciye açılmadı.
- Ekip & Roller yönetimi, üye daveti, rol değiştirme, Submission 360, analiz geçmişi / retry,
  benzerlik karşılaştırma denetçisi, çoklu hakem karşılaştırması, yarışmacı yönetimi
  yeniden tasarımı, geri bildirim iş akışı entegrasyonu, değerlendirme yöneticisi başvuru
  seçici.
