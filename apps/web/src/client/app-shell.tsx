import { MembershipListResponseSchema, type MembershipSummary } from "@teknofest-ai/shared";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Link, matchPath, useLocation, useNavigate } from "react-router";

import { apiRequest, errorMessage } from "./api";
import { authClient } from "./auth-client";
import { BrandWordmark, IconClose, IconMenu, InitialsAvatar, useDismissable } from "./ui";

/** Role names shown to a person, instead of the raw enum value. */
export const ROLE_LABELS = {
  COMPETITION_MANAGER: "Yarışma yöneticisi",
  EVALUATION_MANAGER: "Değerlendirme yöneticisi",
  REVIEWER: "Hakem",
  CONTESTANT: "Yarışmacı",
} as const satisfies Record<MembershipSummary["role"], string>;

interface MembershipsState {
  memberships: MembershipSummary[] | null;
  error: string | null;
  refresh: () => void;
}

const MembershipsContext = createContext<MembershipsState>({
  memberships: null,
  error: null,
  refresh: () => undefined,
});

/**
 * Loads the session user's competition memberships once for the whole shell.
 *
 * Membership data drives which navigation the shell RENDERS; it never grants
 * access. Every route re-authorizes on the server against competition-scoped
 * membership, so hiding or showing a link here is convenience only.
 */
export function MembershipsProvider({ children }: { children: ReactNode }) {
  const [memberships, setMemberships] = useState<MembershipSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    void reloadKey;
    apiRequest("/api/v1/me/memberships", MembershipListResponseSchema)
      .then((response) => {
        if (active) {
          setMemberships(response.memberships);
          setError(null);
        }
      })
      .catch((caught) => {
        if (active) setError(errorMessage(caught));
      });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  const refresh = useCallback(() => setReloadKey((value) => value + 1), []);
  const state = useMemo(() => ({ memberships, error, refresh }), [memberships, error, refresh]);

  return <MembershipsContext.Provider value={state}>{children}</MembershipsContext.Provider>;
}

export function useMemberships(): MembershipsState {
  return useContext(MembershipsContext);
}

function useActiveCompetition(memberships: MembershipSummary[] | null): {
  competitionId: string | null;
  membership: MembershipSummary | null;
} {
  const location = useLocation();
  const match = matchPath({ path: "/app/competitions/:competitionId/*" }, location.pathname);
  const routeCompetitionId = match?.params.competitionId ?? null;

  if (routeCompetitionId) {
    return {
      competitionId: routeCompetitionId,
      membership: memberships?.find((entry) => entry.competitionId === routeCompetitionId) ?? null,
    };
  }

  const managed = (memberships ?? []).filter(
    (entry) => entry.role === "COMPETITION_MANAGER" || entry.role === "EVALUATION_MANAGER",
  );
  if (managed.length === 1 && managed[0]) {
    return { competitionId: managed[0].competitionId, membership: managed[0] };
  }
  return { competitionId: null, membership: null };
}

function SidebarLink({
  label,
  to,
  onNavigate,
}: {
  label: string;
  to: string;
  onNavigate?: (() => void) | undefined;
}) {
  const location = useLocation();
  const isActive =
    location.pathname === to || (to !== "/app" && location.pathname.startsWith(`${to}/`));
  return (
    <Link
      aria-current={isActive ? "page" : undefined}
      className={`sidebar-link ${isActive ? "sidebar-link-active" : ""}`}
      onClick={onNavigate}
      to={to}
    >
      {label}
    </Link>
  );
}

/**
 * Presentation-only navigation labels. Hiding a link is never an authorization boundary.
 */
