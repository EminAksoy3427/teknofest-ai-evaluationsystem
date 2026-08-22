import {
  type CompetitionConfigurationResponse,
  CompetitionConfigurationResponseSchema,
  CompetitionResponseSchema,
  type MembershipSummary,
  type ReviewOperationsItem,
  ReviewOperationsResponseSchema,
  type ReviewOperationsSummary,
} from "@teknofest-ai/shared";
import { type FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";

import { apiRequest, errorMessage } from "./api";
import { ROLE_LABELS, useMemberships } from "./app-shell";
import { Alert, EmptyState, MetricCard, Modal, PageHeader, slugFromName } from "./ui";

function MembershipRow({ membership }: { membership: MembershipSummary }) {
  const base = `/app/competitions/${membership.competitionId}`;
  const primaryLink =
    membership.role === "COMPETITION_MANAGER"
      ? { to: `${base}/submissions`, label: "Başvurular" }
      : membership.role === "EVALUATION_MANAGER"
        ? { to: `${base}/operations`, label: "Değerlendirme" }
        : membership.role === "REVIEWER"
          ? { to: "/app/review", label: "Atamalarım" }
          : { to: "/app/results", label: "Sonuçlarım" };

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-bold text-ink">{membership.competitionName}</p>
        <p className="mt-0.5 text-xs text-ink-subtle">{ROLE_LABELS[membership.role]}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {membership.role === "COMPETITION_MANAGER" ? (
          <Link className="secondary-button" to={`${base}/setup`}>
            Kurulum
          </Link>
        ) : null}
        {membership.role === "COMPETITION_MANAGER" || membership.role === "EVALUATION_MANAGER" ? (
          <Link className="secondary-button" to={`${base}/operations`}>
            Değerlendirme
          </Link>
        ) : null}
        <Link className="primary-button" to={primaryLink.to}>
          {primaryLink.label}
        </Link>
      </div>
    </li>
  );
}

