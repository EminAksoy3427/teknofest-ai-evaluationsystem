# P1-03 — Yarışma Kapsamlı RBAC

## Kapsam

Bu kilometre taşı kimlik doğrulamayı değiştirmeden yarışma kapsamlı yetkilendirme temelini
kurar: üyelik şeması, dört resmî rol, küçük izin politikası, sunucu yardımcıları, iki doğrulama
API'si, testler ve yalnız yerel D1 migration doğrulaması.

Yarışma CRUD, hakem ataması, yarışmacı sahipliği, başvuru/değerlendirme akışları, audit log,
global yönetim, yapay zekâ, R2, Vectorize ve Workflows kapsam dışıdır.

## Şema ve migration

`competition_member` alanları:

- `id`: `TEXT` primary key
- `competition_id`: `competition.id` foreign key, `ON DELETE CASCADE`
- `user_id`: Better Auth `user.id` foreign key, `ON DELETE CASCADE`
- `role`: dört resmî rol ile sınırlı zorunlu `TEXT`
- `created_at`, `updated_at`: epoch-milisaniye `INTEGER`

`competition_id + user_id` benzersizdir. `competition_id`, `user_id` ve
`competition_id + role` sorguları için indeksler vardır. Rol ayrıca veritabanı `CHECK`
constraint'iyle korunur.

Drizzle Kit üretimli yeni migration:

```text
packages/db/migrations/0002_tranquil_molten_man.sql
packages/db/migrations/meta/0002_snapshot.json
```

P1-01 `0000` ve P1-02 `0001` migration'ları değiştirilmez. Migration yalnız yerel D1'e
uygulanır; uzak D1 ve production dağıtımı yoktur.

## Roller ve izinler

| Rol | İzin |
| --- | --- |
| `COMPETITION_MANAGER` | `competition:configure` |
| `EVALUATION_MANAGER` | `competition:view-operations` |
| `REVIEWER` | `submission:review` |
| `CONTESTANT` | `feedback:view-own` |

Rol hiyerarşisi ve örtük izin kalıtımı yoktur. Sözleşmeler framework bağımsız olarak
`packages/shared` içinde, politika ve zorunlu erişim kontrolleri Worker sunucu katmanındadır.
Kalıcılık sorgularının sahibi `packages/db` paketidir.

## API

- `GET /api/v1/me/memberships`: oturum kullanıcısının yarışma adı/slug ve rol içeren kendi
  üyeliklerini döndürür; üyeliksiz kullanıcı için boş liste döner.
- `GET /api/v1/competitions/:competitionId/access`: veritabanından doğrulanmış üyeliğin rol ve
  izinlerini döndürür.

Her iki uçta oturum yoksa `401`; access ucunda ilgili yarışma üyeliği yoksa `403`; doğru
üyelikte `200` döner. İstemci tarafından verilen rol veya izin kabul edilmez.

## Testler ve yerel smoke

- Paylaşılan Zod rol, izin ve response sözleşmeleri
- `401` oturum yok senaryosu
- `403` üye değil/yanlış rol senaryosu
- Doğru yarışma üyeliğinde `200`
- Yarışma A üyeliğinin Yarışma B'ye erişememesi
- Her rolün yalnız tek amaçlanan izne eşlenmesi
- Üyelik listesinin yalnız oturum kullanıcısını döndürmesi
- Üyeliksiz oturum kullanıcısına boş liste
- Gerçek üretilmiş migration üzerinde duplicate, geçersiz rol, foreign key ve cascade testleri

Yerel D1 smoke; iki kullanıcı, iki yarışma ve ayrık üyelikler oluşturur. İzin verilen ve
yasaklanan çapraz yarışma sorguları doğrulandıktan sonra tüm geçici kayıtlar temizlenir.
Sağlık, logged-out korunan uçlar ve frontend ayrıca yerel Worker üzerinden kontrol edilir.

## Ertelenenler

- Hakem rolüne ek hakem-ataması kontrolü
- Yarışmacı rolüne ek başvuru ve geri bildirim sahipliği kontrolü
- Yarışma ve diğer iş CRUD uçları
- Çoklu rol veya global yönetim modeli
- Audit log, AI, R2, Vectorize, Workflows ve deployment
