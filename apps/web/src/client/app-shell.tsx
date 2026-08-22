import { MembershipListResponseSchema, type MembershipSummary } from "@teknofest-ai/shared";
import {
  createContext,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, matchPath, useLocation, useNavigate } from "react-router";

import { apiRequest, errorMessage } from "./api";
import { authClient } from "./auth-client";
import { ROLE_LABELS } from "./profile-memberships";
import { BrandWordmark, IconClose, IconMenu, UserAvatar, useDismissable } from "./ui";

export { ROLE_LABELS } from "./profile-memberships";

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

export function AccountMenuPanel({
  email,
  image,
  isSigningOut,
  name,
  onKeyDown,
  onNavigate,
  onSignOut,
}: {
  email: string;
  image?: string | null | undefined;
  isSigningOut: boolean;
  name: string;
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
  onNavigate?: () => void;
  onSignOut: () => void;
}) {
  return (
    <div className="user-menu-panel" onKeyDown={onKeyDown} role="menu">
      <div className="flex items-center gap-3 px-2.5 py-2.5">
        <UserAvatar image={image} name={name} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{name}</p>
          <p className="truncate text-xs text-ink-subtle">{email}</p>
        </div>
      </div>
      <Link className="user-menu-item" onClick={onNavigate} role="menuitem" to="/app/profile">
        Profilim
      </Link>
      <Link className="user-menu-item" onClick={onNavigate} role="menuitem" to="/app/profile#roles">
        Roller ve Yarışmalar
      </Link>
      <div className="my-1.5 border-t border-line" />
      <button
        className="user-menu-item text-ink-muted"
        disabled={isSigningOut}
        onClick={onSignOut}
        role="menuitem"
        type="button"
      >
        {isSigningOut ? "Çıkılıyor…" : "Çıkış yap"}
      </button>
    </div>
  );
}

export function UserMenu({
  email,
  image,
  name,
}: {
  email: string;
  image?: string | null | undefined;
  name: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const triggerId = useId();
  const { ref } = useDismissable(isOpen, () => setIsOpen(false));
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const panel = ref.current?.querySelector<HTMLElement>("[role='menuitem']");
    panel?.focus();

    function onFocusIn(event: FocusEvent) {
      if (!ref.current?.contains(event.target as Node)) setIsOpen(false);
    }
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, [isOpen, ref]);

  return (
    <div className="user-menu" ref={ref}>
      <button
        aria-controls="account-menu"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label={`${name} hesap menüsü`}
        className="flex items-center gap-2 rounded-md py-1 pr-1 pl-1.5 hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        id={triggerId}
        onClick={() => setIsOpen((open) => !open)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !isOpen) {
            event.preventDefault();
            setIsOpen(true);
          }
        }}
        ref={triggerRef}
        type="button"
      >
        <span
          className="hidden max-w-40 truncate text-[13px] font-medium text-ink sm:block"
          title={email}
        >
          {name}
        </span>
        <UserAvatar image={image} name={name} />
      </button>
      {isOpen ? (
        <div id="account-menu">
          <AccountMenuPanel
            email={email}
            image={image}
            isSigningOut={isSigningOut}
            name={name}
            onKeyDown={(event) => {
              const items = Array.from(
                event.currentTarget.querySelectorAll<HTMLElement>("[role='menuitem']"),
              );
              const current = document.activeElement;
              const index = current instanceof HTMLElement ? items.indexOf(current) : -1;
              if (event.key === "ArrowDown") {
                event.preventDefault();
                items[(index + 1) % items.length]?.focus();
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                items[(index - 1 + items.length) % items.length]?.focus();
              } else if (event.key === "Home") {
                event.preventDefault();
                items[0]?.focus();
              } else if (event.key === "End") {
                event.preventDefault();
                items.at(-1)?.focus();
              } else if (event.key === "Tab") {
                setIsOpen(false);
                triggerRef.current?.focus();
              }
            }}
            onNavigate={() => {
              setIsOpen(false);
              triggerRef.current?.focus();
            }}
            onSignOut={() => {
              setIsSigningOut(true);
              void authClient.signOut().then(() => {
                window.location.assign("/");
              });
            }}
          />
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
export function AppShell({ children }: { children: ReactNode }) {
  const { data: session } = authClient.useSession();
  const { memberships, error } = useMemberships();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const location = useLocation();
  const name = session?.user.name ?? "";
  const email = session?.user.email ?? "";
  const image = session?.user.image ?? null;

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
            <UserMenu email={email} image={image} name={name} />
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
