import { Link } from "react-router";

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
            <span aria-current="page" className="text-ink">
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
