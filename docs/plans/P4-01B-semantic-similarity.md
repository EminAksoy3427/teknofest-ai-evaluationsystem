# P4-01B — Semantik ve Hibrit Benzerlik

## Amaç ve teslim

P4-01B, P4-01A lexical temeli üzerine gerçek semantik benzerlik katmanını ekler: Workers AI çok
dilli gömme sağlayıcısı, Vectorize production adaptörü, koşuya sabitlenmiş semantik skor, hibrit
skor entegrasyonu, iki katkıyı açıklayan bölüm kanıtı ve şeffaf degraded lexical mod.

Ürün sınırı değişmemiştir: benzerlik bir uzman dikkat sinyalidir. İntihal, kopya, hile veya
diskalifiye kararı değildir ve `FAIL` üretmez.

## Durum

| Alan | Durum |
| --- | --- |
| Gömme sağlayıcı sınırı ve doğrulanmış yanıt sözleşmesi | UYGULANDI, YERELDE DOĞRULANDI |
| Workers AI adaptörü (`@cf/baai/bge-m3`, 1024) | UYGULANDI, UZAK DOĞRULAMA GEREKLİ |
| Vectorize adaptörü, deterministik vektör kimliği, metadata filtresi | UYGULANDI, UZAK DOĞRULAMA GEREKLİ |
| Koşuya sabitlenmiş semantik skor ve tarihsel izolasyon | UYGULANDI, YERELDE DOĞRULANDI |
| Hibrit skor ve semantik bölüm kanıtı | UYGULANDI, YERELDE DOĞRULANDI |
| Degraded lexical mod (`semanticStatus`) | UYGULANDI, YERELDE DOĞRULANDI |
| Gerçek Workers AI çağrısı / gerçek Vectorize index'i | UZAK DOĞRULAMA GEREKLİ |
| Eşik kalibrasyonu, risk kuyruğu, toplam risk skoru | ERTELENDİ |

Hiçbir uzak Cloudflare kaynağı oluşturulmadı, hiçbir Workers AI veya OpenAI ağ çağrısı yapılmadı ve
dağıtım yapılmadı.

## Mimari kararlar

**Aday sözleşmesi korunmuştur.** Semantik erişim aday kümesini belirlemez. Hangi çiftlerin
işlendiği ve kalıcı yazıldığı hâlâ P4-01A D1 aday sorgusuyla belirlenir (aynı yarışma, başvuru
başına en son başarılı koşu, en fazla 20 aday). Vectorize yalnız bu koşu kümesi için semantik skor
sağlar; `findSimilarSections` çağrısına geçirilen `analysisRunIds` allow-list'i dışındaki her
eşleşme atılır. Bu nedenle aday üst sınırı, kalıcı satır kardinalitesi ve `all-vs-all` olmama
garantisi değişmemiştir.

**Yaşam döngüsü.** Yazma tarafı her koşunun kendi bölüm vektörlerini upsert etmesidir; okuma tarafı
kaynak koşunun aday koşuları sorgulamasıdır. Aday koşular kendi `SIMILARITY_CHECKS` aşamasını zaten
tamamladığı için vektörleri hâlihazırda indekstedir. Vectorize yazımları eventual consistent
olduğundan yeni tamamlanmış bir aday geçici olarak sorgulanamayabilir; bu `DEGRADED` olarak
raporlanır.

**Tarihsel kimlik.** Semantik skorlar `submissionId` değil `analysisRunId` ile anahtarlanır ve
vektör kimliği koşu kimliğini içerir. Bu nedenle A1/B1, A2/B1, A1/B2 ve A2/B2 ayrı tarihsel
gözlemler olarak kalır ve daha yeni bir koşu eski bir koşunun semantik skorunu devralamaz.

**Şema değişmemiştir.** `semanticStatus` ve bölüm başına `semanticScore` yalnız JSON alanlarına
(`details_json`, `evidence_json`) eklenmiştir ve geriye dönük uyumluluk için varsayılan taşır.
Migration üretilmemiştir; `0010` P4-01A'nın son migration'ıdır.

## Uzak sağlama adımı

Yerel emülasyon olmadığı için `apps/web/wrangler.jsonc` içindeki `ai` ve `vectorize` blokları
yorumlanmış bırakılmıştır. Etkinleştirme, index sağlamasıyla aynı değişiklikte yapılmalıdır:

```bash
npx wrangler vectorize create teknofest-ai-evaluationsystem-similarity \
  --dimensions=1024 --metric=cosine

# Yarışma izolasyonu filtresi için metadata indeksi vektörlerden ÖNCE oluşturulmalıdır.
npx wrangler vectorize create-metadata-index teknofest-ai-evaluationsystem-similarity \
  --property-name=competitionId --type=string
```

Boyut ve metrik index oluşturulduktan sonra değiştirilemez. Metadata indeksi vektörler eklendikten
sonra oluşturulursa mevcut vektörlerin metadata'sı indekslenmez ve yeniden upsert gerekir.

Uzak doğrulamada teyit edilecekler: gerçek gömme çıktı boyutunun `1024` olduğu, cosine `score`
aralığının beklendiği gibi olduğu ve upsert görünürlük gecikmesi.

## Kabul sınırları

Eşikler (`HIGH >= 0.70`, `MEDIUM >= 0.35`) ve hibrit ağırlıklar (`0.6` lexical + `0.4` semantic)
provisional geliştirme politikasıdır. Kalibre edilmiş olasılık veya resmî TEKNOFEST eşiği değildir.
Bir skor asla intihal olasılığı olarak sunulmaz.

Fake ve deterministik sağlayıcılar yalnız test fixture'larıdır; production kod yolunda fake
sağlayıcı fallback'i yoktur ve hiçbir production modülü `test-fixtures` içinden içe aktarım yapmaz
(otomatik testle korunur).
