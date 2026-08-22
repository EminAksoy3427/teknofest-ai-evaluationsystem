# Yarışma Yapılandırma Mimarisi

## Sınır

P2-01 yarışma yöneticisinin yarışma bilgilerini, kategorileri, raporun beklenen yapısını ve
değerlendirme rubriğini hazırlamasını sağlar. Başvuru/dosya yükleme, PDF çıkarımı, yapay zekâ,
değerlendirme ve nihai karar bu sınırın dışındadır. Yapay zekâ nihai karar sahibi değildir;
insan hakem nihai karar vericidir.

Paylaşılan runtime sözleşmeleri `packages/shared`, ilişkisel kalıcılık ve atomik işlemler
`packages/db`, HTTP erişim ve yetkilendirme ise `apps/web/src/server` sorumluluğundadır. React
istemcisi yalnız sürümlü `/api/v1` uçlarını tüketir.

## MVP yarışma bootstrap kuralı

Her kimliği doğrulanmış kullanıcı yeni bir yarışma oluşturabilir. Sunucu, kullanıcı kimliğini
Better Auth oturumundan alır ve aşağıdaki iki yazımı tek D1 batch işlemiyle gerçekleştirir:

1. `competition` satırı oluşturulur.
2. Kurucu için aynı yarışmada `COMPETITION_MANAGER` üyeliği oluşturulur.

Batch atomiktir; üyelik yazımı başarısız olursa yarışma satırı da kalmaz. Bu davranış global
yönetim yetkisi vermez, mevcut yarışmalara erişim sağlamaz ve yalnız oluşturulan yarışmayı
kapsar. Gelecekte T3 provisioning/global yönetim bu self-service kuralı daraltabilir.

## Yetkilendirme ve izolasyon

`POST /api/v1/competitions` yalnız authentication gerektirir. Diğer bütün yapılandırma
okuma/yazımları sunucuda yarışma üyeliği ve `competition:configure` iznini gerektirir. Roller
hiyerarşik değildir; `EVALUATION_MANAGER`, `REVIEWER` ve `CONTESTANT` yapılandırma yapamaz.

Kategori, şablon ve rubrik sorguları hem kaynak kimliği hem route yarışma kimliğiyle yapılır.
Başka yarışmaya ait nested kaynak, doğru yarışmada yönetici olsa bile bilgi sızdırmayan `404`
sonucuna gider. İstemcinin gönderdiği rol, kullanıcı kimliği, sahiplik veya lifecycle durumu
yetki kanıtı değildir.

## Kategori semantiği

Kategori; yarışma kapsamında benzersiz `code`, ad, yetkili açıklama, isteğe bağlı kapsam notu
ve deterministik sıra taşır. Açıklama “bu kategori nedir?”, kapsam notu “neler içeri/dışarı
sayılır?” sorularını yanıtlar. Aynı kod farklı yarışmalarda kullanılabilir. Bu alanlar prompt
değildir; gelecekteki kategori uyumu analizinin yetkili girdileridir.

P2-02 ile başvurular kategoriye `RESTRICT` ilişkisiyle bağlanır. Boş kategori silinebilir; bağlı
başvuru bulunan kategori tarihsel başvuruyu yok etmemek için silinmez ve API güvenli `409`
döndürür.

## Şablon yapısal profili ve yaşam döngüsü

Şablon tek bir değişebilir yarışma alanı değildir. Her `TemplateVersion`, artan sürüm numarası,
etiket ve aşağıdaki doğrulanmış yapısal profili taşır:

```json
{
  "expectedLanguage": "tr",
  "sections": [
    {
      "key": "project-summary",
      "title": "Proje Özeti",
      "description": "",
      "required": true,
      "order": 1
    }
  ]
}
```

Bölüm kodları/sıraları benzersiz ve deterministiktir. Yalnız `DRAFT` düzenlenebilir. Aktivasyon
için geçerli etiket/dil, en az bir bölüm ve en az bir zorunlu bölüm gerekir. Yeni aktivasyon,
önceki `ACTIVE` sürümü aynı D1 batch içinde `RETIRED` yapar. Aktif ve emekli sürümler değişmez;
yarışma başına tek aktif sürüm kısmi benzersiz indeksle de korunur.

P2-01 yalnız yapısal uyumu tanımlıyordu. P6.5A ile bir `TemplateVersion` artık hem yapısal
profili hem de resmî PDF şablon dosyasını birlikte taşır ve dosyası olmadan etkinleştirilemez;
ayrıntı `docs/architecture/template-files.md` içindedir. Piksel düzeyi düzen uyumu hâlâ post-MVP'ye
ertelenmiştir — bu, byte/piksel özdeşliği değil deterministik başlık eşleşmesidir.

## Rubrik, kriterler ve yaşam döngüsü

`RubricVersion` aynı `DRAFT / ACTIVE / RETIRED` kurallarını izler. Kriterler sabit kod, ad,
açıklama, pozitif azami puan, negatif olmayan ağırlık, kanıt beklentisi ve sıra taşır. Ağırlık
toplamı gösterilir fakat 100 olma koşulu release gate değildir.

İstemci taslak kriterlerin eksiksiz sıralı listesini gönderir. Repository eski listeyi silme ve
yeni listeyi ekleme sorgularını tek batch içinde çalıştırır; bir satır başarısız olursa önceki
listenin tamamı korunur. Kriteri olmayan rubrik etkinleştirilemez. Aktif/emekli rubrik ve
kriterleri değiştirilemez.

## Hazırlık projeksiyonu

Hazırlık veritabanında saklanmaz. Yapılandırma okumasında şu değerler türetilir:

- yarışma bilgileri var,
- en az bir kategori var,
- aktif şablon yapısı var,
- aktif şablonun resmî dosyası var,
- aktif rubrik var,
- aktif rubriğin en az bir kriteri var.

Tümü doğruysa `ready: true` döner ve arayüz “Yarışma yapılandırması hazır” der. Bu sonuç başvuru,
yapay zekâ veya Problem 4 MVP'sinin tamamlandığı anlamına gelmez.

`activeTemplate` ve `activeTemplateFile` ayrı bayraklardır: P6.5A öncesinden gelen bir yarışma
dosyasız ACTİF bir şablon taşıyabilir. O tarihsel satır olduğu gibi korunur ve ona sabitlenmiş eski
koşular okunabilir kalır, fakat güncel yapılandırma sayılmaz — hazırlık `ready` bildirmez ve yeni
bir `AnalysisRun` bu şablona sabitlenemez. Ayrıntı `docs/architecture/template-files.md` içindedir.

## Gelecek uyumluluğu

Yetkili şablon dosyası R2'de saklanmaktadır (P6.5A); zorunlu kontroller dil, bölüm ve kategori
tanımlarını kullanır; rubrik değerlendirmesi aktif sürüm ve kanıt beklentilerini tüketir.
`AnalysisRun`, kullanılan `TemplateVersion` ve `RubricVersion` kimliklerini sabitler.
