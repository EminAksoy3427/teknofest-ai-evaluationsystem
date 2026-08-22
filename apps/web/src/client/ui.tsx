import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router";

/**
 * Small shared presentation primitives for the product UI.
 *
 * Presentation only: nothing here grants access. Every screen using these
 * components still relies on server-side, competition-scoped authorization.
 */

export function BrandWordmark({
  compact = false,
  to = "/app",
}: {
  compact?: boolean;
  to?: string;
}) {
  return (
    <Link
      className="min-w-0 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      to={to}
    >
      <span className="block truncate text-[15px] font-semibold tracking-tight text-ink">
        TEKNOFEST AI
      </span>
      {compact ? null : (
        <span className="block truncate text-[11px] text-ink-subtle">Değerlendirme Platformu</span>
      )}
    </Link>
  );
}

export function IconMenu({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 20 20">
      <path
        d="M3.5 5.5h13M3.5 10h13M3.5 14.5h13"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

export function IconClose({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 20 20">
      <path
        d="m5 5 10 10M15 5 5 15"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "";
  return `${first}${last}`.toLocaleUpperCase("tr-TR");
}

export function InitialsAvatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden="true"
      className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-selected text-[11px] font-semibold text-brand-deep"
    >
      {initialsFromName(name)}
    </span>
  );
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

export function PageHeader({
  actions,
  lead,
  title,
}: {
  actions?: ReactNode | undefined;
  lead?: string | undefined;
  title: string;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="page-title">{title}</h1>
        {lead ? <p className="page-lead">{lead}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Alert({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "error" | "info" | "success";
}) {
  const toneClass =
    tone === "error" ? "alert-error" : tone === "success" ? "alert-success" : "alert-info";
  return (
    <div className={toneClass} role={tone === "error" ? "alert" : "status"}>
      {children}
    </div>
  );
}

export function EmptyState({
  action,
  description,
  title,
}: {
  action?: ReactNode | undefined;
  description: string;
  title: string;
}) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      <p className="mt-1">{description}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function StatusChip({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "pass" | "warn" | "fail" | "info" | "neutral";
}) {
  return <span className={`status-chip status-chip-${tone}`}>{children}</span>;
}

export function MetricCard({
  hint,
  label,
  tone = "neutral",
  value,
}: {
  hint?: string | undefined;
  label: string;
  tone?: "neutral" | "brand" | "warn" | "critical" | "success" | undefined;
  value: string;
}) {
  const valueClass =
    tone === "critical"
      ? "text-critical"
      : tone === "warn"
        ? "text-warning-ink"
        : tone === "success"
          ? "text-success-ink"
          : tone === "brand"
            ? "text-brand-deep"
            : "text-ink";
  return (
    <div className="metric-cell">
      <p className="metric-label">{label}</p>
      <p className={`metric-value ${valueClass}`}>{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-ink-subtle">{hint}</p> : null}
    </div>
  );
}

export function FileDropzone({
  accept = "application/pdf,.pdf",
  disabled = false,
  file,
  hint = "PDF · En fazla 20 MB",
  id,
  label,
  name,
  onFile,
  required = false,
}: {
  accept?: string;
  disabled?: boolean;
  file: File | null;
  hint?: string;
  id: string;
  label: string;
  name?: string | undefined;
  onFile(file: File | null): void;
  required?: boolean;
}) {
  const [isDragging, setIsDragging] = useState(false);

  function takeFile(next: File | null) {
    if (disabled) return;
    onFile(next);
  }

  return (
    <div>
      <p className="field-label" id={`${id}-label`}>
        {label}
      </p>
      <label
        className="file-dropzone"
        data-active={isDragging ? "true" : "false"}
        htmlFor={id}
        onDragEnter={(event) => {
          event.preventDefault();
          if (!disabled) setIsDragging(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setIsDragging(false);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          takeFile(event.dataTransfer.files[0] ?? null);
        }}
      >
        <input
          accept={accept}
          aria-describedby={`${id}-hint`}
          aria-labelledby={`${id}-label`}
          disabled={disabled}
          id={id}
          name={name}
          onChange={(event) => takeFile(event.target.files?.[0] ?? null)}
          required={required && file === null}
          type="file"
        />
        {file ? (
          <div className="pointer-events-none relative z-10">
            <p className="text-sm font-medium text-ink">{file.name}</p>
            <p className="mt-1 text-xs text-ink-subtle">{formatFileSize(file.size)}</p>
          </div>
        ) : (
          <div className="pointer-events-none relative z-10">
            <p className="text-sm font-medium text-ink">Dosya seçin veya buraya bırakın</p>
            <p className="mt-1 text-xs text-ink-subtle" id={`${id}-hint`}>
              {hint}
            </p>
          </div>
        )}
      </label>
    </div>
  );
}

/**
 * Minimal accessible modal: labelled dialog, Escape/overlay close, initial
 * focus, and focus kept inside while open.
 */
export function Modal({
  children,
  labelledBy,
  onClose,
}: {
  children: ReactNode;
  labelledBy: string;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusable = dialog.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    focusable[0]?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab" || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }

    dialog.addEventListener("keydown", onKeyDown);
    return () => {
      dialog.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <button
        aria-label="Pencereyi kapat"
        className="modal-overlay"
        onClick={onClose}
        type="button"
      />
      <div className="relative mx-auto my-10 w-full max-w-lg px-4">
        <div
          aria-labelledby={labelledBy}
          aria-modal="true"
          className="modal-panel"
          ref={dialogRef}
          role="dialog"
        >
          <button
            aria-label="Kapat"
            className="icon-button absolute top-3 right-3"
            onClick={onClose}
            type="button"
          >
            <IconClose />
          </button>
          {children}
        </div>
      </div>
    </div>
  );
}

export function WorkflowSteps({ current, steps }: { current: number; steps: readonly string[] }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-subtle">
      {steps.map((step, index) => (
        <li className="flex items-center gap-2" key={step}>
          {index > 0 ? <span aria-hidden="true">→</span> : null}
          <span className={index === current ? "font-medium text-ink" : undefined}>{step}</span>
        </li>
      ))}
    </ol>
  );
}

export function REPORT_LANGUAGE_OPTIONS() {
  return [
    { value: "tr", label: "Türkçe" },
    { value: "en", label: "İngilizce" },
  ] as const;
}

export function languageSelectOptions(current: string): { value: string; label: string }[] {
  const known = REPORT_LANGUAGE_OPTIONS();
  if (known.some((option) => option.value === current) || current === "") return [...known];
  return [...known, { value: current, label: current }];
}

export function slugFromName(value: string) {
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

export function useDismissable(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const labelled = useId();

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) onClose();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return { labelled, ref };
}
