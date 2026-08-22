import type { MembershipSummary } from "@teknofest-ai/shared";
import { describe, expect, it } from "vitest";

import {
  authenticationMethodSummary,
  membershipWorkspace,
  ROLE_LABELS,
} from "./profile-memberships";

function membership(role: MembershipSummary["role"]): MembershipSummary {
  return {
    competitionId: "comp-a",
    competitionName: "Sentetik Yarışma",
    competitionSlug: "sentetik-yarisma",
    role,
  };
}

describe("role-aware profile workspace", () => {
  it("maps every role to a human label and a relevant CTA set", () => {
    expect(ROLE_LABELS.COMPETITION_MANAGER).toBe("Yarışma Yöneticisi");
    expect(ROLE_LABELS.EVALUATION_MANAGER).toBe("Değerlendirme Yöneticisi");
    expect(ROLE_LABELS.REVIEWER).toBe("Hakem");
    expect(ROLE_LABELS.CONTESTANT).toBe("Yarışmacı");

    expect(membershipWorkspace(membership("COMPETITION_MANAGER"))).toEqual({
      summary: "Kurulum, başvurular, hakem atamaları ve değerlendirme operasyonunu yönetir.",
      actions: [
        { label: "Kuruluma git", to: "/app/competitions/comp-a/setup", primary: true },
        { label: "Başvurular", to: "/app/competitions/comp-a/submissions" },
        { label: "Değerlendirme", to: "/app/competitions/comp-a/operations" },
      ],
    });
    expect(membershipWorkspace(membership("EVALUATION_MANAGER"))).toEqual({
      summary: "Hakem atamaları, değerlendirme operasyonu ve geri bildirim sürecini yürütür.",
      actions: [
        { label: "Hakemler", to: "/app/competitions/comp-a/reviewers" },
        { label: "Değerlendirmeyi aç", to: "/app/competitions/comp-a/operations", primary: true },
      ],
    });
    expect(membershipWorkspace(membership("REVIEWER"))).toEqual({
      summary: "Yalnız kendisine atanmış başvuruları inceler ve kendi değerlendirmesini gönderir.",
      actions: [{ label: "Atamalarımı aç", to: "/app/review", primary: true }],
    });
    expect(membershipWorkspace(membership("CONTESTANT"))).toEqual({
      summary: "Kendisine bağlı başvuruları ve yayımlanmış değerlendirme sonuçlarını görüntüler.",
      actions: [{ label: "Sonuçlarımı aç", to: "/app/results", primary: true }],
    });
  });

  it("never offers a self-service role mutation", () => {
    for (const role of [
      "COMPETITION_MANAGER",
      "EVALUATION_MANAGER",
      "REVIEWER",
      "CONTESTANT",
    ] as const) {
      const workspace = membershipWorkspace(membership(role));
      const copy = `${workspace.summary} ${workspace.actions.map((item) => item.label).join(" ")}`;
      expect(copy).not.toContain("Rolü değiştir");
      expect(copy).not.toContain("Üyelikten ayrıl");
      expect(copy).not.toContain("<select");
    }
  });

  it("does not imply configuration or submission access for evaluation managers", () => {
    const labels = membershipWorkspace(membership("EVALUATION_MANAGER")).actions.map(
      (item) => item.label,
    );
    expect(labels).not.toContain("Kuruluma git");
    expect(labels).not.toContain("Başvurular");
  });
});

describe("authentication method summary", () => {
  it("describes Google, credential and combined states", () => {
    expect(authenticationMethodSummary(true, false, true)).toBe("Google ile bağlı");
    expect(authenticationMethodSummary(false, true, true)).toBe("E-posta ve şifre ile bağlı");
    expect(authenticationMethodSummary(true, true, true)).toBe("Google ve e-posta ile bağlı");
  });
});
