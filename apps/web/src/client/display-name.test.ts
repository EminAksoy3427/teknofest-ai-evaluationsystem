import { describe, expect, it } from "vitest";

import {
  DISPLAY_NAME_MAX_LENGTH,
  displayNameValidationMessage,
  normalizeDisplayName,
} from "./display-name";

describe("display name editing", () => {
  it("trims surrounding and repeated whitespace", () => {
    expect(normalizeDisplayName("  Ayşe   Yılmaz  ")).toBe("Ayşe Yılmaz");
  });

  it("rejects an empty or whitespace-only name", () => {
    expect(displayNameValidationMessage("")).toBe("Görünen ad boş olamaz.");
    expect(displayNameValidationMessage("   ")).toBe("Görünen ad boş olamaz.");
  });

  it("rejects a name that is too short or too long", () => {
    expect(displayNameValidationMessage("A")).toContain("en az");
    expect(displayNameValidationMessage("x".repeat(DISPLAY_NAME_MAX_LENGTH + 1))).toContain(
      "en fazla",
    );
  });

  it("accepts a reasonable trimmed name", () => {
    expect(displayNameValidationMessage("  Muhammet Emin Aksoy ")).toBeNull();
  });
});
