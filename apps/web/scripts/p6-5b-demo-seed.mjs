/**
 * P6.5B UX demo seed — LOCAL ONLY, SYNTHETIC ONLY.
 *
 * Populates the local Miniflare D1 database and local R2 simulation with a deterministic
 * synthetic demo world so the authenticated UI can be inspected in a browser during the
 * product UX rebuild. No real TEKNOFEST data, no remote resources, no AI calls.
 *
 * Usage (dev server SHOULD be stopped while seeding):
 *   node scripts/p6-5b-demo-seed.mjs
 *
 * Writes signed demo session cookies to .wrangler/tmp/p6-5b-demo-cookies.json (gitignored).
 * Re-running the script deletes and recreates the demo world (all ids are `demo-` prefixed).
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { makeSignature } from "better-auth/crypto";

import { createSyntheticTextPdf } from "./synthetic-pdf.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const webDirectory = resolve(scriptDirectory, "..");
const wrangler = join(webDirectory, "node_modules", "wrangler", "bin", "wrangler.js");
const bucket = "teknofest-ai-evaluationsystem-documents";

const now = Date.now();
const DAY = 86_400_000;

const ID = {
  competition: "demo-comp-2026",
  categoryAgri: "demo-cat-tarim",
  categoryHealth: "demo-cat-saglik",
  categoryEdu: "demo-cat-egitim",
  template: "demo-template-v1",
  rubric: "demo-rubric-v1",
  criterionOriginality: "demo-crit-ozgunluk",
  criterionTechnical: "demo-crit-teknik",
  criterionFeasibility: "demo-crit-uygulanabilirlik",
  criterionImpact: "demo-crit-etki",
  users: {
    manager: "demo-user-manager",
    evaluationManager: "demo-user-eval",
    reviewerOne: "demo-user-reviewer-1",
    reviewerTwo: "demo-user-reviewer-2",
    contestantOne: "demo-user-contestant-1",
    contestantTwo: "demo-user-contestant-2",
  },
};

const CRITERIA = [
  {
    id: ID.criterionOriginality,
    code: "ozgunluk",
    title: "Özgünlük ve Yenilikçilik",
    description: "Projenin mevcut çözümlerden farklılaşma düzeyi.",
    evidenceExpectation: "Rapor sayfasına dayalı somut alıntı bekleniyor.",
    maxScore: 10,
    weightBasisPoints: 2000,
    order: 1,
  },
  {
    id: ID.criterionTechnical,
    code: "teknik",
    title: "Teknik Yeterlilik ve Yöntem",
    description: "Yöntemin doğruluğu, veri ve doğrulama yaklaşımı.",
    evidenceExpectation: "Yöntem ve sonuç bölümlerinden kanıt bekleniyor.",
    maxScore: 20,
    weightBasisPoints: 4000,
    order: 2,
  },
  {
    id: ID.criterionFeasibility,
    code: "uygulanabilirlik",
    title: "Uygulanabilirlik",
    description: "Sahada gerçekçi biçimde uygulanabilme durumu.",
    evidenceExpectation: "Maliyet, kaynak ve saha koşulu kanıtı bekleniyor.",
    maxScore: 10,
    weightBasisPoints: 2000,
    order: 3,
  },
  {
    id: ID.criterionImpact,
    code: "etki",
    title: "Sosyal ve Ekonomik Etki",
    description: "Hedef kitle üzerindeki ölçülebilir etki potansiyeli.",
    evidenceExpectation: "Ölçülebilir hedef ve etki kanıtı bekleniyor.",
    maxScore: 10,
    weightBasisPoints: 2000,
    order: 4,
  },
];
const MAX_TOTAL = CRITERIA.reduce((total, criterion) => total + criterion.maxScore, 0);

const SECTIONS = [
  { key: "ozet", title: "Proje Özeti", required: true, order: 1, page: 1 },
  { key: "problem", title: "Problem Tanımı", required: true, order: 2, page: 2 },
  { key: "yontem", title: "Yöntem", required: true, order: 3, page: 3 },
  { key: "uygulanabilirlik", title: "Uygulanabilirlik", required: false, order: 4, page: 5 },
  { key: "sonuc", title: "Sonuç ve Değerlendirme", required: true, order: 5, page: 7 },
];

const STRUCTURAL_PROFILE = JSON.stringify({
  expectedLanguage: "tr",
  sections: SECTIONS.map((section) => ({
    key: section.key,
    title: section.title,
    description: "",
    required: section.required,
    order: section.order,
  })),
});

function sql(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function runWrangler(argumentsList) {
  const result = spawnSync(process.execPath, [wrangler, ...argumentsList], {
    cwd: webDirectory,
    encoding: "utf8",
    env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
  });
  if (result.status !== 0) {
    throw new Error(`Wrangler command failed: ${result.stderr || result.stdout}`);
  }
}

function readDevVariable(name) {
  const file = readFileSync(join(webDirectory, ".dev.vars"), "utf8");
  for (const line of file.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match?.[1] !== name) continue;
    const raw = match[2]?.trim() ?? "";
    return raw.replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/, (_whole, double, single) =>
      double === undefined ? single : double,
    );
  }
  throw new Error(`${name} is required in .dev.vars`);
}

function buildReportPages(project) {
  return [
    `${project.title}\nBaşvuru Kodu: ${project.code}\n\nProje Özeti\n${project.summary}\nBu rapor sentetik demo verisidir; gerçek bir yarışmacıya ait değildir.`,
    `Problem Tanımı\n${project.problem}\nMevcut çözümlerin sınırlılıkları saha gözlemleriyle desteklenmiştir.`,
    `Yöntem\n${project.method}\nVeri toplama, model eğitimi ve doğrulama adımları ayrı ayrı açıklanmıştır.`,
    `Yöntem (devam)\nDoğrulama için ayrılmış veri kümesiyle çapraz doğrulama uygulanmıştır.\nBaşarı ölçütleri tablo halinde sunulmuştur.`,
    `Uygulanabilirlik\n${project.feasibility}\nMaliyet kalemleri ve kurulum adımları listelenmiştir.`,
    `Pilot Çalışma\n${project.pilot}\nPilot bulguları üçüncü bölümdeki yöntemle tutarlıdır.`,
    `Sonuç ve Değerlendirme\n${project.conclusion}\nGelecek çalışmalar bölümünde ölçeklenme planı yer almaktadır.`,
    `Kaynakça\nSentetik kaynak listesi.\nEk A: Veri sözlüğü. Ek B: Donanım listesi.`,
  ];
}

const PROJECTS = {
  s1: {
    id: "demo-sub-001",
    fileId: "demo-file-001",
    runId: "demo-run-001",
    code: "DEMO-001",
    title: "Akıllı Sulama Asistanı",
    categoryId: ID.categoryAgri,
    summary:
      "Toprak nemi ve hava tahmini verilerini birleştirerek sulama planı öneren düşük maliyetli bir karar destek sistemi.",
    problem:
      "Küçük ölçekli üreticiler sulama zamanlamasını sezgisel yönetmekte ve su kaybı yaşamaktadır.",
    method:
      "LoRa tabanlı nem sensörleri ile toplanan veriler, hava tahmini API'siyle birleştirilip zaman serisi modeliyle işlenmiştir.",
    feasibility:
      "Donanım maliyeti dekar başına düşüktür; kurulum yerel kooperatif eliyle yapılabilir.",
    pilot: "İki sera ve bir açık tarlada 6 haftalık pilot çalışma yürütülmüştür.",
    conclusion: "Pilot alanlarda su tüketimi %18 azalmış, verim korunmuştur.",
  },
  s2: {
    id: "demo-sub-002",
    fileId: "demo-file-002",
    runId: "demo-run-002",
    code: "DEMO-002",
    title: "Sera İklim Kontrol Sistemi",
    categoryId: ID.categoryAgri,
    summary:
      "Sera içi sıcaklık, nem ve ışık verilerini izleyip havalandırma ve sulamayı otomatik yöneten bir kontrol sistemi.",
    problem: "Sera üreticileri iklim dalgalanmalarına manuel müdahalede geç kalmaktadır.",
    method:
      "Sensör ağı verileri bulut üzerinde toplanmakta, kural tabanlı ve öğrenmeli karma bir denetleyici ile aktüatörler yönetilmektedir.",
    feasibility: "Mevcut sera otomasyon panolarına ek modülle entegre edilebilir.",
    pilot: "Tek serada 4 haftalık gözlem yapılmıştır.",
    conclusion: "Sıcaklık sapmaları %40 azaltılmıştır.",
  },
  s3: {
    id: "demo-sub-003",
    fileId: "demo-file-003",
    runId: "demo-run-003",
    code: "DEMO-003",
    title: "Mobil Sağlık Takip Uygulaması",
    categoryId: ID.categoryHealth,
    summary:
      "Kronik hastaların ilaç ve ölçüm takibini kolaylaştıran, yakınlarına kontrollü bildirim gönderen bir mobil uygulama.",
    problem: "İlaç uyumu düşük hastalarda takip yükü aile üzerinde kalmaktadır.",
    method: "Uygulama içi hatırlatıcılar ve ölçüm girişleri basit kural motoruyla izlenmektedir.",
    feasibility: "Uygulama mevcut mağazalar üzerinden dağıtılabilir.",
    pilot: "Sınırlı bir gönüllü grubuyla kullanılabilirlik testi yapılmıştır.",
    conclusion: "Kullanılabilirlik puanı hedefin üzerinde çıkmıştır.",
  },
  s4: {
    id: "demo-sub-004",
    fileId: "demo-file-004",
    runId: "demo-run-004",
    code: "DEMO-004",
    title: "Ders Asistanı Platformu",
    categoryId: ID.categoryEdu,
    summary: "Öğrencilerin ders içeriklerine soru-cevap biçiminde erişmesini sağlayan platform.",
    problem: "Kalabalık sınıflarda bireysel soru fırsatı sınırlıdır.",
    method: "İçerik dizinleme ve arama tabanlı eşleştirme kullanılmıştır.",
    feasibility: "Okul sunucularında barındırılabilir.",
    pilot: "Pilot yapılmamıştır.",
    conclusion: "Prototip aşamasındadır.",
  },
  s5: {
    id: "demo-sub-005",
    fileId: "demo-file-005",
    runId: "demo-run-005",
    code: "DEMO-005",
    title: "Akıllı Sera Yönetim Paneli",
    categoryId: ID.categoryAgri,
    summary:
      "Sera içi sıcaklık, nem ve ışık verilerini izleyip havalandırma ve sulamayı otomatik yöneten bir yönetim paneli.",
    problem: "Sera üreticileri iklim dalgalanmalarına manuel müdahalede geç kalmaktadır.",
    method:
      "Sensör ağı verileri bulut üzerinde toplanmakta, kural tabanlı ve öğrenmeli karma bir denetleyici ile aktüatörler yönetilmektedir.",
    feasibility: "Mevcut sera otomasyon panolarına ek modülle entegre edilebilir.",
    pilot: "Tek serada 3 haftalık gözlem yapılmıştır.",
    conclusion: "Sıcaklık sapmaları belirgin biçimde azaltılmıştır.",
  },
  s6: {
    id: "demo-sub-006",
    fileId: "demo-file-006",
    runId: null,
    code: "DEMO-006",
    title: "Görme Engelliler için Nesne Tanıma",
    categoryId: ID.categoryHealth,
    summary:
      "Giyilebilir kamera ile çevredeki nesneleri sesli olarak tarif eden bir yardımcı sistem.",
    problem: "Görme engelli bireylerin iç mekân navigasyonu desteklenmelidir.",
    method: "Cihaz üstü hafif bir nesne tanıma modeli kullanılmıştır.",
    feasibility: "Prototip maliyeti belirlenmiştir.",
    pilot: "Pilot planlanmaktadır.",
    conclusion: "İlk sonuçlar umut vericidir.",
  },
};

// ---------------------------------------------------------------------------
// Analysis check JSON builders (match packages/shared Zod contracts).
// ---------------------------------------------------------------------------

function languageDetails() {
  return {
    checkType: "LANGUAGE",
    expectedLanguage: "tr",
    detectedLanguage: "tur",
    sampledCharacterCount: 5400,
    sampledPageCount: 8,
    mixedLanguageSignal: false,
    undeterminedPageCount: 0,
    reason: "MATCH",
  };
}

function templateStructureDetails() {
  return {
    checkType: "TEMPLATE_STRUCTURE",
    missingRequiredSectionKeys: [],
    orderDeviation: false,
    duplicateHeadingKeys: [],
    extractionWarnings: [],
  };
}

function sectionPresenceDetails() {
  return {
    checkType: "SECTION_PRESENCE",
    sections: SECTIONS.map((section, index) => ({
      sectionKey: section.key,
      expectedTitle: section.title,
      required: section.required,
      expectedOrder: section.order,
      found: true,
      pageNumber: section.page,
      matchedText: section.title,
      occurrences: [{ pageNumber: section.page, documentOrder: index, matchedText: section.title }],
    })),
    missingRequiredSectionKeys: [],
  };
}

function sectionContentDetails(overrides = {}) {
  return {
    checkType: "SECTION_CONTENT",
    sections: SECTIONS.map((section) => {
      const override = overrides[section.key] ?? {};
      return {
        sectionKey: section.key,
        title: section.title,
        required: section.required,
        assessment: override.assessment ?? "SUPPORTED",
        reason:
          override.reason ??
          `${section.title} bölümü beklenen içeriği somut ifadelerle karşılıyor.`,
        evidenceStrength: override.evidenceStrength ?? "HIGH",
        evidence: [
          {
            page: section.page,
            excerpt: override.excerpt ?? `${section.title} bölümünden doğrulanmış alıntı.`,
            verified: true,
          },
        ],
        missingExpectations: override.missingExpectations ?? [],
        sourceCoverage: "FULL",
        startPage: section.page,
        endPage: Math.min(section.page + 1, 8),
      };
    }),
  };
}

function categoryFitDetails(overrides = {}) {
  return {
    checkType: "CATEGORY_FIT",
    assessment: overrides.assessment ?? "ALIGNED",
    reason:
      overrides.reason ??
      "Rapor içeriği kategori tanımıyla güçlü biçimde örtüşüyor; problem ve yöntem kategori kapsamında.",
    evidenceStrength: overrides.evidenceStrength ?? "HIGH",
    evidence: [
      {
        page: overrides.evidencePage ?? 2,
        excerpt: overrides.excerpt ?? "Problem tanımı kategori kapsamındaki ihtiyaca odaklanıyor.",
        verified: true,
      },
    ],
    alignmentSignals: overrides.alignmentSignals ?? [
      "Problem tanımı kategori kapsamıyla uyumlu.",
      "Yöntem kategori beklentisiyle tutarlı.",
    ],
    mismatchSignals: overrides.mismatchSignals ?? [],
    sourceCoverage: "SAMPLED",
  };
}

function similarityDetails(level, topMatches) {
  return {
    checkType: "SIMILARITY",
    mode: "LEXICAL_ONLY",
    semanticStatus: "DISABLED",
    level,
    candidateCount: 4,
    topMatches,
  };
}

function similaritySectionMatches(sourceId, otherId) {
  return [
    {
      sourceSubmissionId: sourceId,
      otherSubmissionId: otherId,
      sectionKey: "yontem",
      sectionTitle: "Yöntem",
      otherSectionKey: "yontem",
      otherSectionTitle: "Yöntem",
      sourcePage: 3,
      otherPage: 3,
      lexicalScore: 0.86,
      semanticScore: null,
      sourceExcerpt:
        "Sensör ağı verileri bulut üzerinde toplanmakta, kural tabanlı ve öğrenmeli karma bir denetleyici ile aktüatörler yönetilmektedir.",
      otherExcerpt:
        "Sensör ağı verileri bulut üzerinde toplanmakta, kural tabanlı ve öğrenmeli karma bir denetleyici ile aktüatörler yönetilmektedir.",
    },
    {
      sourceSubmissionId: sourceId,
      otherSubmissionId: otherId,
      sectionKey: "problem",
      sectionTitle: "Problem Tanımı",
      otherSectionKey: "problem",
      otherSectionTitle: "Problem Tanımı",
      sourcePage: 2,
      otherPage: 2,
      lexicalScore: 0.79,
      semanticScore: null,
      sourceExcerpt: "Sera üreticileri iklim dalgalanmalarına manuel müdahalede geç kalmaktadır.",
      otherExcerpt: "Sera üreticileri iklim dalgalanmalarına manuel müdahalede geç kalmaktadır.",
    },
  ];
}

function rubricDetails(scores) {
  const criteria = CRITERIA.map((criterion) => {
    const entry = scores[criterion.code];
    return {
      criterionId: criterion.id,
      code: criterion.code,
      title: criterion.title,
      order: criterion.order,
      suggestedScore: entry.score,
      maxScore: criterion.maxScore,
      reason: entry.reason,
      evidenceStrength: entry.strength,
      evidence: entry.evidence ?? [],
      missingPoints: entry.missing ?? [],
    };
  });
  return {
    checkType: "RUBRIC_EVALUATION",
    criteria,
    suggestedTotalScore: criteria.reduce((total, item) => total + item.suggestedScore, 0),
    maxTotalScore: MAX_TOTAL,
    feedbackSummary: scores.feedbackSummary,
  };
}

function check(runId, type, status, summary, details, sequence) {
  return `INSERT INTO analysis_check (id, analysis_run_id, type, status, summary, details_json, created_at, updated_at)
    VALUES (${sql(`${runId}-check-${sequence}`)}, ${sql(runId)}, ${sql(type)}, ${sql(status)}, ${sql(summary)}, ${sql(JSON.stringify(details))}, ${now - DAY}, ${now - DAY});`;
}

// ---------------------------------------------------------------------------
// Build PDFs and compute hashes.
// ---------------------------------------------------------------------------

const templatePdf = createSyntheticTextPdf([
  `Resmî Rapor Formatı (v1)\n\nBu belge sentetik demo şablonudur.\n\nBeklenen bölümler:\n${SECTIONS.map((section) => `${section.order}. ${section.title}${section.required ? "" : " (isteğe bağlı)"}`).join("\n")}`,
  "Biçim Kuralları\n\nRapor dili Türkçedir.\nHer bölüm ayrı başlık ile başlamalıdır.",
]);

const pdfBySubmission = new Map();
for (const project of Object.values(PROJECTS)) {
  pdfBySubmission.set(project.id, createSyntheticTextPdf(buildReportPages(project)));
}

const templateSha = sha256Hex(templatePdf);
const shaBySubmission = new Map(
  [...pdfBySubmission.entries()].map(([id, bytes]) => [id, sha256Hex(bytes)]),
);

const templateStorageKey = `competitions/${ID.competition}/template-versions/${ID.template}/demo-tfile/template.pdf`;
const storageKeyBySubmission = new Map(
  Object.values(PROJECTS).map((project) => [
    project.id,
    `competitions/${ID.competition}/submissions/${project.id}/${project.fileId}/report.pdf`,
  ]),
);

// ---------------------------------------------------------------------------
// SQL statements.
// ---------------------------------------------------------------------------

const statements = [];

// Idempotent cleanup: cascades remove all competition-scoped rows; demo users cascade sessions.
statements.push(`DELETE FROM competition WHERE id = ${sql(ID.competition)};`);
statements.push(`DELETE FROM "user" WHERE id LIKE 'demo-user-%';`);

statements.push(`INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at) VALUES
  (${sql(ID.users.manager)}, 'Elif Yılmaz', 'demo-manager@example.com', 1, ${now - 30 * DAY}, ${now - 30 * DAY}),
  (${sql(ID.users.evaluationManager)}, 'Murat Demir', 'demo-eval@example.com', 1, ${now - 30 * DAY}, ${now - 30 * DAY}),
  (${sql(ID.users.reviewerOne)}, 'Dr. Ayşe Kaya', 'demo-reviewer1@example.com', 1, ${now - 30 * DAY}, ${now - 30 * DAY}),
  (${sql(ID.users.reviewerTwo)}, 'Doç. Dr. Kemal Arslan', 'demo-reviewer2@example.com', 1, ${now - 30 * DAY}, ${now - 30 * DAY}),
  (${sql(ID.users.contestantOne)}, 'Zeynep Şahin', 'demo-contestant1@example.com', 1, ${now - 30 * DAY}, ${now - 30 * DAY}),
  (${sql(ID.users.contestantTwo)}, 'Ali Çelik', 'demo-contestant2@example.com', 1, ${now - 30 * DAY}, ${now - 30 * DAY});`);

const sessions = [
  { key: "manager", userId: ID.users.manager, label: "Elif Yılmaz (Yarışma Yöneticisi)" },
  {
    key: "evaluationManager",
    userId: ID.users.evaluationManager,
    label: "Murat Demir (Değerlendirme Yöneticisi)",
  },
  { key: "reviewer", userId: ID.users.reviewerOne, label: "Dr. Ayşe Kaya (Hakem)" },
  { key: "contestant", userId: ID.users.contestantOne, label: "Zeynep Şahin (Yarışmacı)" },
];
for (const session of sessions) {
  session.token = `demo-token-${session.key}`;
  statements.push(`INSERT INTO session (id, expires_at, token, created_at, updated_at, user_id)
    VALUES (${sql(`demo-session-${session.key}`)}, ${now + 30 * DAY}, ${sql(session.token)}, ${now}, ${now}, ${sql(session.userId)});`);
}

statements.push(`INSERT INTO competition (id, name, slug, description) VALUES
  (${sql(ID.competition)}, 'TEKNOFEST 2026 Yapay Zekâ Yarışması', 'teknofest-2026-yapay-zeka', 'Sentetik demo yarışması — gerçek başvuru içermez.');`);

statements.push(`INSERT INTO competition_member (id, competition_id, user_id, role) VALUES
  ('demo-member-mgr', ${sql(ID.competition)}, ${sql(ID.users.manager)}, 'COMPETITION_MANAGER'),
  ('demo-member-eval', ${sql(ID.competition)}, ${sql(ID.users.evaluationManager)}, 'EVALUATION_MANAGER'),
  ('demo-member-r1', ${sql(ID.competition)}, ${sql(ID.users.reviewerOne)}, 'REVIEWER'),
  ('demo-member-r2', ${sql(ID.competition)}, ${sql(ID.users.reviewerTwo)}, 'REVIEWER'),
  ('demo-member-c1', ${sql(ID.competition)}, ${sql(ID.users.contestantOne)}, 'CONTESTANT'),
  ('demo-member-c2', ${sql(ID.competition)}, ${sql(ID.users.contestantTwo)}, 'CONTESTANT');`);

statements.push(`INSERT INTO category (id, competition_id, name, code, description, guidance) VALUES
  (${sql(ID.categoryAgri)}, ${sql(ID.competition)}, 'Tarım ve Çevre Teknolojileri', 'tarim-cevre', 'Tarımsal üretim, su yönetimi ve çevre sorunlarına yapay zekâ destekli çözümler.', 'Saha koşullarında uygulanabilirlik ve ölçülebilir kaynak tasarrufu beklenir.'),
  (${sql(ID.categoryHealth)}, ${sql(ID.competition)}, 'Sağlık ve İyi Yaşam', 'saglik', 'Sağlık hizmetlerine erişimi ve yaşam kalitesini artıran yapay zekâ destekli çözümler.', 'Etik ve gizlilik yaklaşımının açıklanması beklenir.'),
  (${sql(ID.categoryEdu)}, ${sql(ID.competition)}, 'Eğitim Teknolojileri', 'egitim', 'Öğrenme süreçlerini kişiselleştiren ve erişilebilir kılan çözümler.', 'Pedagojik gerekçe ve ölçme yaklaşımı beklenir.');`);

statements.push(`INSERT INTO template_version (
    id, competition_id, version_number, label, status, structural_profile,
    storage_key, sha256, original_filename, mime_type, size_bytes, file_uploaded_at
  ) VALUES (
    ${sql(ID.template)}, ${sql(ID.competition)}, 1, 'v1', 'ACTIVE', ${sql(STRUCTURAL_PROFILE)},
    ${sql(templateStorageKey)}, ${sql(templateSha)}, 'resmi-rapor-formati.pdf', 'application/pdf', ${templatePdf.byteLength}, ${now - 20 * DAY}
  );`);

statements.push(`INSERT INTO rubric_version (id, competition_id, version_number, label, status) VALUES
  (${sql(ID.rubric)}, ${sql(ID.competition)}, 1, 'Değerlendirme Rubriği v1', 'ACTIVE');`);

statements.push(`INSERT INTO criterion (
    id, rubric_version_id, code, title, description, evidence_expectation, max_score,
    weight_basis_points, sort_order
  ) VALUES ${CRITERIA.map(
    (criterion) =>
      `(${sql(criterion.id)}, ${sql(ID.rubric)}, ${sql(criterion.code)}, ${sql(criterion.title)}, ${sql(criterion.description)}, ${sql(criterion.evidenceExpectation)}, ${criterion.maxScore}, ${criterion.weightBasisPoints}, ${criterion.order})`,
  ).join(",\n  ")};`);

statements.push(`INSERT INTO submission (id, competition_id, category_id, application_code, project_title, created_at) VALUES
  ${Object.values(PROJECTS)
    .map(
      (project, index) =>
        `(${sql(project.id)}, ${sql(ID.competition)}, ${sql(project.categoryId)}, ${sql(project.code)}, ${sql(project.title)}, ${now - (10 - index) * DAY})`,
    )
    .join(",\n  ")};`);

statements.push(`INSERT INTO submission_file (
    id, submission_id, storage_key, original_filename, mime_type, size_bytes, sha256
  ) VALUES
  ${Object.values(PROJECTS)
    .map(
      (project) =>
        `(${sql(project.fileId)}, ${sql(project.id)}, ${sql(storageKeyBySubmission.get(project.id))}, 'rapor.pdf', 'application/pdf', ${pdfBySubmission.get(project.id).byteLength}, ${sql(shaBySubmission.get(project.id))})`,
    )
    .join(",\n  ")};`);

function insertRun(project, options) {
  const succeeded = options.status === "SUCCEEDED";
  return `INSERT INTO analysis_run (
    id, submission_id, category_id, template_version_id, rubric_version_id, source_sha256,
    status, stage, workflow_instance_id, document_artifact_key, page_count, character_count,
    extraction_warnings, error_code, error_message, created_at, started_at, completed_at
  ) VALUES (
    ${sql(project.runId)}, ${sql(project.id)}, ${sql(project.categoryId)}, ${sql(ID.template)}, ${sql(ID.rubric)}, ${sql(shaBySubmission.get(project.id))},
    ${sql(options.status)}, ${sql(options.stage)}, ${sql(project.runId)},
    ${succeeded ? sql(`analysis-runs/${project.runId}/document-extraction.json`) : "NULL"},
    ${succeeded ? 8 : "NULL"}, ${succeeded ? 5400 : "NULL"}, '[]',
    ${sql(options.errorCode ?? null)}, ${sql(options.errorMessage ?? null)},
    ${now - 2 * DAY}, ${now - 2 * DAY}, ${now - 2 * DAY + 300_000}
  );`;
}

// S1 — clean pass everywhere.
statements.push(insertRun(PROJECTS.s1, { status: "SUCCEEDED", stage: "RUBRIC_EVALUATION" }));
statements.push(
  check(
    PROJECTS.s1.runId,
    "LANGUAGE",
    "PASS",
    "Rapor dili beklenen dille (Türkçe) uyumlu.",
    languageDetails(),
    1,
  ),
  check(
    PROJECTS.s1.runId,
    "TEMPLATE_STRUCTURE",
    "PASS",
    "Rapor, resmî formatın zorunlu bölümlerini eksiksiz izliyor.",
    templateStructureDetails(),
    2,
  ),
  check(
    PROJECTS.s1.runId,
    "SECTION_PRESENCE",
    "PASS",
    "Beklenen 5 bölümün tamamı raporda bulundu.",
    sectionPresenceDetails(),
    3,
  ),
  check(
    PROJECTS.s1.runId,
    "SECTION_CONTENT",
    "PASS",
    "Zorunlu bölümlerin içeriği beklentileri karşılıyor.",
    sectionContentDetails(),
    4,
  ),
  check(
    PROJECTS.s1.runId,
    "CATEGORY_FIT",
    "PASS",
    "Proje, Tarım ve Çevre Teknolojileri kategorisiyle uyumlu.",
    categoryFitDetails(),
    5,
  ),
  check(
    PROJECTS.s1.runId,
    "SIMILARITY",
    "PASS",
    "Yarışma içi karşılaştırmada dikkat çeken benzerlik bulunmadı.",
    similarityDetails("LOW", []),
    6,
  ),
  check(
    PROJECTS.s1.runId,
    "RUBRIC_EVALUATION",
    "PASS",
    "AI rubrik önerisi hazırlandı: 39 / 50.",
    rubricDetails({
      ozgunluk: {
        score: 8,
        strength: "HIGH",
        reason:
          "Nem sensörü ve hava tahmini birleşimi bölgesel ölçekte özgün bir yaklaşım sunuyor.",
        evidence: [
          {
            page: 1,
            excerpt:
              "Toprak nemi ve hava tahmini verilerini birleştirerek sulama planı öneren düşük maliyetli bir karar destek sistemi.",
            verified: true,
          },
        ],
      },
      teknik: {
        score: 16,
        strength: "HIGH",
        reason:
          "Veri toplama, model eğitimi ve doğrulama adımları ayrık ve tekrarlanabilir biçimde tanımlanmış.",
        evidence: [
          {
            page: 3,
            excerpt:
              "LoRa tabanlı nem sensörleri ile toplanan veriler, hava tahmini API'siyle birleştirilip zaman serisi modeliyle işlenmiştir.",
            verified: true,
          },
        ],
        missing: ["Model karşılaştırması tek mimariyle sınırlı."],
      },
      uygulanabilirlik: {
        score: 7,
        strength: "MEDIUM",
        reason: "Kurulum planı somut; maliyet analizi özet düzeyde kalmış.",
        evidence: [
          {
            page: 5,
            excerpt:
              "Donanım maliyeti dekar başına düşüktür; kurulum yerel kooperatif eliyle yapılabilir.",
            verified: true,
          },
        ],
        missing: ["Bakım ve kalibrasyon maliyeti ele alınmamış."],
      },
      etki: {
        score: 8,
        strength: "HIGH",
        reason: "Pilot sonuçları ölçülebilir su tasarrufu gösteriyor.",
        evidence: [
          {
            page: 7,
            excerpt: "Pilot alanlarda su tüketimi %18 azalmış, verim korunmuştur.",
            verified: true,
          },
        ],
      },
      feedbackSummary:
        "Rapor, yöntem ve pilot doğrulaması açısından güçlü. Uygulanabilirlik bölümündeki maliyet analizi derinleştirilebilir.",
    }),
    7,
  ),
);

// S2 — high similarity vs S5 + category fit REVIEW.
statements.push(insertRun(PROJECTS.s2, { status: "SUCCEEDED", stage: "RUBRIC_EVALUATION" }));
statements.push(
  check(
    PROJECTS.s2.runId,
    "LANGUAGE",
    "PASS",
    "Rapor dili beklenen dille (Türkçe) uyumlu.",
    languageDetails(),
    1,
  ),
  check(
    PROJECTS.s2.runId,
    "TEMPLATE_STRUCTURE",
    "PASS",
    "Rapor, resmî formatın zorunlu bölümlerini eksiksiz izliyor.",
    templateStructureDetails(),
    2,
  ),
  check(
    PROJECTS.s2.runId,
    "SECTION_PRESENCE",
    "PASS",
    "Beklenen 5 bölümün tamamı raporda bulundu.",
    sectionPresenceDetails(),
    3,
  ),
  check(
    PROJECTS.s2.runId,
    "SECTION_CONTENT",
    "PASS",
    "Zorunlu bölümlerin içeriği beklentileri karşılıyor.",
    sectionContentDetails(),
    4,
  ),
  check(
    PROJECTS.s2.runId,
    "CATEGORY_FIT",
    "WARN",
    "Kategori uyumu hakem tarafından değerlendirilmeli.",
    categoryFitDetails({
      assessment: "REVIEW",
      reason:
        "Proje ağırlıklı olarak otomasyon/kontrol sistemine odaklanıyor; tarımsal yapay zekâ bileşeninin payı hakem tarafından değerlendirilmeli.",
      evidenceStrength: "MEDIUM",
      excerpt: "Kural tabanlı ve öğrenmeli karma bir denetleyici ile aktüatörler yönetilmektedir.",
      evidencePage: 3,
      alignmentSignals: ["Sera üretimi tarım kapsamında."],
      mismatchSignals: ["Yapay zekâ bileşeni raporda sınırlı yer tutuyor."],
    }),
    5,
  ),
  check(
    PROJECTS.s2.runId,
    "SIMILARITY",
    "WARN",
    "DEMO-005 ile yüksek benzerlik sinyali: hakem incelemesi önerilir.",
    similarityDetails("HIGH", [
      {
        otherSubmissionId: PROJECTS.s5.id,
        otherAnalysisRunId: PROJECTS.s5.runId,
        applicationCode: PROJECTS.s5.code,
        projectTitle: PROJECTS.s5.title,
        exactDocumentMatch: false,
        combinedScore: 0.82,
        lexicalScore: 0.82,
        semanticScore: null,
        sectionMatches: similaritySectionMatches(PROJECTS.s2.id, PROJECTS.s5.id),
      },
    ]),
    6,
  ),
  check(
    PROJECTS.s2.runId,
    "RUBRIC_EVALUATION",
    "PASS",
    "AI rubrik önerisi hazırlandı: 29 / 50.",
    rubricDetails({
      ozgunluk: {
        score: 6,
        strength: "MEDIUM",
        reason: "Yaklaşım bilinen sera otomasyonu çözümlerine yakın; ayrışan yön sınırlı.",
        evidence: [
          {
            page: 1,
            excerpt:
              "Sera içi sıcaklık, nem ve ışık verilerini izleyip havalandırma ve sulamayı otomatik yöneten bir kontrol sistemi.",
            verified: true,
          },
        ],
        missing: ["Mevcut ticari çözümlerden farklılaşma açıklanmamış."],
      },
      teknik: {
        score: 12,
        strength: "MEDIUM",
        reason: "Denetleyici mimarisi tanımlı ancak doğrulama tek seralık gözlemle sınırlı.",
        evidence: [
          {
            page: 3,
            excerpt:
              "Sensör ağı verileri bulut üzerinde toplanmakta, kural tabanlı ve öğrenmeli karma bir denetleyici ile aktüatörler yönetilmektedir.",
            verified: true,
          },
        ],
      },
      uygulanabilirlik: {
        score: 5,
        strength: "LOW",
        reason: "Entegrasyon iddiası var ancak kurulum ve maliyet ayrıntısı zayıf.",
        evidence: [
          {
            page: 5,
            excerpt: "Mevcut sera otomasyon panolarına ek modülle entegre edilebilir.",
            verified: true,
          },
        ],
        missing: ["Maliyet kalemleri sunulmamış."],
      },
      etki: {
        score: 6,
        strength: "MEDIUM",
        reason: "Sıcaklık sapması iyileşmesi ölçülmüş ancak ekonomik etki hesaplanmamış.",
        evidence: [{ page: 7, excerpt: "Sıcaklık sapmaları %40 azaltılmıştır.", verified: true }],
      },
      feedbackSummary:
        "Teknik kurgu makul ancak özgünlük ve uygulanabilirlik kanıtları sınırlı. Benzerlik sinyali hakem tarafından incelenmeli.",
    }),
    7,
  ),
);

// S3 — weak evidence in two required sections.
statements.push(insertRun(PROJECTS.s3, { status: "SUCCEEDED", stage: "RUBRIC_EVALUATION" }));
statements.push(
  check(
    PROJECTS.s3.runId,
    "LANGUAGE",
    "PASS",
    "Rapor dili beklenen dille (Türkçe) uyumlu.",
    languageDetails(),
    1,
  ),
  check(
    PROJECTS.s3.runId,
    "TEMPLATE_STRUCTURE",
    "PASS",
    "Rapor, resmî formatın zorunlu bölümlerini eksiksiz izliyor.",
    templateStructureDetails(),
    2,
  ),
  check(
    PROJECTS.s3.runId,
    "SECTION_PRESENCE",
    "PASS",
    "Beklenen 5 bölümün tamamı raporda bulundu.",
    sectionPresenceDetails(),
    3,
  ),
  check(
    PROJECTS.s3.runId,
    "SECTION_CONTENT",
    "WARN",
    "2 zorunlu bölümde içerik kanıtı zayıf bulundu.",
    sectionContentDetails({
      yontem: {
        assessment: "PARTIAL",
        reason: "Yöntem bölümü genel ifadelerle sınırlı; model ve doğrulama ayrıntısı eksik.",
        evidenceStrength: "LOW",
        excerpt:
          "Uygulama içi hatırlatıcılar ve ölçüm girişleri basit kural motoruyla izlenmektedir.",
        missingExpectations: [
          "Model/algoritma seçimi gerekçelendirilmemiş.",
          "Doğrulama ölçütleri tanımlanmamış.",
        ],
      },
      sonuc: {
        assessment: "PARTIAL",
        reason: "Sonuç bölümü nicel bulgu içermiyor.",
        evidenceStrength: "LOW",
        excerpt: "Kullanılabilirlik puanı hedefin üzerinde çıkmıştır.",
        missingExpectations: ["Ölçüm sonuçları sayısal olarak raporlanmamış."],
      },
    }),
    4,
  ),
  check(
    PROJECTS.s3.runId,
    "CATEGORY_FIT",
    "PASS",
    "Proje, Sağlık ve İyi Yaşam kategorisiyle uyumlu.",
    categoryFitDetails({
      reason: "Kronik hasta takibi kategori kapsamındaki ihtiyaçla doğrudan örtüşüyor.",
    }),
    5,
  ),
  check(
    PROJECTS.s3.runId,
    "SIMILARITY",
    "PASS",
    "Yarışma içi karşılaştırmada dikkat çeken benzerlik bulunmadı.",
    similarityDetails("LOW", []),
    6,
  ),
  check(
    PROJECTS.s3.runId,
    "RUBRIC_EVALUATION",
    "PASS",
    "AI rubrik önerisi hazırlandı: 27 / 50.",
    rubricDetails({
      ozgunluk: {
        score: 6,
        strength: "MEDIUM",
        reason: "Yakın çevre bildirimi yaklaşımı kısmen ayrışıyor.",
        evidence: [
          {
            page: 1,
            excerpt:
              "Kronik hastaların ilaç ve ölçüm takibini kolaylaştıran, yakınlarına kontrollü bildirim gönderen bir mobil uygulama.",
            verified: true,
          },
        ],
      },
      teknik: {
        score: 11,
        strength: "LOW",
        reason: "Kural motoru tanımı yüzeysel; doğrulama yaklaşımı belirsiz.",
        evidence: [
          {
            page: 3,
            excerpt:
              "Uygulama içi hatırlatıcılar ve ölçüm girişleri basit kural motoruyla izlenmektedir.",
            verified: true,
          },
        ],
        missing: ["Doğrulama ölçütleri eksik.", "Veri gizliliği yaklaşımı ayrıntısız."],
      },
      uygulanabilirlik: {
        score: 5,
        strength: "LOW",
        reason: "Dağıtım kanalı belirtilmiş ancak sürdürme planı yok.",
        evidence: [
          {
            page: 5,
            excerpt: "Uygulama mevcut mağazalar üzerinden dağıtılabilir.",
            verified: true,
          },
        ],
      },
      etki: {
        score: 5,
        strength: "MEDIUM",
        reason: "Hedef kitle net; etki ölçümü sınırlı.",
        evidence: [
          {
            page: 7,
            excerpt: "Kullanılabilirlik puanı hedefin üzerinde çıkmıştır.",
            verified: true,
          },
        ],
        missing: ["Klinik/etik değerlendirme planı yok."],
      },
      feedbackSummary:
        "Problem seçimi anlamlı ancak yöntem ve sonuç bölümlerindeki kanıt zayıf. Hakem incelemesinde bu bölümlere odaklanılması önerilir.",
    }),
    7,
  ),
);

// S4 — analysis mechanically failed.
statements.push(
  insertRun(PROJECTS.s4, {
    status: "FAILED",
    stage: "INGEST_AND_EXTRACT",
    errorCode: "PDF_PARSE_FAILED",
    errorMessage: "PDF metni çıkarılamadı (sentetik demo hatası).",
  }),
);

// S5 — high similarity counterpart, draft evaluation in progress.
statements.push(insertRun(PROJECTS.s5, { status: "SUCCEEDED", stage: "RUBRIC_EVALUATION" }));
statements.push(
  check(
    PROJECTS.s5.runId,
    "LANGUAGE",
    "PASS",
    "Rapor dili beklenen dille (Türkçe) uyumlu.",
    languageDetails(),
    1,
  ),
  check(
    PROJECTS.s5.runId,
    "TEMPLATE_STRUCTURE",
    "PASS",
    "Rapor, resmî formatın zorunlu bölümlerini eksiksiz izliyor.",
    templateStructureDetails(),
    2,
  ),
  check(
    PROJECTS.s5.runId,
    "SECTION_PRESENCE",
    "PASS",
    "Beklenen 5 bölümün tamamı raporda bulundu.",
    sectionPresenceDetails(),
    3,
  ),
  check(
    PROJECTS.s5.runId,
    "SECTION_CONTENT",
    "PASS",
    "Zorunlu bölümlerin içeriği beklentileri karşılıyor.",
    sectionContentDetails(),
    4,
  ),
  check(
    PROJECTS.s5.runId,
    "CATEGORY_FIT",
    "PASS",
    "Proje, Tarım ve Çevre Teknolojileri kategorisiyle uyumlu.",
    categoryFitDetails({ reason: "Sera yönetimi tarımsal üretim kapsamıyla örtüşüyor." }),
    5,
  ),
  check(
    PROJECTS.s5.runId,
    "SIMILARITY",
    "WARN",
    "DEMO-002 ile yüksek benzerlik sinyali: hakem incelemesi önerilir.",
    similarityDetails("HIGH", [
      {
        otherSubmissionId: PROJECTS.s2.id,
        otherAnalysisRunId: PROJECTS.s2.runId,
        applicationCode: PROJECTS.s2.code,
        projectTitle: PROJECTS.s2.title,
        exactDocumentMatch: false,
        combinedScore: 0.82,
        lexicalScore: 0.82,
        semanticScore: null,
        sectionMatches: similaritySectionMatches(PROJECTS.s5.id, PROJECTS.s2.id),
      },
    ]),
    6,
  ),
  check(
    PROJECTS.s5.runId,
    "RUBRIC_EVALUATION",
    "PASS",
    "AI rubrik önerisi hazırlandı: 26 / 50.",
    rubricDetails({
      ozgunluk: {
        score: 5,
        strength: "LOW",
        reason: "İçerik DEMO-002 ile büyük ölçüde örtüşüyor; ayrışan katkı sınırlı.",
        evidence: [
          {
            page: 1,
            excerpt:
              "Sera içi sıcaklık, nem ve ışık verilerini izleyip havalandırma ve sulamayı otomatik yöneten bir yönetim paneli.",
            verified: true,
          },
        ],
        missing: ["Özgün katkı açıkça tanımlanmamış."],
      },
      teknik: {
        score: 11,
        strength: "MEDIUM",
        reason: "Mimari tanımlı ancak gözlem süresi kısa.",
        evidence: [
          {
            page: 3,
            excerpt:
              "Sensör ağı verileri bulut üzerinde toplanmakta, kural tabanlı ve öğrenmeli karma bir denetleyici ile aktüatörler yönetilmektedir.",
            verified: true,
          },
        ],
      },
      uygulanabilirlik: {
        score: 5,
        strength: "MEDIUM",
        reason: "Entegrasyon planı var; maliyet ayrıntısı yok.",
        evidence: [
          {
            page: 5,
            excerpt: "Mevcut sera otomasyon panolarına ek modülle entegre edilebilir.",
            verified: true,
          },
        ],
      },
      etki: {
        score: 5,
        strength: "LOW",
        reason: "Etki iddiası nicel veriyle desteklenmemiş.",
        evidence: [
          {
            page: 7,
            excerpt: "Sıcaklık sapmaları belirgin biçimde azaltılmıştır.",
            verified: true,
          },
        ],
        missing: ["Sayısal etki ölçümü yok."],
      },
      feedbackSummary:
        "Rapor DEMO-002 ile yüksek benzerlik gösteriyor; hakem benzerlik kanıtlarını inceleyip özgün katkıyı ayrıştırmalı.",
    }),
    7,
  ),
);

// Similarity pair observation (canonical order: demo-sub-002 < demo-sub-005).
statements.push(`INSERT INTO similarity_pair (
    id, competition_id, submission_a_id, submission_b_id, analysis_run_a_id, analysis_run_b_id,
    lexical_score, semantic_score, combined_score, mode, level, exact_document_match, evidence_json,
    created_at, updated_at
  ) VALUES (
    'demo-simpair-1', ${sql(ID.competition)}, ${sql(PROJECTS.s2.id)}, ${sql(PROJECTS.s5.id)},
    ${sql(PROJECTS.s2.runId)}, ${sql(PROJECTS.s5.runId)},
    0.82, NULL, 0.82, 'LEXICAL_ONLY', 'HIGH', 0,
    ${sql(JSON.stringify(similaritySectionMatches(PROJECTS.s2.id, PROJECTS.s5.id)))},
    ${now - 2 * DAY}, ${now - 2 * DAY}
  );`);

// Rubric suggestion rows mirror the RUBRIC_EVALUATION check details.
function insertSuggestions(runId, prefix, scores) {
  return `INSERT INTO rubric_suggestion (
    id, analysis_run_id, rubric_version_id, criterion_id, suggested_score, reason,
    evidence_strength, evidence_json, missing_points_json, created_at, updated_at
  ) VALUES ${CRITERIA.map((criterion) => {
    const entry = scores[criterion.code];
    return `(${sql(`${prefix}-${criterion.code}`)}, ${sql(runId)}, ${sql(ID.rubric)}, ${sql(criterion.id)}, ${entry.score}, ${sql(entry.reason)}, ${sql(entry.strength)}, ${sql(JSON.stringify(entry.evidence ?? []))}, ${sql(JSON.stringify(entry.missing ?? []))}, ${now - 2 * DAY}, ${now - 2 * DAY})`;
  }).join(",\n  ")};`;
}

const suggestionScores = {
  [PROJECTS.s1.runId]: {
    ozgunluk: {
      score: 8,
      strength: "HIGH",
      reason: "Nem sensörü ve hava tahmini birleşimi bölgesel ölçekte özgün bir yaklaşım sunuyor.",
      evidence: [
        {
          page: 1,
          excerpt:
            "Toprak nemi ve hava tahmini verilerini birleştirerek sulama planı öneren düşük maliyetli bir karar destek sistemi.",
          verified: true,
        },
      ],
    },
    teknik: {
      score: 16,
      strength: "HIGH",
      reason:
        "Veri toplama, model eğitimi ve doğrulama adımları ayrık ve tekrarlanabilir biçimde tanımlanmış.",
      evidence: [
        {
          page: 3,
          excerpt:
            "LoRa tabanlı nem sensörleri ile toplanan veriler, hava tahmini API'siyle birleştirilip zaman serisi modeliyle işlenmiştir.",
          verified: true,
        },
      ],
      missing: ["Model karşılaştırması tek mimariyle sınırlı."],
    },
    uygulanabilirlik: {
      score: 7,
      strength: "MEDIUM",
      reason: "Kurulum planı somut; maliyet analizi özet düzeyde kalmış.",
      evidence: [
        {
          page: 5,
          excerpt:
            "Donanım maliyeti dekar başına düşüktür; kurulum yerel kooperatif eliyle yapılabilir.",
          verified: true,
        },
      ],
      missing: ["Bakım ve kalibrasyon maliyeti ele alınmamış."],
    },
    etki: {
      score: 8,
      strength: "HIGH",
      reason: "Pilot sonuçları ölçülebilir su tasarrufu gösteriyor.",
      evidence: [
        {
          page: 7,
          excerpt: "Pilot alanlarda su tüketimi %18 azalmış, verim korunmuştur.",
          verified: true,
        },
      ],
    },
  },
  [PROJECTS.s2.runId]: {
    ozgunluk: {
      score: 6,
      strength: "MEDIUM",
      reason: "Yaklaşım bilinen sera otomasyonu çözümlerine yakın; ayrışan yön sınırlı.",
      evidence: [],
      missing: ["Mevcut ticari çözümlerden farklılaşma açıklanmamış."],
    },
    teknik: {
      score: 12,
      strength: "MEDIUM",
      reason: "Denetleyici mimarisi tanımlı ancak doğrulama tek seralık gözlemle sınırlı.",
      evidence: [
        {
          page: 3,
          excerpt:
            "Sensör ağı verileri bulut üzerinde toplanmakta, kural tabanlı ve öğrenmeli karma bir denetleyici ile aktüatörler yönetilmektedir.",
          verified: true,
        },
      ],
    },
    uygulanabilirlik: {
      score: 5,
      strength: "LOW",
      reason: "Entegrasyon iddiası var ancak kurulum ve maliyet ayrıntısı zayıf.",
      evidence: [],
      missing: ["Maliyet kalemleri sunulmamış."],
    },
    etki: {
      score: 6,
      strength: "MEDIUM",
      reason: "Sıcaklık sapması iyileşmesi ölçülmüş ancak ekonomik etki hesaplanmamış.",
      evidence: [{ page: 7, excerpt: "Sıcaklık sapmaları %40 azaltılmıştır.", verified: true }],
    },
  },
  [PROJECTS.s3.runId]: {
    ozgunluk: {
      score: 6,
      strength: "MEDIUM",
      reason: "Yakın çevre bildirimi yaklaşımı kısmen ayrışıyor.",
      evidence: [],
    },
    teknik: {
      score: 11,
      strength: "LOW",
      reason: "Kural motoru tanımı yüzeysel; doğrulama yaklaşımı belirsiz.",
      evidence: [],
      missing: ["Doğrulama ölçütleri eksik.", "Veri gizliliği yaklaşımı ayrıntısız."],
    },
    uygulanabilirlik: {
      score: 5,
      strength: "LOW",
      reason: "Dağıtım kanalı belirtilmiş ancak sürdürme planı yok.",
      evidence: [],
    },
    etki: {
      score: 5,
      strength: "MEDIUM",
      reason: "Hedef kitle net; etki ölçümü sınırlı.",
      evidence: [],
      missing: ["Klinik/etik değerlendirme planı yok."],
    },
  },
  [PROJECTS.s5.runId]: {
    ozgunluk: {
      score: 5,
      strength: "LOW",
      reason: "İçerik DEMO-002 ile büyük ölçüde örtüşüyor; ayrışan katkı sınırlı.",
      evidence: [],
      missing: ["Özgün katkı açıkça tanımlanmamış."],
    },
    teknik: {
      score: 11,
      strength: "MEDIUM",
      reason: "Mimari tanımlı ancak gözlem süresi kısa.",
      evidence: [
        {
          page: 3,
          excerpt:
            "Sensör ağı verileri bulut üzerinde toplanmakta, kural tabanlı ve öğrenmeli karma bir denetleyici ile aktüatörler yönetilmektedir.",
          verified: true,
        },
      ],
    },
    uygulanabilirlik: {
      score: 5,
      strength: "MEDIUM",
      reason: "Entegrasyon planı var; maliyet ayrıntısı yok.",
      evidence: [],
    },
    etki: {
      score: 5,
      strength: "LOW",
      reason: "Etki iddiası nicel veriyle desteklenmemiş.",
      evidence: [],
      missing: ["Sayısal etki ölçümü yok."],
    },
  },
};
statements.push(
  insertSuggestions(PROJECTS.s1.runId, "demo-sug-001", suggestionScores[PROJECTS.s1.runId]),
);
statements.push(
  insertSuggestions(PROJECTS.s2.runId, "demo-sug-002", suggestionScores[PROJECTS.s2.runId]),
);
statements.push(
  insertSuggestions(PROJECTS.s3.runId, "demo-sug-003", suggestionScores[PROJECTS.s3.runId]),
);
statements.push(
  insertSuggestions(PROJECTS.s5.runId, "demo-sug-005", suggestionScores[PROJECTS.s5.runId]),
);

// Reviewer assignments.
statements.push(`INSERT INTO reviewer_assignment (id, competition_id, submission_id, reviewer_user_id, assigned_by_user_id, created_at) VALUES
  ('demo-assign-1', ${sql(ID.competition)}, ${sql(PROJECTS.s1.id)}, ${sql(ID.users.reviewerOne)}, ${sql(ID.users.manager)}, ${now - 2 * DAY}),
  ('demo-assign-2', ${sql(ID.competition)}, ${sql(PROJECTS.s2.id)}, ${sql(ID.users.reviewerOne)}, ${sql(ID.users.evaluationManager)}, ${now - DAY}),
  ('demo-assign-3', ${sql(ID.competition)}, ${sql(PROJECTS.s2.id)}, ${sql(ID.users.reviewerTwo)}, ${sql(ID.users.evaluationManager)}, ${now - DAY}),
  ('demo-assign-4', ${sql(ID.competition)}, ${sql(PROJECTS.s5.id)}, ${sql(ID.users.reviewerOne)}, ${sql(ID.users.evaluationManager)}, ${now - DAY});`);

// SUBMITTED evaluation for S1 (reviewer one), agreeing/disagreeing with AI per criterion.
statements.push(`INSERT INTO reviewer_evaluation (
    id, assignment_id, submission_id, analysis_run_id, rubric_version_id, status, overall_note,
    created_at, updated_at, submitted_at
  ) VALUES (
    'demo-eval-1', 'demo-assign-1', ${sql(PROJECTS.s1.id)}, ${sql(PROJECTS.s1.runId)}, ${sql(ID.rubric)},
    'SUBMITTED', 'Güçlü bir çalışma; saha doğrulaması genişletilerek finale taşınabilir.',
    ${now - DAY}, ${now - DAY + 3_600_000}, ${now - DAY + 3_600_000}
  );`);
statements.push(`INSERT INTO reviewer_criterion_score (id, reviewer_evaluation_id, rubric_version_id, criterion_id, score, note) VALUES
  ('demo-score-1-oz', 'demo-eval-1', ${sql(ID.rubric)}, ${sql(ID.criterionOriginality)}, 9, 'Bölgesel bağlama uyarlama AI önerisinden daha güçlü bulundu.'),
  ('demo-score-1-tk', 'demo-eval-1', ${sql(ID.rubric)}, ${sql(ID.criterionTechnical)}, 16, NULL),
  ('demo-score-1-uy', 'demo-eval-1', ${sql(ID.rubric)}, ${sql(ID.criterionFeasibility)}, 8, 'Kooperatif iş birliği maliyet riskini azaltıyor.'),
  ('demo-score-1-et', 'demo-eval-1', ${sql(ID.rubric)}, ${sql(ID.criterionImpact)}, 8, NULL);`);

// DRAFT evaluation for S5 (reviewer one), partially scored.
statements.push(`INSERT INTO reviewer_evaluation (
    id, assignment_id, submission_id, analysis_run_id, rubric_version_id, status, overall_note,
    created_at, updated_at, submitted_at
  ) VALUES (
    'demo-eval-2', 'demo-assign-4', ${sql(PROJECTS.s5.id)}, ${sql(PROJECTS.s5.runId)}, ${sql(ID.rubric)},
    'DRAFT', NULL, ${now - 6 * 3_600_000}, ${now - 3 * 3_600_000}, NULL
  );`);
statements.push(`INSERT INTO reviewer_criterion_score (id, reviewer_evaluation_id, rubric_version_id, criterion_id, score, note) VALUES
  ('demo-score-2-oz', 'demo-eval-2', ${sql(ID.rubric)}, ${sql(ID.criterionOriginality)}, 5, 'Benzerlik kanıtları incelendi; özgün katkı sınırlı.'),
  ('demo-score-2-tk', 'demo-eval-2', ${sql(ID.rubric)}, ${sql(ID.criterionTechnical)}, 12, NULL);`);

// Published feedback for S1; S3 stays unpublished on purpose.
statements.push(`INSERT INTO contestant_feedback (
    id, competition_id, submission_id, source_reviewer_evaluation_id, status, summary,
    strengths_json, improvements_json, recommendations_json, created_by_user_id,
    published_by_user_id, created_at, updated_at, published_at
  ) VALUES (
    'demo-feedback-1', ${sql(ID.competition)}, ${sql(PROJECTS.s1.id)}, 'demo-eval-1', 'PUBLISHED',
    'Projeniz yöntem kurgusu ve pilot doğrulaması açısından güçlü bulundu. Değerlendirme, hakem incelemesi sonucunda tamamlanmıştır.',
    ${sql(JSON.stringify(["Yöntem adımları tekrarlanabilir biçimde tanımlanmış.", "Pilot çalışma ölçülebilir su tasarrufu gösteriyor.", "Bölgesel koşullara uyarlama özgün bulundu."]))},
    ${sql(JSON.stringify(["Maliyet analizi bakım ve kalibrasyon kalemlerini içerecek şekilde derinleştirilmeli.", "Model karşılaştırması birden fazla mimariyle genişletilebilir."]))},
    ${sql(JSON.stringify(["Pilot kapsamını farklı iklim bölgelerine genişletin.", "Kooperatif iş birliğini yaygınlaştırma planına dönüştürün."]))},
    ${sql(ID.users.evaluationManager)}, ${sql(ID.users.evaluationManager)},
    ${now - 12 * 3_600_000}, ${now - 10 * 3_600_000}, ${now - 10 * 3_600_000}
  );`);

// Submission ownership for contestants.
statements.push(`INSERT INTO submission_participant (id, competition_id, submission_id, user_id) VALUES
  ('demo-part-1', ${sql(ID.competition)}, ${sql(PROJECTS.s1.id)}, ${sql(ID.users.contestantOne)}),
  ('demo-part-2', ${sql(ID.competition)}, ${sql(PROJECTS.s3.id)}, ${sql(ID.users.contestantOne)}),
  ('demo-part-3', ${sql(ID.competition)}, ${sql(PROJECTS.s2.id)}, ${sql(ID.users.contestantTwo)}),
  ('demo-part-4', ${sql(ID.competition)}, ${sql(PROJECTS.s5.id)}, ${sql(ID.users.contestantTwo)});`);

// ---------------------------------------------------------------------------
// Execute: R2 objects first, then the D1 seed, then emit cookies.
// ---------------------------------------------------------------------------

const temporaryDirectory = mkdtempSync(join(webDirectory, ".wrangler", "demo-seed-"));
try {
  const templatePath = join(temporaryDirectory, "template.pdf");
  writeFileSync(templatePath, templatePdf);
  runWrangler([
    "r2",
    "object",
    "put",
    `${bucket}/${templateStorageKey}`,
    "--file",
    templatePath,
    "--content-type",
    "application/pdf",
    "--local",
  ]);
  for (const project of Object.values(PROJECTS)) {
    const pdfPath = join(temporaryDirectory, `${project.id}.pdf`);
    writeFileSync(pdfPath, pdfBySubmission.get(project.id));
    runWrangler([
      "r2",
      "object",
      "put",
      `${bucket}/${storageKeyBySubmission.get(project.id)}`,
      "--file",
      pdfPath,
      "--content-type",
      "application/pdf",
      "--local",
    ]);
  }

  const seedPath = join(temporaryDirectory, "seed.sql");
  writeFileSync(seedPath, statements.join("\n\n"));
  runWrangler([
    "d1",
    "execute",
    "DB",
    "--local",
    "--experimental-provision=false",
    "--experimental-auto-create=false",
    "--file",
    seedPath,
  ]);

  const secret = readDevVariable("BETTER_AUTH_SECRET");
  const cookies = {};
  for (const session of sessions) {
    cookies[session.key] = {
      label: session.label,
      cookie: `better-auth.session_token=${session.token}.${await makeSignature(session.token, secret)}`,
    };
  }
  const cookieDirectory = join(webDirectory, ".wrangler", "tmp");
  mkdirSync(cookieDirectory, { recursive: true });
  const cookiePath = join(cookieDirectory, "p6-5b-demo-cookies.json");
  writeFileSync(cookiePath, JSON.stringify(cookies, null, 2));
  console.log(`P6.5B demo seed complete. Cookies written to ${cookiePath}`);
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