export function navigationLabelsFor(
  memberships: readonly MembershipSummary[],
  activeCompetitionId: string | null,
): string[] {
  const labels = ["Genel Bakış"];
  const membership =
    memberships.find((entry) => entry.competitionId === activeCompetitionId) ?? null;
  if (
    activeCompetitionId &&
    (membership?.role === "COMPETITION_MANAGER" || membership?.role === "EVALUATION_MANAGER")
  ) {
    if (membership.role === "COMPETITION_MANAGER") {
      labels.push("Kurulum", "Başvurular");
    }
    labels.push("Hakemler", "Değerlendirme");
  }
  if (memberships.some((entry) => entry.role === "REVIEWER")) labels.push("Atamalarım");
  if (memberships.some((entry) => entry.role === "CONTESTANT")) labels.push("Sonuçlarım");
  return labels;
}

function SidebarNav({
  memberships,
  onNavigate,
}: {
  memberships: MembershipSummary[] | null;
  onNavigate?: () => void;
}) {
  const { competitionId, membership } = useActiveCompetition(memberships);
  const all = memberships ?? [];
  const isCompetitionManager = membership?.role === "COMPETITION_MANAGER";
  const isManagerHere =
    membership?.role === "COMPETITION_MANAGER" || membership?.role === "EVALUATION_MANAGER";
  const hasReviewerRole = all.some((entry) => entry.role === "REVIEWER");
  const hasContestantRole = all.some((entry) => entry.role === "CONTESTANT");

  return (
    <nav aria-label="Ana gezinme" className="flex flex-col gap-0.5 px-3 pb-6">
      <SidebarLink label="Genel Bakış" onNavigate={onNavigate} to="/app" />

      {competitionId && isManagerHere ? (
        <>
          <div className="sidebar-section-label">
            <p className="truncate text-[13px] font-medium text-ink">
              {membership?.competitionName ?? "Yarışma"}
            </p>
            {membership ? (
              <p className="mt-0.5 truncate text-[11px] font-normal text-ink-subtle">
                {ROLE_LABELS[membership.role]}
              </p>
            ) : null}
          </div>
          {isCompetitionManager ? (
            <SidebarLink
              label="Kurulum"
              onNavigate={onNavigate}
              to={`/app/competitions/${competitionId}/setup`}
            />
          ) : null}
          {isCompetitionManager ? (
            <SidebarLink
              label="Başvurular"
              onNavigate={onNavigate}
              to={`/app/competitions/${competitionId}/submissions`}
            />
          ) : null}
          <SidebarLink
            label="Hakemler"
            onNavigate={onNavigate}
            to={`/app/competitions/${competitionId}/reviewers`}
          />
          <SidebarLink
            label="Değerlendirme"
            onNavigate={onNavigate}
            to={`/app/competitions/${competitionId}/operations`}
          />
        </>
      ) : null}

      {hasReviewerRole ? (
        <SidebarLink label="Atamalarım" onNavigate={onNavigate} to="/app/review" />
      ) : null}
      {hasContestantRole ? (
        <SidebarLink label="Sonuçlarım" onNavigate={onNavigate} to="/app/results" />
      ) : null}
    </nav>
  );
}

function uniqueManagedCompetitions(memberships: MembershipSummary[]): MembershipSummary[] {
  const seen = new Map<string, MembershipSummary>();
  for (const entry of memberships) {
    if (entry.role !== "COMPETITION_MANAGER" && entry.role !== "EVALUATION_MANAGER") continue;
    if (!seen.has(entry.competitionId)) seen.set(entry.competitionId, entry);
  }
  return [...seen.values()];
}

function CompetitionSwitcher({ memberships }: { memberships: MembershipSummary[] | null }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { competitionId } = useActiveCompetition(memberships);
  const managed = uniqueManagedCompetitions(memberships ?? []);

  if (managed.length <= 1) return null;

  const section = location.pathname.match(/\/app\/competitions\/[^/]+(\/[^/]+)?/)?.[1] ?? "";
  return (
    <div className="min-w-0">
      <label className="sr-only" htmlFor="competition-switcher">
        Yarışma
      </label>
      <select
        className="field-input max-w-72 py-1.5 text-sm"
        id="competition-switcher"
        onChange={(event) => {
          const next = event.target.value;
          const nextSection =
            section === "/setup" &&
            managed.find((entry) => entry.competitionId === next)?.role !== "COMPETITION_MANAGER"
              ? "/operations"
              : section || "/operations";
          navigate(`/app/competitions/${next}${nextSection}`);
        }}
        value={competitionId ?? ""}
      >
        {competitionId ? null : <option value="">Yarışma seçin</option>}
        {managed.map((entry) => (
          <option key={entry.competitionId} value={entry.competitionId}>
            {entry.competitionName}
          </option>
        ))}
      </select>
    </div>
  );
}

