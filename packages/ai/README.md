# @teknofest-ai/ai

Yapay zekâ sağlayıcı adaptörlerini, sürümlü promptları ve doğrulanmış yapılandırılmış çıktıları
barındırır. P3-02 OpenAI adaptörü resmi JavaScript SDK'sıyla Responses API kullanır. GPT-5
ailesindeki gerçek model ortam yapılandırmasından seçilir ve `AnalysisRun` başında prompt paketiyle
birlikte sabitlenir. Rapor çağrıları `store:false`, araçsız ve strict Structured Outputs ile
çalışır; sonuçlar uygulama Zod şemasıyla yeniden doğrulanır.
