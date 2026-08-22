import type { MembershipSummary } from "@teknofest-ai/shared";
import { type FormEvent, useEffect, useId, useState } from "react";
import { Link, useLocation } from "react-router";

import { useMemberships } from "./app-shell";
import { authClient } from "./auth-client";
import {
  authErrorMessage,
  confirmPasswordValidationMessage,
  EMAIL_CHANGE_UNAVAILABLE_MESSAGE,
  hasAuthProvider,
} from "./auth-password";
import {
  DISPLAY_NAME_MAX_LENGTH,
  displayNameValidationMessage,
  normalizeDisplayName,
} from "./display-name";
import { PasswordField } from "./password-field";
import {
  authenticationMethodSummary,
  listedAuthenticationMethods,
  membershipWorkspace,
  ROLE_LABELS,
} from "./profile-memberships";
import { UserAvatar } from "./ui";

type SaveStatus = "idle" | "saving" | "saved" | "error";

export const ACCOUNT_SECTIONS = [
  { id: "profile", hash: "profile", label: "Profil", shortLabel: "Profil" },
  { id: "security", hash: "security", label: "Güvenlik", shortLabel: "Güvenlik" },
  { id: "roles", hash: "roles", label: "Roller ve Yarışmalar", shortLabel: "Roller" },
  { id: "account", hash: "account", label: "Hesap", shortLabel: "Hesap" },
] as const;

export type AccountSectionId = (typeof ACCOUNT_SECTIONS)[number]["id"];

const ACCOUNT_SECTION_ALIASES: Record<string, AccountSectionId> = {
  profile: "profile",
  profil: "profile",
  security: "security",
  guvenlik: "security",
  roles: "roles",
  roller: "roles",
  account: "account",
  hesap: "account",
};

