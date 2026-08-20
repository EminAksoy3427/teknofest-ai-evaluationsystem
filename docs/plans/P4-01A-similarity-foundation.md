# P4-01A — Deterministik Benzerlik Temeli

## Amaç ve teslim

P4-01A, immutable AnalysisRun artifact'lerinden çalışan açıklanabilir lexical benzerliği, tarihsel
SimilarityPair kalıcılığını, test-only semantic provider sınırını, hibrit skor sözleşmesini,
Workflow `SIMILARITY_CHECKS` aşamasını ve yarışma yöneticisi görünümünü teslim eder.

Teslim kapsamı:

- 5-token shingle + Jaccard lexical sinyali
- bounded bölüm/chunk, aday, kanıt ve topK sınırları
- veritabanı düzeyinde aynı-yarışma ve koşu sahipliği composite FK'leri
- self/inverse pair engeli ve aynı koşu çifti için retry upsert'i
- pinlenmiş SHA-256 exact-document sinyali
- `SIMILARITY` AnalysisCheck ve review-only PASS/WARN politikası
- manager-only API ve Türkçe lexical-only UI
- fake vector provider ile geleceğe dönük semantic/hybrid sözleşme
- sentetik deterministik, DB, yetkilendirme ve Workflow testleri

## Tarihsel kimlik modeli

`SimilarityPair` bir toplu durum kaydı değil, iki BELİRLİ ve değişmez AnalysisRun arasındaki
tarihsel bir benzerlik gözlemidir.

Değişmez kimlik sütunları:

- `competition_id`
- `submission_a_id`
- `submission_b_id`
- `analysis_run_a_id`
- `analysis_run_b_id`

Aynı koşu çiftinin yeniden analizi (Workflow retry) yalnız şu ölçülen alanları uzlaştırır:
`lexical_score`, `semantic_score`, `combined_score`, `mode`, `level`, `exact_document_match`,
bounded `evidence_json` ve `updated_at`. Kimlik sütunları ve `created_at` hiçbir zaman yeniden
yazılmaz.

Mantıksal `A/B` çiftinin birden çok tarihsel gözlemi bir arada bulunabilir:

- `A1/B1`
- `A2/B1`
- `A1/B2`
- `A2/B2`

Yeni bir AnalysisRun eski gözlemi `A2/B1` olacak biçimde güncellemez; yeni bir satır üretir. Böylece
eski gözlemler kalıcı olarak yeniden üretilebilir kalır.

## Canonical taraf hizalaması

Canonical sıralama başvuru kimlikleri üzerinde deterministiktir (`submission_a_id <
submission_b_id`) ve bir DB CHECK kısıtıyla korunur. Ancak AnalysisRun kimlikleri kendi
başvurularıyla birlikte taşınır: başvuru kimlikleri AnalysisRun kimliklerinden bağımsız olarak
canonical hale getirilmez.

Girdi `B/B1, A/A1` olsa bile satır şu şekilde yazılır:

```
submission_a_id = A, analysis_run_a_id = A1
submission_b_id = B, analysis_run_b_id = B1
```

Bu hizalama `canonicalSimilarityPairIdentity` tarafından üretilir ve ayrıca veritabanı tarafından
zorunlu kılınır (aşağıdaki C ve D kısıtları).

## Uygulanan veritabanı kısıtları

Aşağıdakiler şemada gerçekten mevcuttur ve `0010_yummy_sharon_ventura.sql` içinde üretilmiştir.

Ebeveyn anahtarları (SQLite composite FK'nin gerektirdiği UNIQUE):

- `submission(competition_id, id)` → `submission_competition_scope_unique`
- `analysis_run(submission_id, id)` → `analysis_run_submission_scope_unique`

`similarity_pair` composite foreign key'leri:

- A) `(competition_id, submission_a_id)` → `submission(competition_id, id)` ON DELETE CASCADE
- B) `(competition_id, submission_b_id)` → `submission(competition_id, id)` ON DELETE CASCADE
- C) `(submission_a_id, analysis_run_a_id)` → `analysis_run(submission_id, id)` ON DELETE CASCADE
- D) `(submission_b_id, analysis_run_b_id)` → `analysis_run(submission_id, id)` ON DELETE CASCADE

