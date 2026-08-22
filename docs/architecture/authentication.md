# Kimlik Doğrulama Mimarisi

## Sorumluluk ve sınırlar

Better Auth kullanıcının kim olduğunu doğrular; yarışma verisine erişip erişemeyeceğine karar
vermez. Yetkilendirme, yarışma üyeliği üzerinden sunucu tarafında ayrı bir katmanda uygulanır.
Başarılı bir oturum (Google veya e-posta/şifre) tek başına herhangi bir yarışma yetkisi sağlamaz.
Kayıt da hiçbir varsayılan üyelik veya rol yazmaz.

- `/api/auth/*`: Better Auth'ın OAuth, e-posta/şifre, callback ve oturum protokol alanı
- `/api/v1/me`: uygulamanın güvenli güncel kullanıcı projeksiyonu
- `/api/v1/health` ve `/api/v1/health/db`: kimlik doğrulama gerektirmeyen sağlık uçları

Hono, Better Auth handler'ını yalnız `GET` ve `POST` için `/api/auth/*` altında çalıştırır.
Uygulama API'si raw oturum, session tokenı veya sağlayıcı tokenı döndürmez.

Genel ürün girişi `/`'dir. Kimlik doğrulama `/login` ve `/register` üzerindedir. Oturumu açık bir
kullanıcı bu iki yola geldiğinde `/app` yoluna alınır. `/app/profile` korunan hesap merkezidir:
görünen ad Better Auth `updateUser` ile güncellenir, e-posta salt okunurdur ve yarışma rolleri
yalnız okunur. Rol atama bu sınırın dışındadır.

## Sağlayıcılar

E-posta/şifre ve Google social provider etkindir. Magic link, anonim giriş, passkey, telefon/OTP
ve diğer sosyal sağlayıcılar etkin değildir. OAuth state, callback/origin kontrolü, cookie
imzalama ve oturum güvenliği Better Auth'a bırakılır; özel OAuth veya JWT sistemi yoktur.

Şifre uzunluğu Better Auth varsayılanıdır (8–128). `requireEmailVerification` kapalıdır çünkü
depoda yapılandırılmış bir giden e-posta göndericisi yoktur.

## E-posta teslimatı (ertelenen)

Bu depoda SMTP, Resend, Mailgun veya Cloudflare Email Sending binding'i yoktur. Bu yüzden:

- `sendResetPassword` bilinçli olarak tanımlanmaz. `/forgot-password` sahte bir başarı göstermez;
  Better Auth `RESET_PASSWORD_DISABLED` döner.
- `/reset-password` token ile gerçek Better Auth sıfırlamasını uygular, fakat token üreten e-posta
  gönderilemez.
- `user.changeEmail` kapalıdır. Doğrulanmış e-posta değişikliği giden e-posta gerektirir.
- Telefon numarası eklenmez. Doğrulanmış telefon OTP/SMS teslimatı ister; şema da bu yüzden
  genişletilmez.

Parola ile giriş ve kayıt, teslimat entegrasyonu olmadan güvenle çalışır.

## Hesap bağlama

Aynı e-posta üzerinden örtük hesap bağlama kapalıdır (`disableImplicitLinking: true`,
`allowDifferentEmails: false`). Google provider subject/account kimliği sağlayıcı kimliği olarak
korunur; e-posta eşleşmesi tek başına bir Google hesabını mevcut e-posta/şifre hesabına (veya tersi)
sessizce birleştirmez.

OAuth access/refresh token şifrelemesi Better Auth varsayılanı değildir (`encryptOAuthTokens`
varsayılanı `false`). Bu proje `account.encryptOAuthTokens: true` ile şifrelemeyi açıkça açar:
Better Auth, tokenları D1 `account` satırına yazmadan önce `BETTER_AUTH_SECRET` ile simetrik
şifreler. Özel bir kripto katmanı yoktur. Uygulama API'si sağlayıcı tokenı döndürmez.

Better Auth `setPassword` sunucu-only bir ayrıcalıklı API'dir ve istemciye açılmaz. Google-only
hesaplar için anlamsız bir “mevcut şifre” formu gösterilmez.

## Kalıcılık ve kimlik kökü

Better Auth, D1 içindeki `user`, `session`, `account` ve `verification` tablolarının sahibidir.
`user`, gelecekteki yarışma üyeliklerinin kimlik köküdür. Global `role`, `isAdmin` veya
`competitionRole` alanı yoktur; rol yarışma kapsamında ayrı bir üyelik modelidir.

Oturum cookie'si same-origin, imzalı ve Better Auth tarafından yönetilir. Tokenlar
`localStorage`, `sessionStorage` veya `IndexedDB` içine yazılmaz. İstemci D1 binding'ine veya
sunucu auth modülüne erişmez.

## Yapılandırma ve sırlar

Sunucu yalnız şu binding değerlerini okur:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`

Değerler `apps/web/.dev.vars` veya gelecekte Cloudflare secret/env yapılandırmasıyla sağlanır;
kaynak koda veya `VITE_` değişkenlerine konmaz. Yapılandırma doğrulama hataları yalnız hatalı
değişken adlarını bildirir, değerleri göstermez. Trusted origin, `BETTER_AUTH_URL` ile belirtilen
tek origin'dir; wildcard kullanılmaz.

Production callback, production OAuth credentials ve deployment bilinçli olarak ertelenmiştir.
