import type { MembershipSummary } from "@teknofest-ai/shared";

export const ROLE_LABELS = {
  COMPETITION_MANAGER: "Yarışma Yöneticisi",
  EVALUATION_MANAGER: "Değerlendirme Yöneticisi",
  REVIEWER: "Hakem",
  CONTESTANT: "Yarışmacı",
} as const satisfies Record<MembershipSummary["role"], string>;

export interface MembershipAction {
  label: string;
  to: string;
  primary?: boolean;
}

export interface MembershipWorkspace {
  summary: string;
  actions: MembershipAction[];
}

/**
 * Read-only, role-appropriate copy and CTAs. Summaries stay on already-loaded
 * memberships so the profile never fans out into N+1 configuration or queue requests.
 */
export function membershipWorkspace(membership: MembershipSummary): MembershipWorkspace {
  const base = `/app/competitions/${membership.competitionId}`;
  switch (membership.role) {
    case "COMPETITION_MANAGER":
      return {
        summary: "Kurulum, başvurular, hakem atamaları ve değerlendirme operasyonunu yönetir.",
        actions: [
          { label: "Kuruluma git", to: `${base}/setup`, primary: true },
          { label: "Başvurular", to: `${base}/submissions` },
          { label: "Değerlendirme", to: `${base}/operations` },
        ],
      };
    case "EVALUATION_MANAGER":
      return {
        summary: "Hakem atamaları, değerlendirme operasyonu ve geri bildirim sürecini yürütür.",
        actions: [
          { label: "Hakemler", to: `${base}/reviewers` },
          { label: "Değerlendirmeyi aç", to: `${base}/operations`, primary: true },
        ],
      };
    case "REVIEWER":
      return {
        summary:
          "Yalnız kendisine atanmış başvuruları inceler ve kendi değerlendirmesini gönderir.",
        actions: [{ label: "Atamalarımı aç", to: "/app/review", primary: true }],
      };
    case "CONTESTANT":
      return {
        summary: "Kendisine bağlı başvuruları ve yayımlanmış değerlendirme sonuçlarını görüntüler.",
        actions: [{ label: "Sonuçlarımı aç", to: "/app/results", primary: true }],
      };
  }
}

export function authenticationMethodSummary(
  hasGoogle: boolean,
  hasCredential: boolean,
  loaded: boolean,
): string {
  if (!loaded) return "Kimlik yöntemleri yükleniyor";
  if (hasGoogle && hasCredential) return "Google ve e-posta ile bağlı";
  if (hasGoogle) return "Google ile bağlı";
  if (hasCredential) return "E-posta ve şifre ile bağlı";
  return "Bağlı giriş yöntemi yok";
}

export function listedAuthenticationMethods(hasGoogle: boolean, hasCredential: boolean): string {
  return (
    [hasGoogle ? "Google" : null, hasCredential ? "E-posta ve şifre" : null]
      .filter(Boolean)
      .join(" · ") || "Yükleniyor"
  );
}
