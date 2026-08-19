# Yarışma Kapsamlı Yetkilendirme

## Kimlik doğrulama ve yetkilendirme

Better Auth kullanıcının kimliğini ve oturumunu doğrular. Başarılı oturum tek başına hiçbir
yarışmaya erişim vermez. Uygulama yetkilendirmesi, kimliği doğrulanmış kullanıcının istenen
yarışma için D1 içindeki `competition_member` kaydı okunarak sunucu tarafında yapılır.

İstemcinin gönderdiği rol, izin veya yarışma bağlamı yetki kanıtı değildir. Yarışma kimliği
yalnız istenen kaynağı seçer; erişim kararı her istekte oturum kullanıcısı ve veritabanı
üyeliği birlikte doğrulandıktan sonra verilir. React tarafında bileşen gizlemek yalnız bir
kullanılabilirlik davranışıdır ve sunucu kontrolünün yerini alamaz.

## Üyelik ve roller

Her üyelik bir kullanıcıyı tek bir yarışmaya ve tam olarak bir role bağlar. Aynı kullanıcı
farklı yarışmalarda farklı rollere sahip olabilir; Better Auth `user` tablosunda global rol
veya yönetici bayrağı yoktur.

Resmî roller:

- `COMPETITION_MANAGER`
- `REVIEWER`
- `CONTESTANT`
- `EVALUATION_MANAGER`

Roller sorumlulukları temsil eder ve hiyerarşik değildir. Örneğin yarışma yöneticisi,
kendiliğinden hakem izinlerini kazanmaz. Bir kullanıcının aynı yarışmada birden fazla rol
taşıması gerekirse bu, mevcut tek üyelik kuralını değiştiren açık bir ürün ve mimari kararı
gerektirir.

## İlk izin politikası

İlk politika bilinçli olarak küçüktür ve her rol yalnız kendi iznine sahiptir:

| Rol | İzin |
| --- | --- |
| `COMPETITION_MANAGER` | `competition:configure` |
| `EVALUATION_MANAGER` | `competition:view-operations` |
| `REVIEWER` | `submission:review` |
| `CONTESTANT` | `feedback:view-own` |

İzinler kalıtılmaz. Yeni iş uçları eklenirken gereken eylemler açıkça politikaya eklenmeli ve
sunucu route'unda uygulanmalıdır; gelecekteki tüm eylemleri şimdiden modelleyen genel bir
yetki motoru yoktur.

## Sunucu davranışı

Yetkilendirme yardımcıları mevcut Better Auth oturum çözümlemesini kullanır, sonra üyeliği
`packages/db` üzerinden D1'den okur:

- Oturum yoksa `401 UNAUTHORIZED`.
- Oturum var fakat ilgili yarışma üyeliği yoksa `403 FORBIDDEN`.
- İstenen role sahip değilse `403 FORBIDDEN`.
- Doğru üyelik/rol varsa işlem devam eder.

Korunan yarışma uçları, üyelik yokken kaynağın varlığı hakkında ek bilgi döndürmez. Üyelik
listesi yalnız oturum kullanıcısına ait satırları döndürür. Yarışma A üyeliği Yarışma B için
hiçbir erişim sağlamaz; bu çapraz yarışma izolasyonu her yeni veri erişim yolunda test
edilmesi gereken ana güvenlik özelliğidir.

## Daraltılacak gelecek kontrolleri

Rol ve üyelik gerekli fakat bazı iş eylemleri için ileride tek başına yeterli olmayacaktır.
Hakem uçlarında yarışma üyeliğine ek olarak açık hakem ataması; yarışmacı uçlarında ise
başvuru/geri bildirim sahipliği kontrol edilecektir. Bu kontroller ilgili veri modelleriyle
birlikte eklenene kadar mevcut izinler bu iş uçlarını uygulamaz.

Global yönetim, yarışmalar arası yönetici rolü ve global admin konsolu bilinçli olarak
ertelenmiştir.
