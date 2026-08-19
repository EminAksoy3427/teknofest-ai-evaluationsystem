import {
  CompetitionResponseSchema,
  MembershipListResponseSchema,
  type MembershipSummary,
} from "@teknofest-ai/shared";
import { type FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";

import { apiRequest, errorMessage } from "./api";

function slugFromName(value: string) {
  return value
    .toLocaleLowerCase("tr-TR")
    .replaceAll("ı", "i")
    .replaceAll("ğ", "g")
    .replaceAll("ü", "u")
    .replaceAll("ş", "s")
    .replaceAll("ö", "o")
    .replaceAll("ç", "c")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function MembershipCard({ membership }: { membership: MembershipSummary }) {
  const canConfigure = membership.role === "COMPETITION_MANAGER";

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.16em] text-slate-500 uppercase">
            {membership.competitionSlug}
          </p>
          <h2 className="mt-1 text-lg font-semibold text-slate-950">
            {membership.competitionName}
          </h2>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
          {membership.role}
        </span>
      </div>
      {canConfigure ? (
        <Link
          className="mt-5 inline-flex rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
          to={`/app/competitions/${membership.competitionId}/setup`}
        >
          Yapılandırmayı aç
        </Link>
      ) : (
        <p className="mt-5 text-sm leading-6 text-slate-600">
          Bu role ait ürün alanı sonraki aşamada açılacak. Yarışma yapılandırması yalnız yarışma
          yöneticisine açıktır.
        </p>
      )}
    </article>
  );
}

function CompetitionCreateForm({ onCreated }: { onCreated: (id: string) => void }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      const created = await apiRequest("/api/v1/competitions", CompetitionResponseSchema, {
        method: "POST",
        body: JSON.stringify({ name, slug, description }),
      });
      onCreated(created.id);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={submit}>
      <div>
        <label className="field-label" htmlFor="competition-name">
          Yarışma adı
        </label>
        <input
          className="field-input"
          id="competition-name"
          maxLength={160}
          onChange={(event) => {
            const next = event.target.value;
            setName(next);
            if (!slugEdited) setSlug(slugFromName(next));
          }}
          required
          value={name}
        />
      </div>
      <div>
        <label className="field-label" htmlFor="competition-slug">
          Slug
        </label>
        <input
          className="field-input font-mono"
          id="competition-slug"
          maxLength={80}
          onChange={(event) => {
            setSlugEdited(true);
            setSlug(event.target.value);
          }}
          pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
          required
          value={slug}
        />
        <p className="field-help">Küçük harf, rakam ve tire kullanın.</p>
      </div>
      <div>
        <label className="field-label" htmlFor="competition-description">
          Kısa açıklama
        </label>
        <textarea
          className="field-input min-h-24"
          id="competition-description"
          maxLength={2000}
          onChange={(event) => setDescription(event.target.value)}
          value={description}
        />
      </div>
      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      <button className="primary-button justify-self-start" disabled={isSaving} type="submit">
        {isSaving ? "Oluşturuluyor…" : "Yarışma oluştur"}
      </button>
    </form>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  const [memberships, setMemberships] = useState<MembershipSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiRequest("/api/v1/me/memberships", MembershipListResponseSchema)
      .then((response) => {
        if (active) setMemberships(response.memberships);
      })
      .catch((caught) => {
        if (active) setError(errorMessage(caught));
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
      <div className="max-w-3xl">
        <p className="eyebrow">Yarışma çalışma alanı</p>
        <h1 className="page-title">Yarışmalarınız</h1>
        <p className="page-lead">
          Üyeliklerinizi görüntüleyin veya yeni bir yarışma yapılandırması başlatın.
        </p>
      </div>

      {error ? (
        <div
          className="mt-8 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      <section aria-labelledby="memberships-title" className="mt-10">
        <h2 className="section-title" id="memberships-title">
          Üyelikler
        </h2>
        {memberships === null && !error ? (
          <p className="mt-4 text-sm text-slate-600" role="status">
            Üyelikler yükleniyor…
          </p>
        ) : null}
        {memberships?.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white p-6">
            <h3 className="font-semibold text-slate-950">Henüz yarışma üyeliğiniz yok</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Aşağıdaki formdan ilk yarışmanızı oluşturduğunuzda bu yarışmanın yöneticisi olursunuz.
            </p>
          </div>
        ) : null}
        {memberships && memberships.length > 0 ? (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {memberships.map((membership) => (
              <MembershipCard key={membership.competitionId} membership={membership} />
            ))}
          </div>
        ) : null}
      </section>

      <section
        aria-labelledby="create-title"
        className="mt-12 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
      >
        <div className="mb-6 max-w-2xl">
          <p className="eyebrow">MVP tenant bootstrap</p>
          <h2 className="section-title" id="create-title">
            Yeni yarışma oluştur
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Yarışma ve size ait yarışma yöneticisi üyeliği tek atomik işlemde oluşturulur.
          </p>
        </div>
        <CompetitionCreateForm
          onCreated={(competitionId) => navigate(`/app/competitions/${competitionId}/setup`)}
        />
      </section>
    </main>
  );
}