A ve B, bir başvurunun satırda yazılı yarışmaya ait olmasını zorunlu kılar; başka yarışmanın
başvurusuyla satır üretilemez. C ve D, pinlenmiş her koşunun aynı canonical taraftaki başvuruya ait
olmasını zorunlu kılar; hem sahiplik hem taraf hizalaması veritabanında güvence altındadır.

Tarihsel benzersizlik:

- `UNIQUE(competition_id, analysis_run_a_id, analysis_run_b_id)` →
  `similarity_pair_competition_runs_unique`

Mantıksal çift araması için indeksler:

- `(competition_id, submission_a_id, submission_b_id)`
- `(competition_id, submission_a_id)`, `(competition_id, submission_b_id)`
- `(competition_id, analysis_run_b_id)`

CHECK kısıtları: canonical sıra, `0..1` skor aralıkları, `mode`/`level` değer kümeleri, mod ile
semantik skor tutarlılığı ve `json_valid(evidence_json)`. Canonical sıra CHECK'i hem self-pair'i hem
inverse satırı reddeder.

Bu kısıtlar uygulama doğrulamasının yerine geçmez; repository yazımı ayrıca `INSERT … SELECT …
WHERE EXISTS` ile yarışma ve koşu kapsamını doğrular. Ancak kısıtlar, repository tamamen atlansa
bile geçerlidir ve doğrudan SQL testleriyle kanıtlanmıştır.

## Sorgu semantiği

- Belirli bir tarihsel AnalysisRun sorgusu yalnız o koşu kimliğini taşıyan gözlemleri döndürür ve
  asla daha yeni bir koşuya kaymaz.
- Başvuru düzeyindeki "mevcut benzerlik" görünümü, başvurunun mevcut (en son başarılı) AnalysisRun
  kimliği bilinçli olarak çözülerek türetilir; API yanıtı hangi koşuya pinlendiğini
  `analysisRunId` alanında açıkça bildirir.
- Aynı koşu içinde bir karşı taraf birden çok kez gözlemlendiyse, o koşuya pinli kalarak en son
  gözlem sunulur.

## Kabul sınırları

P4-01A semantik sağlayıcı bağlıymış gibi davranmaz. Fake provider production kod yoluna otomatik
olarak girmez; production composition semantik sağlayıcıyı `null` bırakır. Threshold'lar provisional
development policy'dir (`HIGH >= 0.70`, `MEDIUM >= 0.35`, hibrit ağırlık `0.6` lexical + `0.4`
semantic) ve resmî TEKNOFEST eşiği ya da intihal olasılığı değildir. Bounded local candidate taraması
(en fazla 20 aday) yalnız temel/doğrulama stratejisidir ve büyük corpus ölçekleme iddiası taşımaz.

Benzerlik yalnız inceleme sinyalidir: `LOW → PASS`, `MEDIUM/HIGH → WARN`. Hiçbir benzerlik bulgusu
`FAIL`, intihal, kopya, hile, diskalifiye veya otomatik ret kararı üretmez.

P4-01B'ye ertelenenler: gerçek Workers AI multilingual embedding smoke'u, çıktı boyutunun
doğrulanması, buna uygun cosine Vectorize index'i, competition metadata filter ve gerçek semantic
topK araması. Rubrik AI, feedback, reviewer assignment/workspace ve risk queue ayrıca ertelenmiştir.

Yalnız sentetik veri kullanılacaktır; remote D1/R2/Workflow/Vectorize mutasyonu, Workers AI çağrısı,
deploy, commit ve push yapılmayacaktır.
