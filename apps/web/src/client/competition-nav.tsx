import { Link } from "react-router";

/**
 * Shared navigation for the two product journeys, so neither ends in a dead end.
 *
 * Manager: Yarışma → Yapılandırma → Başvurular → Hakem Atamaları → Değerlendirme Operasyonu
 * Reviewer: Atamalarım → Başvuruyu Aç → Çalışma alanı
 *
 * Presentation only. Showing or hiding a link is never an authorization boundary: every target
 * route re-authorizes the session against competition-scoped membership on the server, so a link a
 * user should not follow returns 403 rather than relying on the menu to hide it.
 */

export interface BreadcrumbStep {
  label: string;
  /** Omitted for the current page, which is rendered as plain text. */
  to?: string;
}

export function Breadcrumb({ trail }: { trail: readonly BreadcrumbStep[] }) {
  return (
    <nav aria-label="Sayfa yolu" className="breadcrumb">
      {trail.map((step, index) => (
        <span className="flex items-center gap-1.5" key={step.label}>
          {index > 0 ? <span aria-hidden="true">/</span> : null}
          {step.to === undefined ? (
            <span aria-current="page" className="text-slate-700">
              {step.label}
            </span>
          ) : (
            <Link to={step.to}>{step.label}</Link>
          )}
        </span>
      ))}
    </nav>
  );
}

export const MANAGER_STEPS = [
  { key: "setup", label: "Yapılandırma", path: "setup" },
  { key: "submissions", label: "Başvurular", path: "submissions" },
  { key: "reviewers", label: "Hakem Atamaları", path: "reviewers" },
  { key: "operations", label: "Değerlendirme Operasyonu", path: "operations" },
] as const;

export type ManagerStepKey = (typeof MANAGER_STEPS)[number]["key"];

/**
 * The manager journey as a tab strip. The current step is marked with `aria-current` in addition to
 * its styling, so the position in the flow is not conveyed by colour alone.
 */
export function ManagerStepNav({
  competitionId,
  current,
}: {
  competitionId: string;
  current: ManagerStepKey;
}) {
  return (
    <nav aria-label="Yarışma yönetim akışı" className="mt-5 border-b border-slate-200">
      <ul className="-mb-px flex flex-wrap gap-x-1 gap-y-2">
        {MANAGER_STEPS.map((step) => {
          const isCurrent = step.key === current;
          return (
            <li key={step.key}>
              <Link
                aria-current={isCurrent ? "page" : undefined}
                className={`inline-flex rounded-t-lg border-b-2 px-3 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 ${
                  isCurrent
                    ? "border-blue-700 text-blue-900"
                    : "border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900"
                }`}
                to={`/app/competitions/${competitionId}/${step.path}`}
              >
                {step.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
