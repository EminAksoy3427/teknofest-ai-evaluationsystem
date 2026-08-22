import {
  CategoryResponseSchema,
  type CompetitionConfigurationResponse,
  CompetitionConfigurationResponseSchema,
  CompetitionResponseSchema,
  type CriterionInput,
  MAX_TEMPLATE_PDF_BYTES,
  type RubricVersionResponse,
  RubricVersionResponseSchema,
  type TemplateSectionRule,
  type TemplateVersionResponse,
  TemplateVersionResponseSchema,
} from "@teknofest-ai/shared";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { useParams } from "react-router";

import { languageName } from "./analysis-labels";
import { apiDelete, apiRequest, errorMessage } from "./api";
import { Breadcrumb } from "./competition-nav";
import {
  Alert,
  FileDropzone,
  formatFileSize,
  languageSelectOptions,
  PageHeader,
  slugFromName,
} from "./ui";

type Feedback = { kind: "saved" | "error"; message: string } | null;

function FeedbackMessage({ feedback }: { feedback: Feedback }) {
  if (!feedback) return null;
  return (
    <p
      className={feedback.kind === "saved" ? "text-sm text-success-ink" : "text-sm text-critical"}
      role={feedback.kind === "error" ? "alert" : "status"}
    >
      {feedback.message}
    </p>
  );
}

/** Version lifecycle in user language: a person configures, not a database. */
const VERSION_STATUS_LABELS = {
  DRAFT: "Taslak",
  ACTIVE: "Kullanımda",
  RETIRED: "Arşivlendi",
} as const;

function StatusBadge({ status }: { status: TemplateVersionResponse["status"] }) {
  const styles = {
    DRAFT: "status-chip-warn",
    ACTIVE: "status-chip-pass",
    RETIRED: "status-chip-neutral",
  };
  return <span className={`status-chip ${styles[status]}`}>{VERSION_STATUS_LABELS[status]}</span>;
}