function UserMenu({ email, name }: { email: string; name: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const { ref } = useDismissable(isOpen, () => setIsOpen(false));

  return (
    <div className="user-menu" ref={ref}>
      <button
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-md py-1 pr-1 pl-1.5 hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        onClick={() => setIsOpen((open) => !open)}
        type="button"
      >
        <span
          className="hidden max-w-40 truncate text-[13px] font-medium text-ink sm:block"
          title={email}
        >
          {name}
        </span>
        <InitialsAvatar name={name} />
      </button>
      {isOpen ? (
        <div className="user-menu-panel" role="menu">
          <div className="px-2.5 py-2">
            <p className="truncate text-sm font-medium text-ink">{name}</p>
            <p className="truncate text-xs text-ink-subtle">{email}</p>
          </div>
          <button
            className="ghost-button w-full justify-start px-2.5 text-left"
            disabled={isSigningOut}
            onClick={async () => {
              setIsSigningOut(true);
              await authClient.signOut();
              window.location.assign("/");
            }}
            role="menuitem"
            type="button"
          >
            {isSigningOut ? "Çıkılıyor…" : "Çıkış yap"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function SidebarBrand() {
  return (
    <div className="px-5 py-5">
      <BrandWordmark />
    </div>
  );
}

/**
 * Authenticated application shell: left sidebar on desktop, drawer on smaller
 * screens, and a quiet top utility bar.
 */
export function AppShell({
  children,
  email,
  name,
}: {
  children: ReactNode;
  email: string;
  name: string;
}) {
  const { memberships, error } = useMemberships();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    void location.pathname;
    setIsMenuOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[15.5rem_1fr]">
      <a className="sr-only" href="#main-content">
        İçeriğe geç
      </a>
      <aside className="hidden bg-surface lg:flex lg:flex-col lg:border-r lg:border-line">
        <SidebarBrand />
        <SidebarNav memberships={memberships} />
      </aside>

      {isMenuOpen ? (
        <>
          <button
            aria-label="Menüyü kapat"
            className="mobile-nav-backdrop"
            onClick={() => setIsMenuOpen(false)}
            type="button"
          />
          <div className="mobile-nav-drawer" id="mobile-nav">
            <div className="flex items-center justify-between px-4 py-4">
              <BrandWordmark />
              <button className="icon-button" onClick={() => setIsMenuOpen(false)} type="button">
                <IconClose />
                <span className="sr-only">Menüyü kapat</span>
              </button>
            </div>
            <SidebarNav memberships={memberships} onNavigate={() => setIsMenuOpen(false)} />
          </div>
        </>
      ) : null}

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 border-b border-line bg-surface">
          <div className="flex items-center justify-between gap-3 px-4 py-2 sm:px-6">
            <div className="flex min-w-0 items-center gap-2">
              <button
                aria-controls="mobile-nav"
                aria-expanded={isMenuOpen}
                className="icon-button lg:hidden"
                onClick={() => setIsMenuOpen((open) => !open)}
                type="button"
              >
                <IconMenu />
                <span className="sr-only">Menüyü aç</span>
              </button>
              <div className="lg:hidden">
                <BrandWordmark compact />
              </div>
              <CompetitionSwitcher memberships={memberships} />
            </div>
            <UserMenu email={email} name={name} />
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8" id="main-content">
          {error ? (
            <div className="alert-error mb-4" role="alert">
              Üyelik bilgileri yüklenemedi: {error}
            </div>
          ) : null}
          {children}
        </main>
      </div>
    </div>
  );
}
