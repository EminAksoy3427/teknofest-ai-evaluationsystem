import type { MembershipSummary } from "@teknofest-ai/shared";
import { describe, expect, it } from "vitest";

import { navigationLabelsFor } from "./app-shell";

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
