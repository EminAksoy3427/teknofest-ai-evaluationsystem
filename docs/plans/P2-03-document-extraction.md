# P2-03 — Document Extraction & AnalysisRun Foundation

## Amaç

Özel R2'deki başvuru PDF'sini yerel Cloudflare Workflow ile işleyip sayfa koruyan, Zod
doğrulamalı ve sürümlü belge artifact'ine dönüştürmek; tarihsel yapılandırma pinleriyle koşu
durumunu yöneticiye gözlemlenebilir kılmak.

## Uygulanan kapsam

- `AnalysisRun` D1 modeli, indeksler, yaşam döngüsü ve 0006 Drizzle migration
- kategori, aktif şablon/rubrik sürümü ve kaynak SHA-256'nın atomik creation-time pinlenmesi
- başvuru başına tek `QUEUED/PROCESSING` koşu, terminal koşulardan sonra korunmuş tarih
- `SUBMISSION_ANALYSIS` yerel Workflow binding'i ve yalnız `INGEST_AND_EXTRACT` adımları
- `unpdf` 1.8.1 serverless PDF.js ile sayfa sayfa çıkarım
- 200 sayfa / 1.000.000 karakter operasyonel guard'ları
- `document-extraction/v1` artifact ve `TEXT_SPARSE` uyarısı
- deterministik özel R2 `derived/{submissionId}/{analysisRunId}/document.json` yazımı
- başlatma, tarihçe ve detay API'leri; `competition:configure` ve nested ownership
- yönetici başvuru tablosunda başlatma, durum, güvenli hata ve üç saniyelik polling
- sentetik PDF unit/integration testleri ile yerel Worker + D1 + R2 + Workflow altın smoke

## Tutarlılık ve retry kararı

D1, Workflow ve R2 arasında dağıtık transaction iddiası yoktur. Koşu önce `QUEUED` yaratılır;
Workflow creation başarısızsa aynı satır güvenli altyapı koduyla `FAILED` olur. Çıkarım artifact'i
D1 finalizasyonundan önce deterministik anahtara yazılır. R2 yazımı sonrası D1 finalizasyon hatası
retry ile aynı nesne üzerinden uzlaştırılabilir; ek artifact veya AnalysisRun oluşturulmaz.

## Güvenlik ve gizlilik

Kaynak anahtar istemciden kabul edilmez ve PDF yetkili HTTP route'u üzerinden fetch edilmez.
Tam metin D1, normal API yanıtı, Workflow payload'ı veya loglara yazılmaz. Artifact public URL
almaz. PDF/metin güvenilmeyen girdidir. Parser hataları güvenli domain kodlarına çevrilir. Testler
yalnız programatik sentetik PDF kullanır.

## Doğrulama kapsamı

- artifact şeması, 1 tabanlı sayfalar ve deterministik sayaçlar
- tek/çok sayfalı, seyrek ve bozuk PDF
- kaynak SHA eşleşmesi, özel R2 içeriği ve JSON content type
- rol matrisi, yarışma izolasyonu ve güvenli 401/403/404/409
- Workflow creation, kaynak, parse ve artifact yazma hataları
- retry'da tek AnalysisRun ve tek deterministik artifact yolu
- gerçek yerel workerd Workflow çalışması
- R1 v1/v1 pinleme, v2 aktivasyonu sonrası R1 değişmezliği ve R2 v2/v2 pinleme
- temiz migration zinciri ve 0000-0005 → 0006 upgrade
- P2-01/P2-02/auth/build-secret regresyon kapıları

## Ertelenenler

Dil kararı, şablon uygunluk kararı, bölüm/semantik içerik analizi, kategori uyumu, benzerlik,
embedding/Vectorize, OpenAI/LLM, rubrik AI puanı, geri bildirim, hakem ataması/çalışma alanı,
risk kuyruğu ve OCR uygulanmamıştır. Uzak Workflow, R2, D1, migration veya deployment yoktur.
