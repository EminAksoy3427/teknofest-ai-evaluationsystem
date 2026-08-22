import type { CompetitionConfigurationResponse } from "@teknofest-ai/shared";
import { describe, expect, it } from "vitest";

import { buildTasks } from "./setup-page";

function configuration(
  overrides: Partial<CompetitionConfigurationResponse["readiness"]>,
): CompetitionConfigurationResponse {
  return {
    competition: {
      id: "comp-a",
      name: "Sentetik Yarışma",
      slug: "sentetik",
      description: "",
      createdAt: 1,
      updatedAt: 1,
    },
    categories: [],
    templates: [],
    rubrics: [],
    readiness: {
      competition: true,
      categories: false,
      activeTemplate: false,
      activeTemplateFile: false,
      activeRubric: false,
      rubricHasCriteria: false,
      ready: false,
      ...overrides,
    },
  };
}

describe("setup task status", () => {
  it("reports incomplete report format and rubric in user language", () => {
    const tasks = buildTasks(configuration({}));
    expect(tasks.map((task) => task.title)).toEqual([
      "Yarışma bilgileri",
      "Kategoriler",
      "Rapor formatı",
      "Değerlendirme rubriği",
      "Son kontrol",
    ]);
    expect(tasks.find((task) => task.key === "templates")?.status).toMatch(/eksik|tanımlanmadı/i);
    expect(tasks.find((task) => task.key === "rubrics")?.status).toBe("Rubrik oluşturulmadı");
    expect(tasks.find((task) => task.key === "readiness")?.done).toBe(false);
  });

  it("marks the final check ready only when the derived readiness is ready", () => {
    const tasks = buildTasks(
      configuration({
        categories: true,
        activeTemplate: true,
        activeTemplateFile: true,
        activeRubric: true,
        rubricHasCriteria: true,
        ready: true,
      }),
    );
    expect(tasks.every((task) => task.done)).toBe(true);
    expect(tasks.at(-1)?.status).toBe("Hazır");
  });
});
