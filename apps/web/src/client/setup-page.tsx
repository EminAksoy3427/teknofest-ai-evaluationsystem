import {
  CategoryResponseSchema,
  type CompetitionConfigurationResponse,
  CompetitionConfigurationResponseSchema,
  CompetitionResponseSchema,
  type CriterionInput,
  type RubricVersionResponse,
  RubricVersionResponseSchema,
  type TemplateSectionRule,
  type TemplateVersionResponse,
  TemplateVersionResponseSchema,
} from "@teknofest-ai/shared";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router";

import { apiDelete, apiRequest, errorMessage } from "./api";

type Feedback = { kind: "saved" | "error"; message: string } | null;

function FeedbackMessage({ feedback }: { feedback: Feedback }) {
  if (!feedback) return null;
  return (
    <p
      className={feedback.kind === "saved" ? "text-sm text-emerald-700" : "text-sm text-red-700"}
      role={feedback.kind === "error" ? "alert" : "status"}
    >
      {feedback.message}
    </p>
  );
}

function StatusBadge({ status }: { status: TemplateVersionResponse["status"] }) {
  const styles = {
    DRAFT: "bg-amber-50 text-amber-800 ring-amber-200",
    ACTIVE: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    RETIRED: "bg-slate-100 text-slate-700 ring-slate-200",
  };
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${styles[status]}`}>
      {status}
    </span>
  );
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
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Temel bilgiler</p>
          <h2 className="section-title" id="general-title">
            Genel
          </h2>
        </div>
        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800">
          COMPETITION_MANAGER
        </span>
      </div>
      <form className="mt-6 grid gap-5" onSubmit={submit}>
        <div className="grid gap-5 md:grid-cols-2">
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
            <label className="field-label" htmlFor="setup-slug">
              Slug
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
          </div>
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
    <form className="rounded-xl border border-slate-200 p-5" onSubmit={save}>
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
        <div>
          <label className="field-label" htmlFor={`category-code-${category.id}`}>
            Kod
          </label>
          <input
            className="field-input font-mono"
            id={`category-code-${category.id}`}
            onChange={(event) => setValues({ ...values, code: event.target.value })}
            required
            value={values.code}
          />
        </div>
      </div>
      <div className="mt-4">
        <label className="field-label" htmlFor={`category-description-${category.id}`}>
          Yetkili açıklama
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
          Kapsam notları
        </label>
        <textarea
          className="field-input min-h-20"
          id={`category-guidance-${category.id}`}
          onChange={(event) => setValues({ ...values, guidance: event.target.value })}
          value={values.guidance}
        />
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
          <p className="eyebrow">Semantik yarışma bağlamı</p>
          <h2 className="section-title" id="categories-title">
            Kategoriler
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Açıklama kategorinin ne olduğunu, kapsam notları ise neyin içeride veya dışarıda
            sayıldığını belirtir.
          </p>
        </div>
        <span className="metric-chip">{configuration.categories.length} kategori</span>
      </div>

      <div className="mt-6 grid gap-4">
        {configuration.categories.length === 0 ? (
          <div className="empty-state">
            Henüz kategori yok. Yapılandırma hazırlığı için en az bir kategori ekleyin.
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

      <form className="mt-8 rounded-xl bg-slate-50 p-5" onSubmit={create}>
        <h3 className="font-semibold text-slate-950">Yeni kategori</h3>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <label className="field-label" htmlFor="new-category-name">
              Kategori adı
            </label>
            <input
              className="field-input"
              id="new-category-name"
              onChange={(event) => setName(event.target.value)}
              required
              value={name}
            />
          </div>
          <div>
            <label className="field-label" htmlFor="new-category-code">
              Kod
            </label>
            <input
              className="field-input font-mono"
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
              Yetkili açıklama
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
              Kapsam notları
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
      setFeedback({ kind: "saved", message: "Taslak şablon yapısı kaydedildi." });
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
      setFeedback({ kind: "saved", message: "Şablon sürümü etkinleştirildi." });
    } catch (error) {
      setFeedback({ kind: "error", message: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50/40 p-5">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="field-label" htmlFor={`template-label-${version.id}`}>
            Sürüm etiketi
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
            Beklenen dil
          </label>
          <input
            className="field-input font-mono"
            id={`template-language-${version.id}`}
            onChange={(event) => setLanguage(event.target.value)}
            placeholder="tr"
            required
            value={language}
          />
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between gap-3">
        <h4 className="font-semibold text-slate-950">Beklenen bölümler</h4>
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
        <div className="empty-state mt-4">Etkinleştirmek için en az bir zorunlu bölüm ekleyin.</div>
      ) : (
        <div className="mt-4 grid gap-4">
          {sections.map((section, index) => (
            <fieldset
              className="rounded-lg border border-slate-200 bg-white p-4"
              key={`${version.id}-${section.key}`}
            >
              <legend className="px-1 text-sm font-semibold text-slate-700">
                Bölüm {index + 1}
              </legend>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="field-label" htmlFor={`section-key-${version.id}-${index}`}>
                    Sabit kod
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
                <label className="mr-auto flex items-center gap-2 text-sm font-medium text-slate-700">
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
          Etkinleştir
        </button>
        <FeedbackMessage feedback={feedback} />
      </div>
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
      setFeedback({ kind: "saved", message: "Yeni taslak şablon oluşturuldu." });
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
          <p className="eyebrow">Dosya değil, yapısal profil</p>
          <h2 className="section-title" id="templates-title">
            Şablon Yapısı
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Bu aşama beklenen dil ve bölüm yapısını tanımlar. Yetkili dosya yükleme R2 aşamasına
            ertelenmiştir.
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <aside aria-label="Şablon sürüm geçmişi" className="space-y-2">
          {configuration.templates.length === 0 ? (
            <div className="empty-state">Henüz şablon sürümü yok.</div>
          ) : (
            configuration.templates.map((version) => (
              <button
                className={`w-full rounded-xl border p-4 text-left ${
                  selectedId === version.id
                    ? "border-blue-400 bg-blue-50"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
                key={version.id}
                onClick={() => setSelectedId(version.id)}
                type="button"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-950">v{version.versionNumber}</span>
                  <StatusBadge status={version.status} />
                </span>
                <span className="mt-2 block text-sm text-slate-600">{version.label}</span>
              </button>
            ))
          )}
          <form className="rounded-xl border border-dashed border-slate-300 p-4" onSubmit={create}>
            <label className="field-label" htmlFor="new-template-label">
              Yeni sürüm etiketi
            </label>
            <input
              className="field-input"
              id="new-template-label"
              onChange={(event) => setNewLabel(event.target.value)}
              placeholder="2026 ana şablonu"
              required
              value={newLabel}
            />
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
            <div className="empty-state">Düzenlemek için bir şablon sürümü oluşturun.</div>
          ) : selected.status === "DRAFT" ? (
            <div>
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold text-slate-950">v{selected.versionNumber}</h3>
                <StatusBadge status={selected.status} />
              </div>
              <TemplateDraftEditor
                competitionId={configuration.competition.id}
                refresh={refresh}
                version={selected}
              />
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-lg font-semibold text-slate-950">{selected.label}</h3>
                <StatusBadge status={selected.status} />
              </div>
              <p className="mt-3 text-sm text-slate-600">
                Aktif ve emekli sürümler tarihsel kayıt olarak değiştirilemez. Değişiklik için yeni
                taslak oluşturun.
              </p>
              <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-slate-500">Beklenen dil</dt>
                  <dd className="mt-1 font-mono font-semibold text-slate-900">
                    {selected.structuralProfile.expectedLanguage}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Bölüm sayısı</dt>
                  <dd className="mt-1 font-semibold text-slate-900">
                    {selected.structuralProfile.sections.length}
                  </dd>
                </div>
              </dl>
              <ol className="mt-5 space-y-2">
                {selected.structuralProfile.sections.map((section) => (
                  <li
                    className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm"
                    key={section.key}
                  >
                    <span className="font-semibold text-slate-900">
                      {section.order}. {section.title}
                    </span>
                    <span className="ml-2 text-slate-500">
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
      setFeedback({ kind: "saved", message: "Rubrik sürümü etkinleştirildi." });
    } catch (error) {
      setFeedback({ kind: "error", message: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50/40 p-5">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
        <div>
          <label className="field-label" htmlFor={`rubric-label-${version.id}`}>
            Sürüm etiketi
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
        <h4 className="font-semibold text-slate-950">Kriterler</h4>
        <button
          className="secondary-button"
          onClick={() => setCriteria((current) => [...current, emptyCriterion(current.length + 1)])}
          type="button"
        >
          Kriter ekle
        </button>
      </div>

      {criteria.length === 0 ? (
        <div className="empty-state mt-4">Etkinleştirmek için en az bir kriter ekleyin.</div>
      ) : (
        <div className="mt-4 grid gap-4">
          {criteria.map((criterion, index) => (
            <fieldset
              className="rounded-lg border border-slate-200 bg-white p-4"
              key={`${version.id}-${criterion.code}`}
            >
              <legend className="px-1 text-sm font-semibold text-slate-700">
                Kriter {index + 1}
              </legend>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="field-label" htmlFor={`criterion-code-${version.id}-${index}`}>
                    Sabit kod
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
          Etkinleştir
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
          <p className="eyebrow">İnsan değerlendirmesinin yetkili ölçütleri</p>
          <h2 className="section-title" id="rubrics-title">
            Rubrik
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Ağırlık toplamı bilgi olarak gösterilir; 100 olma koşulu etkinleştirme kapısı değildir.
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <aside aria-label="Rubrik sürüm geçmişi" className="space-y-2">
          {configuration.rubrics.length === 0 ? (
            <div className="empty-state">Henüz rubrik sürümü yok.</div>
          ) : (
            configuration.rubrics.map((version) => (
              <button
                className={`w-full rounded-xl border p-4 text-left ${
                  selectedId === version.id
                    ? "border-blue-400 bg-blue-50"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
                key={version.id}
                onClick={() => setSelectedId(version.id)}
                type="button"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-950">v{version.versionNumber}</span>
                  <StatusBadge status={version.status} />
                </span>
                <span className="mt-2 block text-sm text-slate-600">{version.label}</span>
                <span className="mt-1 block text-xs text-slate-500">
                  {version.criteria.length} kriter
                </span>
              </button>
            ))
          )}
          <form className="rounded-xl border border-dashed border-slate-300 p-4" onSubmit={create}>
            <label className="field-label" htmlFor="new-rubric-label">
              Yeni sürüm etiketi
            </label>
            <input
              className="field-input"
              id="new-rubric-label"
              onChange={(event) => setNewLabel(event.target.value)}
              placeholder="2026 değerlendirme rubriği"
              required
              value={newLabel}
            />
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
                <h3 className="text-lg font-semibold text-slate-950">v{selected.versionNumber}</h3>
                <StatusBadge status={selected.status} />
              </div>
              <RubricDraftEditor
                competitionId={configuration.competition.id}
                refresh={refresh}
                version={selected}
              />
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-lg font-semibold text-slate-950">{selected.label}</h3>
                <StatusBadge status={selected.status} />
              </div>
              <p className="mt-3 text-sm text-slate-600">
                Aktif ve emekli rubrikler değiştirilemez. Yeni ölçütler için yeni taslak sürüm
                oluşturun.
              </p>
              <div className="mt-5 space-y-3">
                {selected.criteria.map((item) => (
                  <article
                    className="rounded-lg border border-slate-200 bg-white p-4"
                    key={item.id}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-mono text-xs text-slate-500">{item.code}</p>
                        <h4 className="mt-1 font-semibold text-slate-950">{item.name}</h4>
                      </div>
                      <span className="metric-chip">
                        {item.maxScore} puan · %{item.weight}
                      </span>
                    </div>
                    <p className="mt-3 text-sm text-slate-600">{item.description}</p>
                    <p className="mt-2 text-sm text-slate-700">
                      <strong>Kanıt:</strong> {item.evidenceExpectation}
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

function ReadinessSection({ configuration }: { configuration: CompetitionConfigurationResponse }) {
  const items = [
    ["competition", "Yarışma bilgileri"],
    ["categories", "En az bir kategori"],
    ["activeTemplate", "Aktif şablon yapısı"],
    ["activeRubric", "Aktif rubrik"],
    ["rubricHasCriteria", "Rubrik kriterleri"],
  ] as const;

  return (
    <section aria-labelledby="readiness-title" className="setup-panel">
      <p className="eyebrow">Türetilmiş durum</p>
      <h2 className="section-title" id="readiness-title">
        Hazırlık
      </h2>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {items.map(([key, label]) => {
          const complete = configuration.readiness[key];
          return (
            <div
              className={`flex items-center gap-3 rounded-xl border p-4 ${
                complete
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : "border-slate-200 bg-slate-50 text-slate-700"
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
        className={`mt-6 rounded-xl border p-5 ${
          configuration.readiness.ready
            ? "border-emerald-300 bg-emerald-50"
            : "border-amber-200 bg-amber-50"
        }`}
        role="status"
      >
        <h3 className="font-semibold text-slate-950">
          {configuration.readiness.ready
            ? "Yarışma yapılandırması hazır"
            : "Yarışma yapılandırması tamamlanmadı"}
        </h3>
        <p className="mt-2 text-sm leading-6 text-slate-700">
          Bu durum yalnız gelecekteki başvuru hattının yapılandırma temelini gösterir; başvuru,
          dosya veya yapay zekâ özelliklerinin hazır olduğu anlamına gelmez.
        </p>
      </div>
    </section>
  );
}

const tabs = [
  ["general", "Genel"],
  ["categories", "Kategoriler"],
  ["templates", "Şablon Yapısı"],
  ["rubrics", "Rubrik"],
  ["readiness", "Hazırlık"],
] as const;

type Tab = (typeof tabs)[number][0];

export function SetupPage() {
  const { competitionId } = useParams();
  const [configuration, setConfiguration] = useState<CompetitionConfigurationResponse | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("general");
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
    return <main className="mx-auto max-w-4xl p-8">Yarışma kimliği bulunamadı.</main>;
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-8 sm:py-10">
      <Link className="text-sm font-semibold text-blue-700 hover:text-blue-900" to="/app">
        ← Yarışmalara dön
      </Link>
      <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Yarışma kurulumu</p>
          <h1 className="page-title">{configuration?.competition.name ?? "Yapılandırma"}</h1>
          <p className="mt-2 font-mono text-sm text-slate-500">
            {configuration?.competition.slug ?? competitionId}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {configuration ? (
            <span
              className={`rounded-full px-4 py-2 text-sm font-semibold ${
                configuration.readiness.ready
                  ? "bg-emerald-100 text-emerald-900"
                  : "bg-amber-100 text-amber-900"
              }`}
            >
              {configuration.readiness.ready ? "Yapılandırma hazır" : "Yapılandırma eksik"}
            </span>
          ) : null}
          <Link className="primary-button" to={`/app/competitions/${competitionId}/submissions`}>
            Başvurular
          </Link>
        </div>
      </div>

      <nav
        aria-label="Yarışma yapılandırma bölümleri"
        className="mt-8 overflow-x-auto border-b border-slate-200"
      >
        <div className="flex min-w-max gap-1">
          {tabs.map(([id, label]) => (
            <button
              aria-current={activeTab === id ? "page" : undefined}
              className={`border-b-2 px-4 py-3 text-sm font-semibold ${
                activeTab === id
                  ? "border-blue-700 text-blue-800"
                  : "border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900"
              }`}
              key={id}
              onClick={() => setActiveTab(id)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
      </nav>

      {error ? (
        <div
          className="mt-8 rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800"
          role="alert"
        >
          <p className="font-semibold">Yapılandırma yüklenemedi</p>
          <p className="mt-1">{error}</p>
          <button className="secondary-button mt-4" onClick={() => refresh()} type="button">
            Tekrar dene
          </button>
        </div>
      ) : null}

      {!configuration && !error ? (
        <div className="mt-8 setup-panel" role="status">
          Yapılandırma yükleniyor…
        </div>
      ) : null}

      {configuration ? (
        <div className="mt-8">
          {activeTab === "general" ? (
            <GeneralSection configuration={configuration} refresh={refresh} />
          ) : null}
          {activeTab === "categories" ? (
            <CategoriesSection configuration={configuration} refresh={refresh} />
          ) : null}
          {activeTab === "templates" ? (
            <TemplatesSection configuration={configuration} refresh={refresh} />
          ) : null}
          {activeTab === "rubrics" ? (
            <RubricsSection configuration={configuration} refresh={refresh} />
          ) : null}
          {activeTab === "readiness" ? <ReadinessSection configuration={configuration} /> : null}
        </div>
      ) : null}
    </main>
  );
}
