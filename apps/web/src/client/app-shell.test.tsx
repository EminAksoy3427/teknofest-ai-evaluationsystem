import type { MembershipSummary } from "@teknofest-ai/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";

import { AccountMenuPanel, navigationLabelsFor } from "./app-shell";

function membership(role: MembershipSummary["role"], competitionId = "comp-a"): MembershipSummary {
  return {
    competitionId,
    competitionName: "Sentetik Yarışma",
    competitionSlug: "sentetik-yarisma",
    role,
  };
}

describe("role-aware navigation visibility", () => {
  it("shows manager setup and submissions only for the competition manager", () => {
    expect(navigationLabelsFor([membership("COMPETITION_MANAGER")], "comp-a")).toEqual([
      "Genel Bakış",
      "Kurulum",
      "Başvurular",
      "Hakemler",
      "Değerlendirme",
    ]);
  });

  it("hides setup and submissions from the evaluation manager", () => {
    expect(navigationLabelsFor([membership("EVALUATION_MANAGER")], "comp-a")).toEqual([
      "Genel Bakış",
      "Hakemler",
      "Değerlendirme",
    ]);
  });

  it("does not expose manager navigation to a reviewer or contestant", () => {
    expect(navigationLabelsFor([membership("REVIEWER")], "comp-a")).toEqual([
      "Genel Bakış",
      "Atamalarım",
    ]);
    expect(navigationLabelsFor([membership("CONTESTANT")], "comp-a")).toEqual([
      "Genel Bakış",
      "Sonuçlarım",
    ]);
  });
});

describe("account menu", () => {
  it("offers profile and roles navigation and keeps logout available", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <AccountMenuPanel
          email="ayse@example.com"
          isSigningOut={false}
          name="Ayşe Yılmaz"
          onSignOut={() => undefined}
        />
      </MemoryRouter>,
    );
    expect(markup).toContain("Ayşe Yılmaz");
    expect(markup).toContain("ayse@example.com");
    expect(markup).toContain("Profilim");
    expect(markup).toContain("Roller ve Yarışmalar");
    expect(markup).toContain('href="/app/profile"');
    expect(markup).toContain('href="/app/profile#roles"');
    expect(markup).toContain("Çıkış yap");
    expect(markup).not.toContain("Rolü değiştir");
  });
});
