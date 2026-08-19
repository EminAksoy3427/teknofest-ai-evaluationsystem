# Kimlik Doğrulama Mimarisi

## Sorumluluk ve sınırlar

Better Auth kullanıcının kim olduğunu doğrular; yarışma verisine erişip erişemeyeceğine karar
vermez. Yetkilendirme, yarışma üyeliği üzerinden sunucu tarafında ayrı bir katmanda uygulanır.
Başarılı Google oturumu tek başına herhangi bir yarışma yetkisi sağlamaz.

- `/api/auth/*`: Better Auth'ın OAuth, callback ve oturum protokol alanı
- `/api/v1/me`: uygulamanın güvenli güncel kullanıcı projeksiyonu
- `/api/v1/health` ve `/api/v1/health/db`: kimlik doğrulama gerektirmeyen sağlık uçları

Hono, Better Auth handler'ını yalnız `GET` ve `POST` için `/api/auth/*` altında çalıştırır.
Uygulama API'si raw oturum, session tokenı veya sağlayıcı tokenı döndürmez.

## Google-only MVP

Bu aşamada yalnız Google social provider etkindir. Email/password, magic link, anonim giriş,
passkey ve diğer sağlayıcılar etkin değildir. OAuth state, callback/origin kontrolü, cookie
imzalama ve oturum güvenliği Better Auth'a bırakılır; özel OAuth veya JWT sistemi yoktur.

Aynı e-posta üzerinden örtük hesap bağlama kapalıdır. Google provider subject/account kimliği
sağlayıcı kimliği olarak korunur; özel hesap birleştirme mantığı uygulanmaz. OAuth tokenları
veritabanında Better Auth tarafından şifrelenir.

## Kalıcılık ve kimlik kökü

Better Auth, D1 içindeki `user`, `session`, `account` ve `verification` tablolarının sahibidir.
`user`, gelecekteki yarışma üyeliklerinin kimlik köküdür. Global `role`, `isAdmin` veya
`competitionRole` alanı yoktur; rol yarışma kapsamında ayrı bir üyelik modeli olacaktır.

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