function CompetitionCreateForm({ onCreated }: { onCreated: (id: string) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      const created = await apiRequest("/api/v1/competitions", CompetitionResponseSchema, {
        method: "POST",
        // The URL identifier is derived from the name; a person never types it.
        body: JSON.stringify({ name, slug: slugFromName(name), description }),
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
          onChange={(event) => setName(event.target.value)}
          required
          value={name}
        />
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
      <p className="field-help">
        Yarışmayı oluşturduğunuzda yarışma yöneticisi olursunuz ve kurulum adımlarına
        yönlendirilirsiniz.
      </p>
      {error ? (
        <p className="text-sm text-critical" role="alert">
          {error}
        </p>
      ) : null}
      <button className="primary-button justify-self-start" disabled={isSaving} type="submit">
        {isSaving ? "Oluşturuluyor…" : "Yarışmayı oluştur"}
      </button>
    </form>
  );
}

interface OperationalSnapshot {
  competitionId: string;
  items: ReviewOperationsItem[];
  summary: ReviewOperationsSummary;
  configuration: CompetitionConfigurationResponse | null;
}

/**
 * Operational overview for a single managed competition, derived entirely from
 * the existing review-operations and configuration reads. No new aggregates.
 */
function ManagedCompetitionOverview({ snapshot }: { snapshot: OperationalSnapshot }) {
  const { competitionId, configuration, items, summary } = snapshot;
  const base = `/app/competitions/${competitionId}`;
  const analysisCompleted = items.filter(
    (item) => item.analysis.latestRunStatus === "SUCCEEDED",
  ).length;
  const unassigned = items.filter((item) => item.reviewers.length === 0).length;
  const submittedEvaluations = items.filter((item) =>
    item.reviewers.some((reviewer) => reviewer.evaluationStatus === "SUBMITTED"),
  ).length;
  const analysisPendingOrFailed = items.filter(
    (item) => item.analysis.latestRunStatus !== "SUCCEEDED",
  ).length;

  const nextSteps: { key: string; label: string; to: string; cta: string }[] = [];
  if (configuration && !configuration.readiness.ready) {
    nextSteps.push({
      key: "setup",
      label: "Yarışma kurulumu tamamlanmadı.",
      to: `${base}/setup`,
      cta: "Kuruluma git",
    });
  }
  if (unassigned > 0) {
    nextSteps.push({
      key: "unassigned",
      label: `${unassigned} başvuruya henüz hakem atanmadı.`,
      to: `${base}/reviewers`,
      cta: "Hakem ata",
    });
  }
  if (analysisPendingOrFailed > 0) {
    nextSteps.push({
      key: "analysis",
      label: `${analysisPendingOrFailed} başvurunun analizi tamamlanmadı veya sonuçlanamadı.`,
      to: `${base}/submissions`,
      cta: "Başvuruları aç",
    });
  }
  if (summary.high > 0) {
    nextSteps.push({
      key: "high",
      label: `${summary.high} başvuru yüksek inceleme önceliğinde.`,
      to: `${base}/operations`,
      cta: "Kuyruğu aç",
    });
  }

  return (
    <section aria-labelledby="overview-title" className="mt-8">
      <h2 className="section-title" id="overview-title">
        Operasyon durumu
      </h2>
      <div className="metrics-strip mt-4 sm:grid-cols-4">
        <MetricCard label="Başvurular" value={String(items.length)} />
        <MetricCard
          hint={`${items.length} başvurunun ${analysisCompleted} tanesi`}
          label="Analiz tamamlandı"
          value={String(analysisCompleted)}
        />
        <MetricCard
          label="Yüksek öncelik"
          tone={summary.high > 0 ? "warn" : "neutral"}
          value={String(summary.high)}
        />
        <MetricCard
          hint="En az bir hakem değerlendirmesi gönderilen başvuru"
          label="Hakem değerlendirmesi"
          value={String(submittedEvaluations)}
        />
      </div>

      <section aria-labelledby="next-steps-title" className="mt-8">
        <h3 className="text-base font-semibold text-ink" id="next-steps-title">
          Öncelikli işler
        </h3>
        {nextSteps.length === 0 ? (
          <p className="mt-2 text-sm leading-6 text-ink-muted">
            Bekleyen bir işlem görünmüyor. Kuyruğun tamamı için Değerlendirme sayfasını
            kullanabilirsiniz.
          </p>
        ) : (
          <ul className="surface-panel mt-3 divide-y divide-line">
            {nextSteps.map((step) => (
              <li
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                key={step.key}
              >
                <span className="text-sm text-ink">{step.label}</span>
                <Link className="secondary-button" to={step.to}>
                  {step.cta}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { error, memberships, refresh } = useMemberships();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<OperationalSnapshot | null>(null);

  // With exactly one managed competition, surface its operational state here.
  const managed = (memberships ?? []).filter(
    (entry) => entry.role === "COMPETITION_MANAGER" || entry.role === "EVALUATION_MANAGER",
  );
  const single = managed.length === 1 ? managed[0] : null;
  const canOfferCreate =
    memberships !== null &&
    (memberships.length === 0 || memberships.some((entry) => entry.role === "COMPETITION_MANAGER"));

  useEffect(() => {
    if (!single) {
      setSnapshot(null);
      return;
    }
    let active = true;
    const competitionId = single.competitionId;
    const loadConfiguration =
      single.role === "COMPETITION_MANAGER"
        ? apiRequest(
            `/api/v1/competitions/${competitionId}/configuration`,
            CompetitionConfigurationResponseSchema,
          ).catch(() => null)
        : Promise.resolve(null);
    Promise.all([
      apiRequest(
        `/api/v1/competitions/${competitionId}/review-operations`,
        ReviewOperationsResponseSchema,
      ),
      loadConfiguration,
    ])
      .then(([operations, configuration]) => {
        if (!active) return;
        setSnapshot({
          competitionId,
          items: [...operations.items],
          summary: operations.summary,
          configuration,
        });
      })
      .catch(() => {
        // The overview is a convenience; the membership list below still works.
        if (active) setSnapshot(null);
      });
    return () => {
      active = false;
    };
  }, [single]);

  return (
    <div className="layout-dashboard">
      <PageHeader
        actions={
          canOfferCreate ? (
            <button className="primary-button" onClick={() => setIsCreateOpen(true)} type="button">
              Yeni yarışma
            </button>
          ) : null
        }
        lead={
          single
            ? single.competitionName
            : "Yarışmalarınızın güncel durumu ve devam eden işleriniz."
        }
        title="Genel Bakış"
      />

      {error ? (
        <div className="mt-6">
          <Alert tone="error">{error}</Alert>
        </div>
      ) : null}

      {memberships === null && !error ? (
        <p className="mt-6 text-sm text-ink-muted" role="status">
          Yarışmalarınız yükleniyor…
        </p>
      ) : null}

      {memberships?.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            action={
              <button
                className="primary-button"
                onClick={() => setIsCreateOpen(true)}
                type="button"
              >
                Yeni yarışma
              </button>
            }
            description="Bir yarışmaya davet edildiğinizde burada görünür. Kendi yarışmanızı da oluşturabilirsiniz; oluşturduğunuz yarışmanın yöneticisi olursunuz."
            title="Henüz yarışma üyeliğiniz yok"
          />
        </div>
      ) : null}

      {snapshot ? <ManagedCompetitionOverview snapshot={snapshot} /> : null}

      {memberships && memberships.length > 0 ? (
        <section aria-labelledby="memberships-title" className="mt-8">
          <h2 className="section-title" id="memberships-title">
            Yarışmalarınız
          </h2>
          <ul className="surface-panel mt-4 divide-y divide-line">
            {memberships.map((membership) => (
              <MembershipRow
                key={`${membership.competitionId}-${membership.role}`}
                membership={membership}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {isCreateOpen ? (
        <Modal labelledBy="create-competition-title" onClose={() => setIsCreateOpen(false)}>
          <h2 className="section-title" id="create-competition-title">
            Yeni yarışma
          </h2>
          <p className="mt-1 text-sm leading-6 text-ink-muted">
            Yarışmayı adlandırın; kategorileri, rapor formatını ve rubriği kurulum adımlarında
            tanımlayacaksınız.
          </p>
          <div className="mt-5">
            <CompetitionCreateForm
              onCreated={(competitionId) => {
                setIsCreateOpen(false);
                refresh();
                navigate(`/app/competitions/${competitionId}/setup`);
              }}
            />
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