export function accountSectionFromHash(hash: string): AccountSectionId {
  const value = hash.replace(/^#/, "");
  return ACCOUNT_SECTION_ALIASES[value] ?? "profile";
}

export function accountSectionPath(id: AccountSectionId): string {
  return id === "profile" ? "/app/profile" : `/app/profile#${id}`;
}

export function emailFieldHelp(hasGoogle: boolean): string {
  return hasGoogle
    ? "Google hesabınızdan gelir. Bu ortamda değiştirilemez."
    : EMAIL_CHANGE_UNAVAILABLE_MESSAGE;
}

export function ProfilePage() {
  const { data: session } = authClient.useSession();
  const { memberships, error: membershipsError } = useMemberships();
  const location = useLocation();
  const user = session?.user;
  const activeSection = accountSectionFromHash(location.hash);
  const [accounts, setAccounts] = useState<Array<{ providerId: string }> | null>(null);

  useEffect(() => {
    let active = true;
    void authClient
      .listAccounts()
      .then((result) => {
        if (active) setAccounts(result?.data ?? []);
      })
      .catch(() => {
        if (active) setAccounts([]);
      });
    return () => {
      active = false;
    };
  }, []);

  if (!user) {
    return (
      <div className="layout-account" role="status">
        <div className="surface-panel h-40 animate-pulse bg-surface-muted" />
      </div>
    );
  }

  const accountsLoaded = accounts !== null;
  const hasCredential = hasAuthProvider(accounts ?? [], "credential");
  const hasGoogle = hasAuthProvider(accounts ?? [], "google");

  return (
    <div className="layout-account">
      <header className="account-header">
        <h1 className="account-title">Hesap ayarları</h1>
        <p className="account-lead">Profilinizi, güvenliğinizi ve yarışma rollerinizi yönetin.</p>
        <div className="account-identity">
          <UserAvatar image={user.image} name={user.name ?? ""} size="md" />
          <div className="min-w-0">
            <p className="account-identity-name">{user.name}</p>
            <p className="account-identity-email">{user.email}</p>
            {accountsLoaded ? (
              <p className="account-identity-method">
                {authenticationMethodSummary(hasGoogle, hasCredential, true)}
              </p>
            ) : null}
          </div>
        </div>
      </header>

      <div className="account-center">
        <nav aria-label="Hesap bölümleri" className="account-nav">
          {ACCOUNT_SECTIONS.map((section) => (
            <Link
              aria-current={activeSection === section.id ? "page" : undefined}
              className={`account-nav-link ${activeSection === section.id ? "account-nav-link-active" : ""}`}
              key={section.id}
              to={accountSectionPath(section.id)}
            >
              {section.shortLabel === section.label ? (
                section.label
              ) : (
                <>
                  <span className="account-nav-label-full">{section.label}</span>
                  <span className="account-nav-label-short">{section.shortLabel}</span>
                </>
              )}
            </Link>
          ))}
        </nav>

        <div className="account-body">
          {activeSection === "profile" ? (
            <ProfileSection
              email={user.email}
              hasGoogle={hasGoogle}
              image={user.image}
              name={user.name ?? ""}
            />
          ) : null}
          {activeSection === "security" ? (
            <SecuritySection
              accountsLoaded={accountsLoaded}
              hasCredential={hasCredential}
              hasGoogle={hasGoogle}
            />
          ) : null}
          {activeSection === "roles" ? (
            <MembershipSection error={membershipsError} memberships={memberships} />
          ) : null}
          {activeSection === "account" ? (
            <AccountSection
              accountsLoaded={accountsLoaded}
              email={user.email}
              hasCredential={hasCredential}
              hasGoogle={hasGoogle}
              name={user.name ?? ""}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function ProfileSection({
  email,
  hasGoogle = false,
  image,
  name,
}: {
  email: string;
  hasGoogle?: boolean;
  image?: string | null | undefined;
  name: string;
}) {
  const nameId = useId();
  const statusId = useId();
  const [value, setValue] = useState(name);
  const [validation, setValidation] = useState<string | null>(null);
  const [status, setStatus] = useState<SaveStatus>("idle");

  useEffect(() => {
    setValue(name);
  }, [name]);

  const normalized = normalizeDisplayName(value);
  const isUnchanged = normalized === normalizeDisplayName(name);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (status === "saving") return;
    const message = displayNameValidationMessage(value);
    if (message) {
      setValidation(message);
      setStatus("idle");
      return;
    }
    setValidation(null);
    setStatus("saving");
    try {
      const result = await authClient.updateUser({ name: normalized });
      if (result.error) {
        setStatus("error");
        return;
      }
      await authClient.getSession();
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }

  const statusText =
    status === "saving"
      ? "Değişiklikler kaydediliyor…"
      : status === "saved"
        ? "Değişiklikler kaydedildi"
        : status === "error"
          ? "Kaydedilemedi. Tekrar deneyin."
          : null;

  return (
    <section aria-labelledby="profile-heading" className="account-section">
      <div className="account-section-head">
        <h2 className="account-section-title" id="profile-heading">
          Profil bilgileri
        </h2>
        <p className="account-section-lead">Platformda görünen temel hesap bilgileriniz.</p>
      </div>

      <div className="account-preview">
        <UserAvatar image={image} name={name} size="lg" />
        <div className="min-w-0">
          <p className="account-preview-name">{name}</p>
          <p className="account-preview-hint">
            {image ? "Google profil görseli" : "Baş harflerden üretilen avatar"}
          </p>
        </div>
      </div>

      <form className="account-form" onSubmit={onSubmit}>
        <div>
          <label className="field-label" htmlFor={nameId}>
            Görünen ad
          </label>
          <input
            aria-describedby={validation ? `${nameId}-error` : `${nameId}-help`}
            aria-invalid={validation ? true : undefined}
            autoComplete="name"
            className="field-input"
            id={nameId}
            maxLength={DISPLAY_NAME_MAX_LENGTH + 8}
            name="name"
            onChange={(event) => {
              setValue(event.target.value);
              setValidation(null);
              if (status === "saved" || status === "error") setStatus("idle");
            }}
            required
            value={value}
          />
          {validation ? (
            <p className="field-help text-critical" id={`${nameId}-error`} role="alert">
              {validation}
            </p>
          ) : (
            <p className="field-help" id={`${nameId}-help`}>
              Bu ad hakem ve yönetici arayüzlerinde görünür.
            </p>
          )}
        </div>

        <div>
          <p className="field-label">E-posta</p>
          <p className="field-static">{email}</p>
          <p className="field-help">{emailFieldHelp(hasGoogle)}</p>
        </div>

        <div className="account-form-actions">
          <button
            className="primary-button account-save-button"
            data-busy={status === "saving" ? "true" : undefined}
            disabled={isUnchanged || status === "saving"}
            type="submit"
          >
            {status === "saving" ? "Kaydediliyor…" : "Değişiklikleri kaydet"}
          </button>
          <p
            aria-live="polite"
            className={`text-sm ${status === "error" ? "text-critical" : "text-ink-subtle"}`}
            id={statusId}
            role={status === "error" ? "alert" : "status"}
          >
            {statusText}
          </p>
        </div>
      </form>
    </section>
  );
}

export function SecuritySection({
  accountsLoaded,
  hasCredential,
  hasGoogle,
}: {
  accountsLoaded: boolean;
  hasCredential: boolean;
  hasGoogle: boolean;
}) {
  return (
    <section aria-labelledby="security-heading" className="account-section">
      <div className="account-section-head">
        <h2 className="account-section-title" id="security-heading">
          Güvenlik
        </h2>
        <p className="account-section-lead">
          Hesabınıza bağlı giriş yöntemlerini ve oturum güvenliğini yönetin.
        </p>
      </div>

      <AuthMethodList hasCredential={hasCredential} hasGoogle={hasGoogle} loaded={accountsLoaded} />

      {accountsLoaded && hasCredential ? <ChangePasswordForm /> : null}
    </section>
  );
}

export function AuthMethodList({
  hasCredential,
  hasGoogle,
  loaded,
}: {
  hasCredential: boolean;
  hasGoogle: boolean;
  loaded: boolean;
}) {
  return (
    <ul className="auth-method-list">
      <li className="auth-method-card">
        <div>
          <p className="auth-method-title">Google</p>
          <p className="auth-method-copy">Google hesabınızla giriş yapabilirsiniz.</p>
        </div>
        <p className={`status-chip ${hasGoogle ? "status-chip-info" : "status-chip-neutral"}`}>
          {!loaded ? "Yükleniyor" : hasGoogle ? "Bağlı" : "Bağlı değil"}
        </p>
      </li>
      <li className="auth-method-card">
        <div>
          <p className="auth-method-title">E-posta ve şifre</p>
          <p className="auth-method-copy">
            {hasCredential
              ? "Bu hesap için e-posta ve şifre ile giriş yapabilirsiniz."
              : "Bu hesap için parola girişi kullanılmıyor."}
          </p>
        </div>
        <p className={`status-chip ${hasCredential ? "status-chip-info" : "status-chip-neutral"}`}>
          {!loaded ? "Yükleniyor" : hasCredential ? "Bağlı" : "Bağlı değil"}
        </p>
      </li>
    </ul>
  );
}

export function ChangePasswordForm() {
  const currentId = useId();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [revokeOtherSessions, setRevokeOtherSessions] = useState(true);
  const [validation, setValidation] = useState<string | null>(null);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (status === "saving") return;
    const passwordMessage = confirmPasswordValidationMessage(newPassword, confirmPassword);
    if (passwordMessage) {
      setValidation(passwordMessage);
      return;
    }
    setValidation(null);
    setError(null);
    setStatus("saving");
    try {
      const result = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions,
      });
      if (result.error) {
        setError(authErrorMessage(result.error));
        setStatus("error");
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setStatus("saved");
    } catch {
      setError(authErrorMessage(null));
      setStatus("error");
    }
  }

  return (
    <form className="account-form account-password-form" onSubmit={onSubmit}>
      <h3 className="account-subsection-title">Şifreyi değiştir</h3>
      <PasswordField
        autoComplete="current-password"
        id={currentId}
        label="Mevcut şifre"
        name="currentPassword"
        onChange={setCurrentPassword}
        value={currentPassword}
      />
      <PasswordField
        autoComplete="new-password"
        label="Yeni şifre"
        name="newPassword"
        onChange={(value) => {
          setNewPassword(value);
          setValidation(null);
        }}
        value={newPassword}
      />
      <PasswordField
        autoComplete="new-password"
        label="Yeni şifreyi doğrula"
        name="confirmNewPassword"
        onChange={(value) => {
          setConfirmPassword(value);
          setValidation(null);
        }}
        value={confirmPassword}
      />
      <label className="account-checkbox">
        <input
          checked={revokeOtherSessions}
          onChange={(event) => setRevokeOtherSessions(event.target.checked)}
          type="checkbox"
        />
        Diğer oturumları kapat
      </label>
      {validation ? (
        <p className="field-help text-critical" role="alert">
          {validation}
        </p>
      ) : null}
      {error ? (
        <p className="alert-error" role="alert">
          {error}
        </p>
      ) : null}
      {status === "saved" ? (
        <p className="text-sm text-ink-subtle" role="status">
          Şifre güncellendi
        </p>
      ) : null}
      <button
        className="primary-button account-save-button"
        data-busy={status === "saving" ? "true" : undefined}
        disabled={status === "saving"}
        type="submit"
      >
        {status === "saving" ? "Güncelleniyor…" : "Şifreyi değiştir"}
      </button>
    </form>
  );
}

export function MembershipSection({
  error,
  memberships,
}: {
  error: string | null;
  memberships: MembershipSummary[] | null;
}) {
  return (
    <section aria-labelledby="roles-heading" className="account-section">
      <div className="account-section-head">
        <h2 className="account-section-title" id="roles-heading">
          Roller ve Yarışmalar
        </h2>
        <p className="account-section-lead">
          Roller yarışma kapsamında atanır ve bu ekrandan değiştirilemez.
        </p>
      </div>
      {error ? (
        <p className="alert-error" role="alert">
          Üyelikler yüklenemedi: {error}
        </p>
      ) : memberships === null ? (
        <div className="space-y-2" role="status">
          <div className="h-24 rounded-lg bg-surface-muted" />
          <div className="h-24 rounded-lg bg-surface-muted" />
        </div>
      ) : memberships.length === 0 ? (
        <p className="text-sm leading-6 text-ink-muted">Henüz bir yarışma üyeliğiniz yok.</p>
      ) : (
        <ul className="membership-list">
          {memberships.map((membership) => (
            <MembershipCard
              key={`${membership.competitionId}:${membership.role}`}
              membership={membership}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

export function MembershipCard({ membership }: { membership: MembershipSummary }) {
  const workspace = membershipWorkspace(membership);
  return (
    <li className="membership-card">
      <p className="membership-card-title">{membership.competitionName}</p>
      <p className="membership-card-role">{ROLE_LABELS[membership.role]}</p>
      <p className="membership-card-copy">{workspace.summary}</p>
      <div className="membership-card-actions">
        {workspace.actions.map((action) => (
          <Link
            className={action.primary ? "primary-button" : "secondary-button"}
            key={action.to}
            to={action.to}
          >
            {action.label}
          </Link>
        ))}
      </div>
    </li>
  );
}

export function AccountSection({
  accountsLoaded = true,
  email,
  hasCredential,
  hasGoogle,
  name,
}: {
  accountsLoaded?: boolean;
  email: string;
  hasCredential: boolean;
  hasGoogle: boolean;
  name: string;
}) {
  const [isSigningOut, setIsSigningOut] = useState(false);

  return (
    <section aria-labelledby="account-heading" className="account-section">
      <div className="account-section-head">
        <h2 className="account-section-title" id="account-heading">
          Hesap
        </h2>
        <p className="account-section-lead">Hesap kimliği ve bu cihazdaki oturum.</p>
      </div>

      <div className="account-block">
        <h3 className="account-subsection-title">Hesap kimliği</h3>
        <dl className="account-meta">
          <div className="account-meta-row">
            <dt>Ad</dt>
            <dd>{name}</dd>
          </div>
          <div className="account-meta-row">
            <dt>E-posta</dt>
            <dd>{email}</dd>
          </div>
          <div className="account-meta-row">
            <dt>Giriş yöntemleri</dt>
            <dd>
              {accountsLoaded
                ? listedAuthenticationMethods(hasGoogle, hasCredential)
                : "Yükleniyor"}
            </dd>
          </div>
        </dl>
      </div>

      <div className="account-block account-session">
        <h3 className="account-subsection-title">Oturum</h3>
        <p className="account-session-copy">Bu cihazdaki oturumu sonlandırın.</p>
        <button
          className="secondary-button account-signout-button"
          disabled={isSigningOut}
          onClick={() => {
            setIsSigningOut(true);
            void authClient.signOut().then(() => {
              window.location.assign("/");
            });
          }}
          type="button"
        >
          {isSigningOut ? "Çıkılıyor…" : "Çıkış yap"}
        </button>
      </div>
    </section>
  );
}