function GeneralSection({
  configuration,
  refresh,
}: {
  configuration: CompetitionConfigurationResponse;
  refresh: () => Promise<void>;
}) {
  const competition = configuration.competition;
  const [name, setName] = useState(competition.name);
  const [slug, setSlug] = useState(competition.slug);
  const [description, setDescription] = useState(competition.description);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  useEffect(() => {
    setName(competition.name);
    setSlug(competition.slug);
    setDescription(competition.description);
  }, [competition]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      await apiRequest(`/api/v1/competitions/${competition.id}`, CompetitionResponseSchema, {
        method: "PATCH",
        body: JSON.stringify({ name, slug, description }),
      });
      await refresh();
      setFeedback({ kind: "saved", message: "Yarışma bilgileri kaydedildi." });
    } catch (error) {
      setFeedback({ kind: "error", message: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="general-title" className="setup-panel">
      <h2 className="section-title" id="general-title">
        Yarışma bilgileri
      </h2>
      <p className="mt-1 text-sm leading-6 text-ink-muted">
        Yarışmanın adı ve açıklaması tüm ekiplerin gördüğü ortak kimliktir.
      </p>
      <form className="mt-6 grid gap-5" onSubmit={submit}>
        <div>
          <label className="field-label" htmlFor="setup-name">
            Yarışma adı
          </label>
          <input
            className="field-input"
            id="setup-name"
            maxLength={160}
            onChange={(event) => setName(event.target.value)}
            required
            value={name}
          />
        </div>
        <div>
          <label className="field-label" htmlFor="setup-description">
            Açıklama
          </label>
          <textarea
            className="field-input min-h-28"
            id="setup-description"
            maxLength={2000}
            onChange={(event) => setDescription(event.target.value)}
            value={description}
          />
        </div>
        <details className="rounded-lg border border-line bg-surface-muted px-4 py-3">
          <summary className="cursor-pointer text-sm font-semibold text-ink-muted">
            Gelişmiş: adres kimliği
          </summary>
          <div className="mt-3">
            <label className="field-label" htmlFor="setup-slug">
              Adres kimliği
            </label>
            <input
              className="field-input font-mono"
              id="setup-slug"
              maxLength={80}
              onChange={(event) => setSlug(event.target.value)}
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              required
              value={slug}
            />
            <p className="field-help">
              Yarışmanın teknik adres kimliği. Genellikle değiştirmeniz gerekmez.
            </p>
          </div>
        </details>
        <div className="flex flex-wrap items-center gap-4">
          <button className="primary-button" disabled={saving} type="submit">
            {saving ? "Kaydediliyor…" : "Değişiklikleri kaydet"}
          </button>
          <FeedbackMessage feedback={feedback} />
        </div>
      </form>
    </section>
  );
}

function CategoryEditor({
  category,
  competitionId,
  refresh,
}: {
  category: CompetitionConfigurationResponse["categories"][number];
  competitionId: string;
  refresh: () => Promise<void>;
}) {
  const [values, setValues] = useState(category);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  useEffect(() => setValues(category), [category]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      await apiRequest(
        `/api/v1/competitions/${competitionId}/categories/${category.id}`,
        CategoryResponseSchema,
        {
          method: "PATCH",
          body: JSON.stringify({
            name: values.name,
            code: values.code,
            description: values.description,
            guidance: values.guidance,
            order: values.order,
          }),
        },
      );
      await refresh();
      setFeedback({ kind: "saved", message: "Kategori kaydedildi." });
    } catch (error) {
      setFeedback({ kind: "error", message: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!window.confirm(`“${category.name}” kategorisini silmek istiyor musunuz?`)) return;
    setSaving(true);
    setFeedback(null);
    try {
      await apiDelete(`/api/v1/competitions/${competitionId}/categories/${category.id}`);
      await refresh();
    } catch (error) {
      setFeedback({ kind: "error", message: errorMessage(error) });
      setSaving(false);
    }
  }

  return (
    <form className="rounded-xl border border-line p-5" onSubmit={save}>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="field-label" htmlFor={`category-name-${category.id}`}>
            Kategori adı
          </label>
          <input
            className="field-input"
            id={`category-name-${category.id}`}
            onChange={(event) => setValues({ ...values, name: event.target.value })}
            required
            value={values.name}
          />
        </div>
        <details className="md:col-span-2">
          <summary className="cursor-pointer text-[13px] font-medium text-ink-subtle">
            Kısa kod
          </summary>
          <div className="mt-2">
            <label className="field-label" htmlFor={`category-code-${category.id}`}>
              İç kimlik
            </label>
            <input
              className="field-input font-mono"
              id={`category-code-${category.id}`}
              onChange={(event) => setValues({ ...values, code: event.target.value })}
              required
              value={values.code}
            />
          </div>
        </details>
      </div>
      <div className="mt-4">
        <label className="field-label" htmlFor={`category-description-${category.id}`}>
          Kategori açıklaması
        </label>
        <textarea
          className="field-input min-h-24"
          id={`category-description-${category.id}`}
          onChange={(event) => setValues({ ...values, description: event.target.value })}
          required
          value={values.description}
        />
      </div>
      <div className="mt-4">
        <label className="field-label" htmlFor={`category-guidance-${category.id}`}>
          Neler bu kategoriye girer?
        </label>
        <textarea
          className="field-input min-h-20"
          id={`category-guidance-${category.id}`}
          onChange={(event) => setValues({ ...values, guidance: event.target.value })}
          value={values.guidance}
        />
        <p className="field-help">
          Kapsama giren ve girmeyen proje türlerini kısaca belirtin; kategori uyumu analizi bu
          tanımı kullanır.
        </p>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button className="secondary-button" disabled={saving} type="submit">
          {saving ? "Kaydediliyor…" : "Kaydet"}
        </button>
        <button className="danger-button" disabled={saving} onClick={remove} type="button">
          Sil
        </button>
        <FeedbackMessage feedback={feedback} />
      </div>
    </form>
  );
}

function CategoriesSection({
  configuration,
  refresh,
}: {
  configuration: CompetitionConfigurationResponse;
  refresh: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [guidance, setGuidance] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  async function create(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      await apiRequest(
        `/api/v1/competitions/${configuration.competition.id}/categories`,
        CategoryResponseSchema,
        {
          method: "POST",
          body: JSON.stringify({
            name,
            code,
            description,
            guidance,
            order: configuration.categories.length + 1,
          }),
        },
      );
      setName("");
      setCode("");
      setDescription("");
      setGuidance("");
      await refresh();
      setFeedback({ kind: "saved", message: "Kategori eklendi." });
    } catch (error) {
      setFeedback({ kind: "error", message: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="categories-title" className="setup-panel">
      <div className="panel-heading">
        <div>
          <h2 className="section-title" id="categories-title">
            Kategoriler
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-ink-muted">
            Her başvuru bir kategoriye yüklenir. Açıklama kategorinin ne olduğunu, kapsam tanımı ise
            neyin içeride veya dışarıda sayıldığını belirtir.
          </p>
        </div>
        <span className="metric-chip">{configuration.categories.length} kategori</span>
      </div>

      <div className="mt-6 grid gap-4">
        {configuration.categories.length === 0 ? (
          <div className="empty-state">
            Henüz kategori yok. Başvuru alabilmek için en az bir kategori ekleyin.
          </div>
        ) : (
          configuration.categories.map((category) => (
            <CategoryEditor
              category={category}
              competitionId={configuration.competition.id}
              key={category.id}
              refresh={refresh}
            />
          ))
        )}
      </div>

      <form className="mt-8 rounded-xl bg-surface-muted p-5" onSubmit={create}>
        <h3 className="font-semibold text-ink">Yeni kategori</h3>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <label className="field-label" htmlFor="new-category-name">
              Kategori adı
            </label>
            <input
              className="field-input"
              id="new-category-name"
              onChange={(event) => {
                const next = event.target.value;
                setName(next);
                setCode((current) =>
                  current === "" || current === slugFromName(name) ? slugFromName(next) : current,
                );
              }}
              required
              value={name}
            />
          </div>
          <div>
            <label className="field-label" htmlFor="new-category-code">
              Kısa kod
            </label>
            <input
              className="field-input font-mono text-ink-muted"
              id="new-category-code"
              onChange={(event) => setCode(event.target.value)}
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              required
              value={code}
            />
          </div>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <label className="field-label" htmlFor="new-category-description">
              Kategori açıklaması
            </label>
            <textarea
              className="field-input min-h-24"
              id="new-category-description"
              onChange={(event) => setDescription(event.target.value)}
              required
              value={description}
            />
          </div>
          <div>
            <label className="field-label" htmlFor="new-category-guidance">
              Neler bu kategoriye girer?
            </label>
            <textarea
              className="field-input min-h-24"
              id="new-category-guidance"
              onChange={(event) => setGuidance(event.target.value)}
              value={guidance}
            />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button className="primary-button" disabled={saving} type="submit">
            {saving ? "Ekleniyor…" : "Kategori ekle"}
          </button>
          <FeedbackMessage feedback={feedback} />
        </div>
      </form>
    </section>
  );
}

function reorder<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  const current = next[index];
  const other = next[target];
  if (current === undefined || other === undefined) return items;
  next[index] = other;
  next[target] = current;
  return next;
}

function formatFileSizeMiB(bytes: number): string {
  return formatFileSize(bytes);
}

/**
 * The official report-template PDF. A DRAFT version may upload or replace its file; ACTIVE and
 * RETIRED files are immutable, exactly like the structural profile. "Şablonu görüntüle" streams the
 * file through the protected download endpoint — no R2 key or public URL is ever involved.
 */
function TemplateFileUploader({
  competitionId,
  version,
  editable,
  refresh,
}: {
  competitionId: string;
  version: TemplateVersionResponse;
  editable: boolean;
  refresh: () => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const filePath = `/api/v1/competitions/${competitionId}/templates/${version.id}/file`;

  async function upload() {
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setFeedback({ kind: "error", message: "Yalnız PDF dosyası seçebilirsiniz." });
      return;
    }
    if (file.size === 0 || file.size > MAX_TEMPLATE_PDF_BYTES) {
      setFeedback({ kind: "error", message: "PDF dosyası boş olmamalı ve 20 MiB'ı aşmamalıdır." });
      return;
    }
    setUploading(true);
    setFeedback(null);
    try {
      await apiRequest(
        `${filePath}?filename=${encodeURIComponent(file.name)}`,
        TemplateVersionResponseSchema,
        { method: "PUT", body: file, headers: { "content-type": "application/pdf" } },
      );
      setFile(null);
      await refresh();
      setFeedback({ kind: "saved", message: "Resmî rapor PDF'si kaydedildi." });
    } catch (error) {
      setFeedback({ kind: "error", message: errorMessage(error) });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <h4 className="font-semibold text-ink">Resmî rapor PDF'si</h4>
      <p className="mt-1 text-sm text-ink-muted">
        Yarışmacılara dağıtılan resmî rapor dosyası. Format bu dosya olmadan kullanıma alınamaz.
      </p>
      {version.file ? (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-ink-muted">
          <span className="text-sm font-medium text-ink">{version.file.originalFilename}</span>
          <span className="text-xs text-ink-subtle">
            {formatFileSizeMiB(version.file.sizeBytes)}
          </span>
          <a className="secondary-button" href={filePath} rel="noreferrer" target="_blank">
            PDF'yi görüntüle
          </a>
        </div>
      ) : (
        <p className="mt-3 text-sm font-semibold text-warning-ink">
          Rapor PDF'si henüz yüklenmedi.
        </p>
      )}
      {editable ? (
        <div className="mt-3 grid gap-3">
          <FileDropzone
            file={file}
            id={`template-file-${version.id}`}
            label="Resmî rapor şablonunu yükleyin"
            onFile={setFile}
          />
          <button
            className="secondary-button justify-self-start"
            disabled={!file || uploading}
            onClick={upload}
            type="button"
          >
            {uploading ? "Yükleniyor…" : version.file ? "Değiştir" : "Dosyayı yükle"}
          </button>
        </div>
      ) : null}
      <div className="mt-2">
        <FeedbackMessage feedback={feedback} />
      </div>
    </div>
  );
}

function TemplateDraftEditor({
  competitionId,
  version,
  refresh,
}: {
  competitionId: string;
  version: TemplateVersionResponse;
  refresh: () => Promise<void>;
}) {
  const [label, setLabel] = useState(version.label);
  const [language, setLanguage] = useState(version.structuralProfile.expectedLanguage);
  const [sections, setSections] = useState<TemplateSectionRule[]>(
    version.structuralProfile.sections,
  );
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  useEffect(() => {
    setLabel(version.label);
    setLanguage(version.structuralProfile.expectedLanguage);
    setSections(version.structuralProfile.sections);
    setFeedback(null);
  }, [version]);

  function normalizedSections(values: TemplateSectionRule[]) {
    return values.map((section, index) => ({ ...section, order: index + 1 }));
  }

  function updateSection(index: number, changes: Partial<TemplateSectionRule>) {
    setSections((current) =>
      normalizedSections(
        current.map((section, candidate) =>
          candidate === index ? { ...section, ...changes } : section,
        ),
      ),
    );
  }

  async function save() {
    setSaving(true);
    setFeedback(null);
    try {
      await apiRequest(
        `/api/v1/competitions/${competitionId}/templates/${version.id}`,
        TemplateVersionResponseSchema,
        {
          method: "PATCH",
          body: JSON.stringify({
            label,
            structuralProfile: {
              expectedLanguage: language,
              sections: normalizedSections(sections),
            },
          }),
        },
      );
      await refresh();
      setFeedback({ kind: "saved", message: "Taslak rapor formatı kaydedildi." });
    } catch (error) {
      setFeedback({ kind: "error", message: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  async function activate() {
    setSaving(true);
    setFeedback(null);
    try {
      await apiRequest(
        `/api/v1/competitions/${competitionId}/templates/${version.id}/activate`,
        TemplateVersionResponseSchema,
        { method: "POST" },
      );
      await refresh();
      setFeedback({ kind: "saved", message: "Rapor formatı kullanıma alındı." });
    } catch (error) {
      setFeedback({ kind: "error", message: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-5 rounded-lg border border-line bg-surface p-5">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="field-label" htmlFor={`template-label-${version.id}`}>
            Format adı
          </label>
          <input
            className="field-input"
            id={`template-label-${version.id}`}
            onChange={(event) => setLabel(event.target.value)}
            required
            value={label}
          />
        </div>
        <div>
          <label className="field-label" htmlFor={`template-language-${version.id}`}>
            Beklenen rapor dili
          </label>
          <select
            className="field-input"
            id={`template-language-${version.id}`}
            onChange={(event) => setLanguage(event.target.value)}
            required
            value={language}
          >
            {languageSelectOptions(language).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-5">
        <TemplateFileUploader
          competitionId={competitionId}
          editable
          refresh={refresh}
          version={version}
        />
      </div>

      <div className="mt-6 flex items-center justify-between gap-3">
        <h4 className="font-semibold text-ink">Beklenen bölümler</h4>
        <button
          className="secondary-button"
          onClick={() =>
            setSections((current) => [
              ...current,
              {
                key: `bolum-${current.length + 1}`,
                title: "Yeni bölüm",
                description: "",
                required: false,
                order: current.length + 1,
              },
            ])
          }
          type="button"
        >
          Bölüm ekle
        </button>
      </div>

      {sections.length === 0 ? (
        <div className="empty-state mt-4">
          Kullanıma almak için en az bir zorunlu bölüm ekleyin.
        </div>
      ) : (
        <div className="mt-4 grid gap-4">
          {sections.map((section, index) => (
            <fieldset
              className="rounded-lg border border-line bg-surface p-4"
              key={`${version.id}-${section.key}`}
            >
              <legend className="px-1 text-sm font-semibold text-ink-muted">
                Bölüm {index + 1}
              </legend>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="field-label" htmlFor={`section-key-${version.id}-${index}`}>
                    Kısa kod
                  </label>
                  <input
                    className="field-input font-mono"
                    id={`section-key-${version.id}-${index}`}
                    onChange={(event) => updateSection(index, { key: event.target.value })}
                    required
                    value={section.key}
                  />
                </div>
                <div>
                  <label className="field-label" htmlFor={`section-title-${version.id}-${index}`}>
                    Başlık
                  </label>
                  <input
                    className="field-input"
                    id={`section-title-${version.id}-${index}`}
                    onChange={(event) => updateSection(index, { title: event.target.value })}
                    required
                    value={section.title}
                  />
                </div>
              </div>
              <div className="mt-4">
                <label
                  className="field-label"
                  htmlFor={`section-description-${version.id}-${index}`}
                >
                  Açıklama
                </label>
                <textarea
                  className="field-input min-h-20"
                  id={`section-description-${version.id}-${index}`}
                  onChange={(event) => updateSection(index, { description: event.target.value })}
                  value={section.description}
                />
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <label className="mr-auto flex items-center gap-2 text-sm font-medium text-ink-muted">
                  <input
                    checked={section.required}
                    onChange={(event) => updateSection(index, { required: event.target.checked })}
                    type="checkbox"
                  />
                  Zorunlu bölüm
                </label>
                <button
                  aria-label={`${section.title} bölümünü yukarı taşı`}
                  className="icon-button"
                  disabled={index === 0}
                  onClick={() => setSections(normalizedSections(reorder(sections, index, -1)))}
                  type="button"
                >
                  ↑
                </button>
                <button
                  aria-label={`${section.title} bölümünü aşağı taşı`}
                  className="icon-button"
                  disabled={index === sections.length - 1}
                  onClick={() => setSections(normalizedSections(reorder(sections, index, 1)))}
                  type="button"
                >
                  ↓
                </button>
                <button
                  className="danger-button"
                  onClick={() =>
                    setSections(
                      normalizedSections(sections.filter((_, candidate) => candidate !== index)),
                    )
                  }
                  type="button"
                >
                  Kaldır
                </button>
              </div>
            </fieldset>
          ))}
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button className="secondary-button" disabled={saving} onClick={save} type="button">
          {saving ? "Kaydediliyor…" : "Taslağı kaydet"}
        </button>
        <button className="primary-button" disabled={saving} onClick={activate} type="button">
          Kullanıma al
        </button>
        <FeedbackMessage feedback={feedback} />
      </div>
      {!version.file ? (
        <p className="field-help mt-2">Kullanıma almak için önce resmî rapor PDF'sini yükleyin.</p>
      ) : null}
    </div>
  );
}

function TemplatesSection({
  configuration,
  refresh,
}: {
  configuration: CompetitionConfigurationResponse;
  refresh: () => Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(
    configuration.templates[0]?.id ?? null,
  );
  const [newLabel, setNewLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const selected = configuration.templates.find((version) => version.id === selectedId) ?? null;

  useEffect(() => {
    if (!selectedId || !configuration.templates.some((version) => version.id === selectedId)) {
      setSelectedId(configuration.templates[0]?.id ?? null);
    }
  }, [configuration.templates, selectedId]);

  async function create(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      const created = await apiRequest(
        `/api/v1/competitions/${configuration.competition.id}/templates`,
        TemplateVersionResponseSchema,
        {
          method: "POST",
          body: JSON.stringify({
            label: newLabel,
            structuralProfile: { expectedLanguage: "tr", sections: [] },
          }),
        },
      );
      setSelectedId(created.id);
      setNewLabel("");
      await refresh();
      setFeedback({ kind: "saved", message: "Yeni taslak format oluşturuldu." });
    } catch (error) {
      setFeedback({ kind: "error", message: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="templates-title" className="setup-panel">
      <div className="panel-heading">
        <div>
          <h2 className="section-title" id="templates-title">
            Rapor formatı
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-ink-muted">
            Rapor formatı, yarışmacılara verilen resmî PDF ile raporlarda beklenen dil ve bölüm
            yapısını birlikte tanımlar. Kullanımda olan format değiştirilemez; değişiklik yeni bir
            taslak sürümle yapılır.
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <aside aria-label="Format sürümleri" className="space-y-2">
          {configuration.templates.length === 0 ? (
            <div className="empty-state">Henüz rapor formatı tanımlanmadı.</div>
          ) : (
            configuration.templates.map((version) => (
              <button
                className={`w-full rounded-xl border p-4 text-left ${
                  selectedId === version.id
                    ? "border-brand bg-brand-soft"
                    : "border-line bg-surface hover:border-line-strong"
                }`}
                key={version.id}
                onClick={() => setSelectedId(version.id)}
                type="button"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-ink">Sürüm {version.versionNumber}</span>
                  <StatusBadge status={version.status} />
                </span>
                <span className="mt-2 block text-sm text-ink-muted">{version.label}</span>
              </button>
            ))
          )}
          <form
            className="rounded-xl border border-dashed border-line-strong p-4"
            onSubmit={create}
          >
            <label className="field-label" htmlFor="new-template-label">
              Yeni taslak format
            </label>
            <input
              className="field-input"
              id="new-template-label"
              onChange={(event) => setNewLabel(event.target.value)}
              placeholder="2026 ana formatı"
              required
              value={newLabel}
            />
            <p className="field-help">
              Yeni sürüm taslak olarak açılır; hazır olunca kullanıma alınır.
            </p>
            <button className="secondary-button mt-3 w-full" disabled={saving} type="submit">
              {saving ? "Oluşturuluyor…" : "Taslak oluştur"}
            </button>
            <div className="mt-2">
              <FeedbackMessage feedback={feedback} />
            </div>
          </form>
        </aside>

        <div>
          {!selected ? (
            <div className="empty-state">Düzenlemek için bir format sürümü oluşturun.</div>
          ) : selected.status === "DRAFT" ? (
            <div>
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold text-ink">Sürüm {selected.versionNumber}</h3>
                <StatusBadge status={selected.status} />
              </div>
              <TemplateDraftEditor
                competitionId={configuration.competition.id}
                refresh={refresh}
                version={selected}
              />
            </div>
          ) : (
            <div className="rounded-xl border border-line bg-surface-muted p-5">
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-lg font-semibold text-ink">{selected.label}</h3>
                <StatusBadge status={selected.status} />
              </div>
              <p className="mt-3 text-sm text-ink-muted">
                Kullanımda ve arşivdeki sürümler tarihsel kayıt olarak değiştirilemez. Değişiklik
                için yeni taslak oluşturun.
              </p>
              <div className="mt-5">
                <TemplateFileUploader
                  competitionId={configuration.competition.id}
                  editable={false}
                  refresh={refresh}
                  version={selected}
                />
              </div>
              <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-ink-subtle">Beklenen rapor dili</dt>
                  <dd className="mt-1 font-semibold text-ink">
                    {languageName(selected.structuralProfile.expectedLanguage)}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-subtle">Bölüm sayısı</dt>
                  <dd className="mt-1 font-semibold text-ink">
                    {selected.structuralProfile.sections.length}
                  </dd>
                </div>
              </dl>
              <ol className="mt-5 space-y-2">
                {selected.structuralProfile.sections.map((section) => (
                  <li
                    className="rounded-lg border border-line bg-surface px-4 py-3 text-sm"
                    key={section.key}
                  >
                    <span className="font-semibold text-ink">
                      {section.order}. {section.title}
                    </span>
                    <span className="ml-2 text-ink-subtle">
                      {section.required ? "Zorunlu" : "İsteğe bağlı"}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function emptyCriterion(order: number): CriterionInput {
  return {
    code: `criterion-${order}`,
    name: "Yeni kriter",
    description: "",
    maxScore: 10,
    weight: 0,
    evidenceExpectation: "",
    order,
  };
}

function RubricDraftEditor({
  competitionId,
  version,
  refresh,
}: {
  competitionId: string;
  version: RubricVersionResponse;
  refresh: () => Promise<void>;
}) {
  const [label, setLabel] = useState(version.label);
  const [criteria, setCriteria] = useState<CriterionInput[]>(version.criteria);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  useEffect(() => {
    setLabel(version.label);
    setCriteria(version.criteria);
    setFeedback(null);
  }, [version]);

  const normalize = (values: CriterionInput[]) =>
    values.map((criterion, index) => ({ ...criterion, order: index + 1 }));
  const totalScore = criteria.reduce((sum, criterion) => sum + Number(criterion.maxScore || 0), 0);
  const totalWeight = criteria.reduce((sum, criterion) => sum + Number(criterion.weight || 0), 0);

  function updateCriterion(index: number, changes: Partial<CriterionInput>) {
    setCriteria((current) =>
      normalize(
        current.map((criterion, candidate) =>
          candidate === index ? { ...criterion, ...changes } : criterion,
        ),
      ),
    );
  }

  async function save() {
    setSaving(true);
    setFeedback(null);
    try {
      await apiRequest(
        `/api/v1/competitions/${competitionId}/rubrics/${version.id}`,
        RubricVersionResponseSchema,
        { method: "PATCH", body: JSON.stringify({ label }) },
      );
      await apiRequest(
        `/api/v1/competitions/${competitionId}/rubrics/${version.id}/criteria`,
        RubricVersionResponseSchema,
        { method: "PUT", body: JSON.stringify({ criteria: normalize(criteria) }) },
      );
      await refresh();
      setFeedback({ kind: "saved", message: "Rubrik ve kriter listesi kaydedildi." });
    } catch (error) {
      setFeedback({ kind: "error", message: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  async function activate() {
    setSaving(true);
    setFeedback(null);
    try {
      await apiRequest(
        `/api/v1/competitions/${competitionId}/rubrics/${version.id}/activate`,
        RubricVersionResponseSchema,
        { method: "POST" },
      );
      await refresh();
      setFeedback({ kind: "saved", message: "Rubrik kullanıma alındı." });
    } catch (error) {
      setFeedback({ kind: "error", message: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-5 rounded-lg border border-line bg-surface p-5">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
        <div>
          <label className="field-label" htmlFor={`rubric-label-${version.id}`}>
            Rubrik adı
          </label>
          <input
            className="field-input"
            id={`rubric-label-${version.id}`}
            onChange={(event) => setLabel(event.target.value)}
            required
            value={label}
          />
        </div>
        <span className="metric-chip">Toplam puan: {totalScore}</span>
        <span className="metric-chip">Toplam ağırlık: {totalWeight}%</span>
      </div>

      <div className="mt-6 flex items-center justify-between gap-3">
        <h4 className="font-semibold text-ink">Kriterler</h4>
        <button
          className="secondary-button"
          onClick={() => setCriteria((current) => [...current, emptyCriterion(current.length + 1)])}
          type="button"
        >
          Kriter ekle
        </button>
      </div>

      {criteria.length === 0 ? (
        <div className="empty-state mt-4">Kullanıma almak için en az bir kriter ekleyin.</div>
      ) : (
        <div className="mt-4 grid gap-4">
          {criteria.map((criterion, index) => (
            <fieldset
              className="rounded-lg border border-line bg-surface p-4"
              key={`${version.id}-${criterion.code}`}
            >
              <legend className="px-1 text-sm font-semibold text-ink-muted">
                Kriter {index + 1}
              </legend>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="field-label" htmlFor={`criterion-code-${version.id}-${index}`}>
                    Kısa kod
                  </label>
                  <input
                    className="field-input font-mono"
                    id={`criterion-code-${version.id}-${index}`}
                    onChange={(event) => updateCriterion(index, { code: event.target.value })}
                    required
                    value={criterion.code}
                  />
                </div>
                <div>
                  <label className="field-label" htmlFor={`criterion-name-${version.id}-${index}`}>
                    Kriter adı
                  </label>
                  <input
                    className="field-input"
                    id={`criterion-name-${version.id}-${index}`}
                    onChange={(event) => updateCriterion(index, { name: event.target.value })}
                    required
                    value={criterion.name}
                  />
                </div>
              </div>
              <div className="mt-4">
                <label
                  className="field-label"
                  htmlFor={`criterion-description-${version.id}-${index}`}
                >
                  Açıklama
                </label>
                <textarea
                  className="field-input min-h-20"
                  id={`criterion-description-${version.id}-${index}`}
                  onChange={(event) => updateCriterion(index, { description: event.target.value })}
                  required
                  value={criterion.description}
                />
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <label className="field-label" htmlFor={`criterion-score-${version.id}-${index}`}>
                    Azami puan
                  </label>
                  <input
                    className="field-input"
                    id={`criterion-score-${version.id}-${index}`}
                    min={1}
                    onChange={(event) =>
                      updateCriterion(index, { maxScore: Number(event.target.value) })
                    }
                    required
                    type="number"
                    value={criterion.maxScore}
                  />
                </div>
                <div>
                  <label
                    className="field-label"
                    htmlFor={`criterion-weight-${version.id}-${index}`}
                  >
                    Ağırlık (%)
                  </label>
                  <input
                    className="field-input"
                    id={`criterion-weight-${version.id}-${index}`}
                    max={100}
                    min={0}
                    onChange={(event) =>
                      updateCriterion(index, { weight: Number(event.target.value) })
                    }
                    required
                    step="0.01"
                    type="number"
                    value={criterion.weight}
                  />
                </div>
              </div>
              <div className="mt-4">
                <label
                  className="field-label"
                  htmlFor={`criterion-evidence-${version.id}-${index}`}
                >
                  Kanıt beklentisi
                </label>
                <textarea
                  className="field-input min-h-20"
                  id={`criterion-evidence-${version.id}-${index}`}
                  onChange={(event) =>
                    updateCriterion(index, { evidenceExpectation: event.target.value })
                  }
                  required
                  value={criterion.evidenceExpectation}
                />
                <p className="field-help">
                  Hakemin bu kriterde ne tür kanıt araması gerektiğini belirtin.
                </p>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  aria-label={`${criterion.name} kriterini yukarı taşı`}
                  className="icon-button"
                  disabled={index === 0}
                  onClick={() => setCriteria(normalize(reorder(criteria, index, -1)))}
                  type="button"
                >
                  ↑
                </button>
                <button
                  aria-label={`${criterion.name} kriterini aşağı taşı`}
                  className="icon-button"
                  disabled={index === criteria.length - 1}
                  onClick={() => setCriteria(normalize(reorder(criteria, index, 1)))}
                  type="button"
                >
                  ↓
                </button>
                <button
                  className="danger-button"
                  onClick={() =>
                    setCriteria(normalize(criteria.filter((_, candidate) => candidate !== index)))
                  }
                  type="button"
                >
                  Kaldır
                </button>
              </div>
            </fieldset>
          ))}
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button className="secondary-button" disabled={saving} onClick={save} type="button">
          {saving ? "Kaydediliyor…" : "Rubriği kaydet"}
        </button>
        <button className="primary-button" disabled={saving} onClick={activate} type="button">
          Kullanıma al
        </button>
        <FeedbackMessage feedback={feedback} />
      </div>
    </div>
  );
}

function RubricsSection({
  configuration,
  refresh,
}: {
  configuration: CompetitionConfigurationResponse;
  refresh: () => Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(configuration.rubrics[0]?.id ?? null);
  const [newLabel, setNewLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const selected = configuration.rubrics.find((version) => version.id === selectedId) ?? null;

  useEffect(() => {
    if (!selectedId || !configuration.rubrics.some((version) => version.id === selectedId)) {
      setSelectedId(configuration.rubrics[0]?.id ?? null);
    }
  }, [configuration.rubrics, selectedId]);

  async function create(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      const created = await apiRequest(
        `/api/v1/competitions/${configuration.competition.id}/rubrics`,
        RubricVersionResponseSchema,
        { method: "POST", body: JSON.stringify({ label: newLabel }) },
      );
      setSelectedId(created.id);
      setNewLabel("");
      await refresh();
      setFeedback({ kind: "saved", message: "Yeni taslak rubrik oluşturuldu." });
    } catch (error) {
      setFeedback({ kind: "error", message: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="rubrics-title" className="setup-panel">
      <div className="panel-heading">
        <div>
          <h2 className="section-title" id="rubrics-title">
            Değerlendirme rubriği
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-ink-muted">
            Hakemlerin puanlamada kullandığı ölçütler. Ağırlık toplamı bilgi olarak gösterilir; 100
            olma koşulu kullanıma alma engeli değildir.
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <aside aria-label="Rubrik sürümleri" className="space-y-2">
          {configuration.rubrics.length === 0 ? (
            <div className="empty-state">Henüz rubrik tanımlanmadı.</div>
          ) : (
            configuration.rubrics.map((version) => (
              <button
                className={`w-full rounded-xl border p-4 text-left ${
                  selectedId === version.id
                    ? "border-brand bg-brand-soft"
                    : "border-line bg-surface hover:border-line-strong"
                }`}
                key={version.id}
                onClick={() => setSelectedId(version.id)}
                type="button"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-ink">Sürüm {version.versionNumber}</span>
                  <StatusBadge status={version.status} />
                </span>
                <span className="mt-2 block text-sm text-ink-muted">{version.label}</span>
                <span className="mt-1 block text-xs text-ink-subtle">
                  {version.criteria.length} kriter
                </span>
              </button>
            ))
          )}
          <form
            className="rounded-xl border border-dashed border-line-strong p-4"
            onSubmit={create}
          >
            <label className="field-label" htmlFor="new-rubric-label">
              Yeni taslak rubrik
            </label>
            <input
              className="field-input"
              id="new-rubric-label"
              onChange={(event) => setNewLabel(event.target.value)}
              placeholder="2026 değerlendirme rubriği"
              required
              value={newLabel}
            />
            <p className="field-help">
              Yeni sürüm taslak olarak açılır; hazır olunca kullanıma alınır.
            </p>
            <button className="secondary-button mt-3 w-full" disabled={saving} type="submit">
              {saving ? "Oluşturuluyor…" : "Taslak oluştur"}
            </button>
            <div className="mt-2">
              <FeedbackMessage feedback={feedback} />
            </div>
          </form>
        </aside>

        <div>
          {!selected ? (
            <div className="empty-state">Düzenlemek için bir rubrik sürümü oluşturun.</div>
          ) : selected.status === "DRAFT" ? (
            <div>
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold text-ink">Sürüm {selected.versionNumber}</h3>
                <StatusBadge status={selected.status} />
              </div>
              <RubricDraftEditor
                competitionId={configuration.competition.id}
                refresh={refresh}
                version={selected}
              />
            </div>
          ) : (
            <div className="rounded-xl border border-line bg-surface-muted p-5">
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-lg font-semibold text-ink">{selected.label}</h3>
                <StatusBadge status={selected.status} />
              </div>
              <p className="mt-3 text-sm text-ink-muted">
                Kullanımda ve arşivdeki rubrikler değiştirilemez. Yeni ölçütler için yeni taslak
                sürüm oluşturun.
              </p>
              <div className="mt-5 space-y-3">
                {selected.criteria.map((item) => (
                  <article className="rounded-lg border border-line bg-surface p-4" key={item.id}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <h4 className="font-semibold text-ink">{item.name}</h4>
                      <span className="metric-chip">
                        {item.maxScore} puan · %{item.weight}
                      </span>
                    </div>
                    <p className="mt-3 text-sm text-ink-muted">{item.description}</p>
                    <p className="mt-2 text-sm text-ink-muted">
                      <strong className="text-ink">Kanıt beklentisi:</strong>{" "}
                      {item.evidenceExpectation}
                    </p>
                  </article>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function FinalCheckSection({ configuration }: { configuration: CompetitionConfigurationResponse }) {
  const items = [
    ["competition", "Yarışma bilgileri"],
    ["categories", "En az bir kategori"],
    ["activeTemplate", "Kullanımda bir rapor formatı"],
    ["activeTemplateFile", "Resmî rapor PDF'si"],
    ["activeRubric", "Kullanımda bir rubrik"],
    ["rubricHasCriteria", "Rubrik kriterleri"],
  ] as const;

  return (
    <section aria-labelledby="readiness-title" className="setup-panel">
      <h2 className="section-title" id="readiness-title">
        Son kontrol
      </h2>
      <p className="mt-1 text-sm leading-6 text-ink-muted">
        Başvuru almaya başlamadan önce tamamlanması gereken adımlar.
      </p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {items.map(([key, label]) => {
          const complete = configuration.readiness[key];
          return (
            <div
              className={`flex items-center gap-3 rounded-xl border p-4 ${
                complete
                  ? "border-success-border bg-success-soft text-success-ink"
                  : "border-line bg-surface-muted text-ink-muted"
              }`}
              key={key}
            >
              <span aria-hidden="true" className="text-lg font-bold">
                {complete ? "✓" : "○"}
              </span>
              <span className="font-medium">{label}</span>
              <span className="sr-only">{complete ? "tamamlandı" : "eksik"}</span>
            </div>
          );
        })}
      </div>
      <div
        className={configuration.readiness.ready ? "alert-success mt-6" : "mt-6 alert-info"}
        role="status"
      >
        <h3 className="font-semibold">
          {configuration.readiness.ready
            ? "Yarışma kurulumu hazır: başvurular yüklenip analiz edilebilir."
            : "Kurulum henüz tamamlanmadı."}
        </h3>
        {!configuration.readiness.ready ? (
          <p className="mt-1">Eksik adımları yukarıdaki listeden tamamlayın.</p>
        ) : null}
      </div>
    </section>
  );
}

type TaskKey = "general" | "categories" | "templates" | "rubrics" | "readiness";

interface SetupTask {
  key: TaskKey;
  title: string;
  description: string;
  done: boolean;
  status: string;
}

export function buildTasks(configuration: CompetitionConfigurationResponse): SetupTask[] {
  const { categories, readiness, rubrics, templates } = configuration;
  const activeTemplate = templates.find((version) => version.status === "ACTIVE") ?? null;
  const activeRubric = rubrics.find((version) => version.status === "ACTIVE") ?? null;
  const hasDraftTemplate = templates.some((version) => version.status === "DRAFT");
  const hasDraftRubric = rubrics.some((version) => version.status === "DRAFT");

  const templateStatus = readiness.activeTemplateFile
    ? `Hazır · ${activeTemplate?.label ?? "kullanımda"}`
    : readiness.activeTemplate
      ? "Rapor PDF'si eksik"
      : hasDraftTemplate
        ? "Taslak kullanıma alınmadı"
        : "Rapor formatı tanımlanmadı";

  const rubricStatus =
    readiness.activeRubric && readiness.rubricHasCriteria
      ? `Hazır · ${activeRubric?.criteria.length ?? 0} kriter`
      : readiness.activeRubric
        ? "Kriter eklenmedi"
        : hasDraftRubric
          ? "Taslak kullanıma alınmadı"
          : "Rubrik oluşturulmadı";

  return [
    {
      key: "general",
      title: "Yarışma bilgileri",
      description: "Ad ve açıklama.",
      done: readiness.competition,
      status: readiness.competition ? "Tamamlandı" : "Eksik",
    },
    {
      key: "categories",
      title: "Kategoriler",
      description: "Başvuruların yükleneceği kategoriler.",
      done: readiness.categories,
      status: readiness.categories ? `${categories.length} kategori` : "Kategori eklenmedi",
    },
    {
      key: "templates",
      title: "Rapor formatı",
      description: "Resmî rapor PDF'si ve beklenen bölümler.",
      done: readiness.activeTemplate && readiness.activeTemplateFile,
      status: templateStatus,
    },
    {
      key: "rubrics",
      title: "Değerlendirme rubriği",
      description: "Hakemlerin kullanacağı puanlama ölçütleri.",
      done: readiness.activeRubric && readiness.rubricHasCriteria,
      status: rubricStatus,
    },
    {
      key: "readiness",
      title: "Son kontrol",
      description: "Başvuru almadan önce genel durum.",
      done: readiness.ready,
      status: readiness.ready ? "Hazır" : "Bekliyor",
    },
  ];
}

function SetupTaskList({
  activeTask,
  onSelect,
  tasks,
}: {
  activeTask: TaskKey;
  onSelect: (key: TaskKey) => void;
  tasks: SetupTask[];
}) {
  return (
    <ol aria-label="Kurulum adımları" className="surface-panel divide-y divide-line">
      {tasks.map((task, index) => {
        const isActive = task.key === activeTask;
        return (
          <li key={task.key}>
            <button
              aria-current={isActive ? "step" : undefined}
              className={`setup-task w-full text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand ${
                isActive ? "bg-brand-soft/60" : "hover:bg-surface-muted"
              }`}
              onClick={() => onSelect(task.key)}
              type="button"
            >
              <span className="flex min-w-0 items-center gap-3">
                <span
                  aria-hidden="true"
                  className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${
                    task.done
                      ? "bg-success-soft text-success-ink"
                      : "bg-surface-muted text-ink-subtle"
                  }`}
                >
                  {task.done ? "✓" : index + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-ink">{task.title}</span>
                  <span className="block truncate text-xs text-ink-subtle">{task.description}</span>
                </span>
              </span>
              <span
                className={`status-chip ${task.done ? "status-chip-pass" : "status-chip-neutral"}`}
              >
                {task.status}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

export function SetupPage() {
  const { competitionId } = useParams();
  const [configuration, setConfiguration] = useState<CompetitionConfigurationResponse | null>(null);
  const [activeTask, setActiveTask] = useState<TaskKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!competitionId) return;
    const response = await apiRequest(
      `/api/v1/competitions/${competitionId}/configuration`,
      CompetitionConfigurationResponseSchema,
    );
    setConfiguration(response);
    setError(null);
  }, [competitionId]);

  useEffect(() => {
    refresh().catch((caught) => setError(errorMessage(caught)));
  }, [refresh]);

  if (!competitionId) {
    return <div className="mx-auto max-w-4xl">Yarışma kimliği bulunamadı.</div>;
  }

  const tasks = configuration ? buildTasks(configuration) : null;
  const completedCount = tasks ? tasks.filter((task) => task.done).length : 0;
  // Default focus: the first incomplete task, or the final check when all done.
  const currentTask: TaskKey = activeTask ?? tasks?.find((task) => !task.done)?.key ?? "readiness";

  return (
    <div className="layout-setup">
      <Breadcrumb trail={[{ label: "Genel Bakış", to: "/app" }, { label: "Kurulum" }]} />
      <div className="mt-4">
        <PageHeader
          lead={
            configuration ? `${completedCount} / ${tasks?.length ?? 5} adım tamamlandı` : undefined
          }
          title="Kurulum"
        />
      </div>

      {error ? (
        <div className="mt-6">
          <Alert tone="error">
            <p className="font-semibold">Kurulum bilgileri yüklenemedi</p>
            <p className="mt-1">{error}</p>
            <button className="secondary-button mt-3" onClick={() => refresh()} type="button">
              Tekrar dene
            </button>
          </Alert>
        </div>
      ) : null}

      {!configuration && !error ? (
        <div className="setup-panel mt-6" role="status">
          Kurulum yükleniyor…
        </div>
      ) : null}

      {configuration && tasks ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start">
          <SetupTaskList
            activeTask={currentTask}
            onSelect={(key) => setActiveTask(key)}
            tasks={tasks}
          />
          <div className="min-w-0">
            {currentTask === "general" ? (
              <GeneralSection configuration={configuration} refresh={refresh} />
            ) : null}
            {currentTask === "categories" ? (
              <CategoriesSection configuration={configuration} refresh={refresh} />
            ) : null}
            {currentTask === "templates" ? (
              <TemplatesSection configuration={configuration} refresh={refresh} />
            ) : null}
            {currentTask === "rubrics" ? (
              <RubricsSection configuration={configuration} refresh={refresh} />
            ) : null}
            {currentTask === "readiness" ? (
              <FinalCheckSection configuration={configuration} />
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
